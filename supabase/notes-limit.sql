-- How many notes one visitor can send on the notes wall (the table is set up in notes.sql):
-- 3, then a 60-minute pause that starts with the third note, then 3 more.
-- Run this whole file in the Supabase project's SQL Editor, after notes.sql. It's safe to run again,
-- for example after changing the numbers below: it replaces the rule and keeps the counts so far.
-- To take the limit off: `drop trigger limit_notes on public.notes;`.
--
-- - The site can't tell who a visitor is, so "one visitor" is one internet address. On IPv6, where a
--   home gets a whole block of addresses, it's the block (the address's first 64 bits). People on
--   the same network (an office, a school, some mobile networks) share their 3 notes.
-- - The address comes from Cloudflare, which sits in front of Supabase and sets `cf-connecting-ip`
--   itself. If that's missing, it's the first entry of `x-forwarded-for`, as Supabase's docs do.
-- - Only a fingerprint of the address (its SHA-256 hash) is kept, in private.note_senders, which the
--   site's key can't reach. A visitor is forgotten after a day without a note, unless they're paused.
-- - Past the limit, the database turns the note away with HTTP 429, and `details` in the reply is
--   how many seconds the pause has left; the site says how many minutes that is (src/scripts/notes.ts).
-- - Notes added in the dashboard (Table Editor, SQL Editor) don't come through the site's API, so
--   they're never counted or held back.
begin;

-- Supabase's API only serves the public schema, and the site's key (anon) gets nothing in this one
create schema if not exists private;

create table if not exists private.note_senders (
  sender       text        primary key,          -- the fingerprint of the visitor's address
  sent         integer     not null default 0,   -- notes since their last pause
  last_note    timestamptz not null default now(),
  paused_until timestamptz                       -- no notes from them until then
);
alter table private.note_senders enable row level security;   -- with no rules: only the dashboard and the function below reach it
revoke all on table private.note_senders from public, anon, authenticated;

create or replace function private.limit_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  most  constant integer  := 3;                      -- notes before a pause (src/data/notes.ts says the same)
  pause constant interval := interval '60 minutes';  -- how long the pause lasts
  headers text := nullif(current_setting('request.headers', true), '');
  address text;
  ip      inet;
  who     text;
  them    private.note_senders;
begin
  -- Not through the site's API (the dashboard): not counted
  if headers is null then
    return new;
  end if;

  address := trim(coalesce(
    nullif(headers::json->>'cf-connecting-ip', ''),
    nullif(split_part(headers::json->>'x-forwarded-for', ',', 1), ''),
    'unknown'));
  begin
    ip := address::inet;
    address := case when family(ip) = 6 then network(set_masklen(ip, 64))::text else host(ip) end;
  exception when invalid_text_representation then
    null;   -- not an address: count whatever was there
  end;
  who := encode(sha256(convert_to(address, 'UTF8')), 'hex');

  -- Forget anyone who hasn't sent a note for a day and isn't paused
  delete from private.note_senders
   where last_note < now() - interval '1 day'
     and (paused_until is null or paused_until <= now());

  -- Their row, locked, so two notes sent at the same moment are counted one after the other
  insert into private.note_senders (sender) values (who) on conflict (sender) do nothing;
  select * into them from private.note_senders where sender = who for update;

  if them.paused_until > now() then
    raise sqlstate 'PT429' using
      message = 'Too many notes',
      detail  = ceil(extract(epoch from them.paused_until - now()))::text;
  end if;

  update private.note_senders set
    sent         = case when them.sent + 1 >= most then 0 else them.sent + 1 end,
    paused_until = case when them.sent + 1 >= most then now() + pause end,
    last_note    = now()
   where sender = who;
  return new;
end;
$$;
revoke all on function private.limit_notes() from public, anon, authenticated;

drop trigger if exists limit_notes on public.notes;
create trigger limit_notes
  before insert on public.notes
  for each row execute function private.limit_notes();

commit;
