// The contact form on the Contact page (src/pages/contact.astro, src/scripts/contact.ts) keeps its
// messages in the same Supabase database as the notes wall, in a table of their own. The address
// and the publishable key are meant to be public: the database's own rules (supabase/messages.sql)
// let them add a message and nothing else, so no visitor can read one. INSTRUCTIONS.md, "Contact
// page", says where to read them.
export const messagesApi = 'https://fappycbsffjhdzxyutav.supabase.co/rest/v1/messages';
export { notesKey as messagesKey } from './notes';   // one key for the whole project

// The longest each field can be: the database refuses anything longer
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const MESSAGE_MAX = 2000;

// How many messages one browser can send before a pause, and how long the pause is: the database
// holds it to that (supabase/messages.sql, which also allows 10 an hour per internet address).
// These are only for what the form says: the message when the database turns one away, and
// whether it offers to send another after one goes through
export const MESSAGES_IN_A_ROW = 3;
export const MESSAGES_PAUSE_MINUTES = 60;
