// The notes wall on the About page (src/components/about/Notes.astro, src/scripts/notes.ts) keeps
// its notes in a Supabase database. Its address and its publishable key are meant to be public:
// the database's own rules (supabase/notes.sql) decide what they can do, which is read approved
// notes and add a note that waits for approval. INSTRUCTIONS.md, "Notes wall", says how to approve one.
export const notesApi = 'https://fappycbsffjhdzxyutav.supabase.co/rest/v1/notes';
export const notesKey = 'sb_publishable_8zdvC2CGkzG8rP3qThJl3Q_sokZ80ap';

// The longest a note and a name can be: the database refuses anything longer
export const MESSAGE_MAX = 200;
export const NAME_MAX = 40;

// How many notes one visitor can send before a 60-minute pause: the database holds them to it
// (supabase/notes-limit.sql), and this is only for the message the form shows when it does
export const NOTES_IN_A_ROW = 3;

// How many of the newest approved notes the wall shows
export const NOTES_SHOWN = 12;

// The sticky colours a note can have: the database picks one at random as the note comes in
export const NOTE_COLORS = ['yellow', 'orange', 'pink', 'violet', 'blue', 'teal', 'green'];
