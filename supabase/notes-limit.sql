-- How many notes visitors can send on the notes wall (the table is set up in notes.sql):
-- - each browser: 3 notes, then a 60-minute pause that starts with the third note, then 3 more;
-- - each internet address, however many browsers share it (a home's or an office's Wi-Fi): 10
--   notes, then the same 60-minute pause. This one is the real guard against a flood: a new browser
--   ID is easy to get, a new address isn't.
-- Run this whole file in the Supabase project's SQL Editor, after notes.sql. It's safe to run again,
-- for example after changing the numbers below: it replaces the rule and keeps the counts so far.
-- To take the limit off: `drop trigger limit_notes on public.notes;`.
-- History: first run on 2026-11-14 counting by address only, which put everyone on one Wi-Fi under
-- one limit of 3; replaced the same evening by this version, which counts each browser.
--
-- - The browser: the site gives each browser a random ID (src/scripts/notes.ts) and sends it with a
--   note in the `x-notes-visitor` header. It says nothing about who the visitor is. A note without a
--   proper ID (not sent from the site) is held to 3 for its whole address, so leaving it off doesn't
--   help.
-- - The address comes from Cloudflare, which sits in front of Supabase and sets `cf-connecting-ip`
--   itself. If that's missing, it's the first entry of `x-forwarded-for`, as Supabase's docs do. On
--   IPv6, where a home gets a whole block of addresses, it's the block (the first 64 bits).
-- - Only fingerprints (SHA-256 hashes) of IDs and addresses are kept, in private.note_senders, which
--   the site's key can't reach. Each is forgotten after a day without a note, unless it's paused.
-- - Past a limit, the database turns the note away with HTTP 429: `details` in the reply is how many
--   seconds the pause has left, and `hint` says which limit it was ("browser" or "network"), for the
--   message the site shows.
-- - Notes added in the dashboard (Table Editor, SQL Editor) don't come through the site's API, so
--   they're never counted or held back.
begin;

-- Supabase's API only serves the public schema, and the site's key (anon) gets nothing in this one
create schema if not exists private;

create table if not exists private.note_senders (
  sender       text        primary key,          -- "browser:", "network:" or "no-id:" and a fingerprint
  sent         integer     not null default 0,   -- notes since their last pause
  last_note    timestamptz not null default now(),
  paused_until timestamptz                       -- no notes from them until then
);
alter table private.note_senders enable row level security;   -- with no rules: only the dashboard and the functions below reach it
revoke all on table private.note_senders from public, anon, authenticated;

-- Counts kept by the first version (a bare fingerprint of an address, with no "kind:" in front)
-- mean nothing to this one; dropping them also lifts any pause they had set
delete from private.note_senders where position(':' in sender) = 0;

-- Counts one note for one sender, or turns it away while that sender is paused
create or replace function private.count_note(who text, most integer, pause interval, kind text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  them private.note_senders;
begin
  -- Their row, locked, so two notes sent at the same moment are counted one after the other
  insert into private.note_senders (sender) values (who) on conflict (sender) do nothing;
  select * into them from private.note_senders where sender = who for update;

  if them.paused_until > now() then
    raise sqlstate 'PT429' using
      message = 'Too many notes',
      detail  = ceil(extract(epoch from them.paused_until - now()))::text,
      hint    = kind;
  end if;

  update private.note_senders set
    sent         = case when them.sent + 1 >= most then 0 else them.sent + 1 end,
    paused_until = case when them.sent + 1 >= most then now() + pause end,
    last_note    = now()
   where sender = who;
end;
$$;
revoke all on function private.count_note(text, integer, interval, text) from public, anon, authenticated;

create or replace function private.limit_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  per_browser constant integer  := 3;                      -- src/data/notes.ts says the same, for the message
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

  -- Forget anyone who hasn't sent a note for a day and isn't paused
  delete from private.note_senders
   where last_note < now() - interval '1 day'
     and (paused_until is null or paused_until <= now());

  -- The browser first, then its address. If either is paused the note is turned away, and nothing
  -- is counted for the other: an error undoes the whole insert.
  if browser is not null then
    perform private.count_note('browser:' || encode(sha256(convert_to(browser, 'UTF8')), 'hex'), per_browser, pause, 'browser');
  else
    perform private.count_note('no-id:' || encode(sha256(convert_to(address, 'UTF8')), 'hex'), per_browser, pause, 'browser');
  end if;
  perform private.count_note('network:' || encode(sha256(convert_to(address, 'UTF8')), 'hex'), per_network, pause, 'network');
  return new;
end;
$$;
revoke all on function private.limit_notes() from public, anon, authenticated;

drop trigger if exists limit_notes on public.notes;
create trigger limit_notes
  before insert on public.notes
  for each row execute function private.limit_notes();

-- The look at the request headers used to find out what the database sees (2026-11-14), no longer needed
drop function if exists public.notes_debug();

commit;
