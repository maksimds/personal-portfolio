-- The notes wall on the About page (src/components/about/Notes.astro, src/scripts/notes.ts).
-- This was run once in the Supabase project's SQL Editor on 2026-11-14, and is kept here as the
-- record of how the database is set up. Running it again fails, because the table already exists.
-- To start over: `drop table public.notes;`, then run this.
--
-- Anyone can leave a note; it stays hidden until it's approved in Supabase's Table Editor.
-- The site uses the project's publishable key, which acts as the "anon" role below: it can read
-- approved notes and add a name and a message, nothing else. The dashboard isn't held by these rules.
-- How many notes one visitor can send (3, then a 60-minute pause) is in notes-limit.sql.
begin;

create table public.notes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  author_name text        not null check (char_length(author_name) <= 40 and author_name ~ '\S'),
  message     text        not null check (char_length(message) <= 200 and message ~ '\S'),
  -- A random sticky colour, picked when the note comes in
  color       text        not null
              default (array['yellow','orange','pink','violet','blue','teal','green'])[1 + floor(random() * 7)::int]
              check (color in ('yellow','orange','pink','violet','blue','teal','green')),
  approved    boolean     not null default false
);

-- Who can do what. Your site will use Supabase's public key, which acts as the "anon" role.
alter table public.notes enable row level security;

revoke all on table public.notes from anon, authenticated;
grant select on table public.notes to anon;                          -- read notes...
grant insert (author_name, message) on table public.notes to anon;   -- ...and add a name and a message, nothing else

create policy "Visitors see approved notes only"
  on public.notes for select to anon
  using (approved);

create policy "New notes always wait for approval"
  on public.notes for insert to anon
  with check (approved = false);

commit;
