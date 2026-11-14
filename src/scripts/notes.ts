/* ---------- The notes wall (About page) ----------
   Fills the "Notes" section (src/components/about/Notes.astro): loads the newest approved notes
   from the database and shows each as a sticky, and sends a new note from the form. A new note
   isn't shown straight away: it waits for approval in Supabase's Table Editor, so after posting
   the section just thanks the visitor.
   - Only the live site (dmaksimoff.com) and `npm run dev` talk to the database. A built copy
     anywhere else (the browser checks, `npm run preview`) never does, so the checks don't depend
     on it and can't post to it; there the section says where the notes are.
   - Visitors' words and names go on the page as plain text, never as markup.
   - A note is sent with `Prefer: return=minimal`: the database won't hand back a note it hasn't
     approved, so asking for it back would fail the whole post (see supabase/notes.sql). */
import { notesApi, notesKey, NOTES_SHOWN, NOTE_COLORS } from '../data/notes';

interface Note { id: string; author_name: string; message: string; color: string; }

const SITE = 'dmaksimoff.com';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';   // --ease-out in styles.css, as the objects dropping in use
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const connected = (): boolean => import.meta.env.DEV || location.hostname === SITE || location.hostname === 'www.' + SITE;

// A slight turn for each note, the same every time it's shown: from its id, -1.5 to 1.5 degrees
// (the Sticky component's range). It only shows on the canvas, without reduced motion (styles.css).
function tilt(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 31 - 15) / 10;
}

export function initNotes(): void {
  const root = document.querySelector<HTMLElement>('[data-notes]');
  const form = root?.querySelector<HTMLFormElement>('[data-notes-form]');
  const template = root?.querySelector<HTMLTemplateElement>('[data-notes-template]');
  if (!root || !form || !template) return;
  const list = root.querySelector<HTMLElement>('[data-notes-list]')!;
  const empty = root.querySelector<HTMLElement>('[data-notes-empty]')!;
  const status = root.querySelector<HTMLElement>('[data-notes-status]')!;
  const open = root.querySelector<HTMLButtonElement>('[data-notes-open]')!;
  const post = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const message = form.querySelector<HTMLTextAreaElement>('textarea')!;
  const name = form.querySelector<HTMLInputElement>('input')!;

  const showEmpty = (text: string): void => {
    empty.textContent = text;
    empty.hidden = !text;
  };

  /* ----- The notes ----- */

  function render(notes: Note[]): void {
    list.replaceChildren(...notes.map((note) => {
      const item = template!.content.firstElementChild!.cloneNode(true) as HTMLElement;
      item.classList.replace('sticky--yellow', `sticky--${NOTE_COLORS.includes(note.color) ? note.color : 'yellow'}`);
      item.style.setProperty('--tilt', `${tilt(note.id)}deg`);
      item.querySelector('.sticky__text p')!.textContent = note.message;
      item.querySelector('.sticky__author')!.textContent = note.author_name;
      return item;
    }));
  }

  async function load(): Promise<void> {
    if (!connected()) {
      showEmpty(`Notes show on ${SITE}.`);
      return;
    }
    try {
      const res = await fetch(`${notesApi}?select=id,author_name,message,color&order=created_at.desc&limit=${NOTES_SHOWN}`, {
        headers: { apikey: notesKey },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const notes = (await res.json()) as Note[];
      render(notes);
      showEmpty(notes.length ? '' : 'No notes yet. Leave the first one!');
    } catch {
      showEmpty('The notes couldn’t load just now. Try again later.');
    }
  }

  /* ----- Writing one ----- */

  let sending = false;
  let motion: Animation | null = null;
  let closedHeight = 0;   // the "New note" button's height, which the form grows from and shrinks back to

  // Opens the form in place of the "New note" button, or closes it again (keeping what was
  // written). The form grows out of the button's size into a full sticky, pushing the notes under it
  // down as it goes, and shrinks back into it when it closes; at once for reduced motion. Closed
  // from the keyboard or by posting, the keyboard's place goes back to the button; closed by a
  // click somewhere else, it stays where that click put it.
  function writing(on: boolean, refocus = true): void {
    if (on === !form!.hidden && !motion) return;
    motion?.cancel();
    motion = null;
    const smooth = !calm.matches && 'animate' in form!;

    if (on) {
      closedHeight = open.offsetHeight || closedHeight;
      open.hidden = true;
      form!.hidden = false;
      message.focus();
      if (smooth) {
        motion = form!.animate(
          [{ height: `${closedHeight}px`, opacity: 0 }, { opacity: 1, offset: 0.35 }, { height: `${form!.offsetHeight}px`, opacity: 1 }],
          { duration: 450, easing: EASE },
        );
        motion.onfinish = () => { motion = null; };
      }
      return;
    }

    const shut = (): void => {
      motion = null;
      form!.hidden = true;
      open.hidden = false;
      if (refocus) open.focus();
      if (smooth) open.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    };
    if (!smooth) return shut();
    motion = form!.animate(
      [{ height: `${form!.offsetHeight}px`, opacity: 1 }, { opacity: 0, offset: 0.7 }, { height: `${closedHeight}px`, opacity: 0 }],
      { duration: 320, easing: EASE },
    );
    motion.onfinish = shut;
  }

  // While a note is on its way, the fields can't be changed, but they keep the keyboard's place
  function busy(on: boolean): void {
    sending = on;
    message.readOnly = on;
    name.readOnly = on;
    post.textContent = on ? 'Posting…' : 'Post';
    post.setAttribute('aria-disabled', String(on));
  }

  open.addEventListener('click', () => {
    status.textContent = '';
    writing(true);
  });

  // A click anywhere outside the notes section closes the form, keeping what was written. Only a
  // click that starts and ends outside it: scrolling, panning, moving a block and selecting text
  // that runs past the section's edge don't count.
  const section = root.closest('.board-section') ?? root;
  const outside = (e: Event): boolean => !(e.target instanceof Node && section.contains(e.target));
  let pressedOutside = false;
  document.addEventListener('pointerdown', (e) => { pressedOutside = outside(e); }, true);
  document.addEventListener('click', (e) => {
    if (pressedOutside && outside(e) && !form.hidden && !sending) writing(false, false);
  }, true);
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sending) {
      e.preventDefault();
      writing(false);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const note = { author_name: name.value.trim(), message: message.value.trim() };
    // Only spaces or line breaks get past the browser's own check for an empty field
    if (!note.message || !note.author_name) {
      status.textContent = note.message ? 'Add your name, then post your note.' : 'Write a note first.';
      (note.message ? name : message).focus();
      return;
    }
    if (!connected()) {
      status.textContent = `Notes can only be posted on ${SITE}.`;
      return;
    }

    busy(true);
    status.textContent = '';
    try {
      const res = await fetch(notesApi, {
        method: 'POST',
        headers: { apikey: notesKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(note),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      form.reset();
      busy(false);
      writing(false);
      status.textContent = 'Thanks! Your note will show here once I’ve read it.';
    } catch {
      busy(false);
      status.textContent = 'Your note didn’t go through. Please try again.';
    }
  });

  load();
}
