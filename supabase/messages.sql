-- The contact form on the Contact page (src/pages/contact.astro, src/scripts/contact.ts).
-- Run this whole file once in the Supabase project's SQL Editor, after notes.sql and
-- notes-limit.sql (it uses the counting that notes-limit.sql sets up). It's safe to run again, for
-- example after changing the numbers in private.limit_messages() below: it keeps the table, its
-- messages and the counts so far, and replaces the rules.
--
-- Visitors can send a message (a name, an email address and the message) and nothing else: they
-- can't read the table, not even what they just sent, so the site posts with `Prefer: return=minimal`.
-- Messages are read in Supabase's Table Editor (the "messages" table), where `replied` is a box to
-- tick once you've written back. The site uses the project's publishable key, which acts as the
-- "anon" role below; the dashboard isn't held by these rules.
--
-- How many messages one visitor can send: like the notes, each browser gets 3, then a 60-minute
-- pause, and each internet address 10 between all its browsers. The browser's ID and the address
-- are worked out as in notes-limit.sql, and counted in the same private.note_senders under names of
-- their own ("message-browser:", "message-network:", "message-no-id:"), so sending messages never
-- uses up anyone's notes, or the other way round. Past a limit the database answers 429, with the
-- seconds left in `details` and which limit it was in `hint`.
-- To take the limit off: `drop trigger limit_messages on public.messages;`.
begin;

create table if not exists public.messages (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text        not null check (char_length(name) <= 100 and name ~ '\S'),
  email      text        not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message    text        not null check (char_length(message) <= 2000 and message ~ '\S'),
  -- Ticked by hand in the Table Editor once you've written back
  replied    boolean     not null default false
);

-- Who can do what. The site's key acts as the "anon" role: it can add a name, an email address and
-- a message, and can't read, change or delete anything.
alter table public.messages enable row level security;

revoke all on table public.messages from anon, authenticated;
grant insert (name, email, message) on table public.messages to anon;

drop policy if exists "Visitors can send a message" on public.messages;
create policy "Visitors can send a message"
  on public.messages for insert to anon
  with check (replied = false);

-- The limit: counts one message for this browser and this address, or turns it away while either
-- is paused (private.count_note, from notes-limit.sql)
create or replace function private.limit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  per_browser constant integer  := 3;                      -- src/data/contact.ts says the same, for the message
  per_network constant integer  := 10;
  pause       constant interval := interval '60 minutes';
  headers json := nullif(current_setting('request.headers', true), '')::json;
  address text;
  ip      inet;
  browser text;
begin
  -- Not through the site's API (the dashboard): not counted
  if headers is null then
    return new;
  end if;

  address := trim(coalesce(
    nullif(headers->>'cf-connecting-ip', ''),
    nullif(split_part(headers->>'x-forwarded-for', ',', 1), ''),
    'unknown'));
  begin
    ip := address::inet;
    address := case when family(ip) = 6 then network(set_masklen(ip, 64))::text else host(ip) end;
  exception when invalid_text_representation then
    null;   -- not an address: count whatever was there
  end;

  browser := lower(trim(headers->>'x-notes-visitor'));
  if browser is null or browser !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    browser := null;
  end if;

  -- Forget anyone who hasn't sent anything for a day and isn't paused
  delete from private.note_senders
   where last_note < now() - interval '1 day'
     and (paused_until is null or paused_until <= now());

  -- The browser first, then its address. If either is paused the message is turned away, and
  -- nothing is counted for the other: an error undoes the whole insert.
  if browser is not null then
    perform private.count_note('message-browser:' || encode(sha256(convert_to(browser, 'UTF8')), 'hex'), per_browser, pause, 'browser');
  else
    perform private.count_note('message-no-id:' || encode(sha256(convert_to(address, 'UTF8')), 'hex'), per_browser, pause, 'browser');
  end if;
  perform private.count_note('message-network:' || encode(sha256(convert_to(address, 'UTF8')), 'hex'), per_network, pause, 'network');
  return new;
end;
$$;
revoke all on function private.limit_messages() from public, anon, authenticated;

drop trigger if exists limit_messages on public.messages;
create trigger limit_messages
  before insert on public.messages
  for each row execute function private.limit_messages();

commit;
