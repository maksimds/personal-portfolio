/* ---------- The contact form (Contact page) ----------
   Sends the form on the Contact page (src/pages/contact.astro): a name, an email address and a
   message go into the database's "messages" table, where Denis reads them in Supabase's Table
   Editor. Nothing is ever read back: visitors can only add a message (supabase/messages.sql).
   - Only the live site and `npm run dev` talk to the database (src/scripts/database.ts); anywhere
     else the form says where it works and sends nothing.
   - A message is sent with `Prefer: return=minimal`: visitors can't read the table, so asking for
     the new row back would fail the whole send.
   - Each browser can send 3 messages, then waits 60 minutes; one internet address gets 10 an hour
     between all its browsers. The database holds them to it and answers 429; the form says how
     long is left and keeps what was written.
   - Once a message is sent, the form gives way to the thanks and a "Send another message" button,
     which brings the form back with the name and email address still in it. Each swap is eased:
     the one showing fades out, then the section eases to the other's height as it fades in (at
     once with reduced motion). The button isn't
     there while this browser is paused; it comes back when the pause is over. The database only
     says it's paused when a message is turned away, so the browser keeps a count of its own, the
     same way (see countSent).
   - Without JavaScript the form is hidden, and the section gives the email address instead. */
import { messagesApi, messagesKey, MESSAGES_IN_A_ROW, MESSAGES_PAUSE_MINUTES } from '../data/contact';
import { site } from '../data/site';
import { SITE, connected, visitorId, pause } from './database';

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';   // --ease-out in styles.css, as the notes wall's form uses
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// This browser's messages, counted as the database counts them (private.count_note in
// supabase/notes-limit.sql): after MESSAGES_IN_A_ROW, a pause, then from 0 again; and one that
// hasn't sent anything for a day starts again from 0. Kept in localStorage, or for this page only
// without it.
type Sent = { sent: number; last: number; pausedUntil: number };
const SENT_KEY = 'contact-sent';
const DAY = 24 * 60 * 60 * 1000;
let sentHere: Sent = { sent: 0, last: 0, pausedUntil: 0 };

function sentSoFar(): Sent {
  try {
    const saved = JSON.parse(localStorage.getItem(SENT_KEY) ?? 'null');
    if (saved && [saved.sent, saved.last, saved.pausedUntil].every(Number.isFinite)) sentHere = saved;
  } catch { /* nothing kept, or not readable: what this page counted */ }
  return { ...sentHere };
}
function keep(count: Sent): void {
  sentHere = count;
  try { localStorage.setItem(SENT_KEY, JSON.stringify(count)); } catch { /* this page only */ }
}
// One more sent; returns when this browser can send the next one (now, or when its pause is over)
function countSent(): number {
  const now = Date.now();
  const count = sentSoFar();
  if (count.last < now - DAY && count.pausedUntil <= now) count.sent = 0;
  count.sent += 1;
  count.last = now;
  if (count.sent >= MESSAGES_IN_A_ROW) {
    count.sent = 0;
    count.pausedUntil = now + MESSAGES_PAUSE_MINUTES * 60 * 1000;
  }
  keep(count);
  return Math.max(now, count.pausedUntil);
}

export function initContactForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form) return;
  const status = form.querySelector<HTMLElement>('[data-contact-status]')!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const message = form.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!;
  const fields = [name, email, message];
  const views = document.querySelector<HTMLElement>('[data-contact-views]')!;
  const done = document.querySelector<HTMLElement>('[data-contact-sent]')!;
  const thanks = done.querySelector<HTMLElement>('[data-contact-sent-text]')!;
  const again = done.querySelector<HTMLButtonElement>('[data-contact-again]')!;

  let sending = false;
  let paused: number | undefined;
  let motion: Animation[] = [];

  // Swaps the view showing (the form, or the thanks) for `next`: the one showing fades out, a
  // little up; then, swapped, the section eases from its height to the new one's as that fades in,
  // rising into place. `ready` runs as they swap, to put the keyboard's place in the new one. A
  // swap started during another takes over from wherever that one has got to.
  function show(next: HTMLElement, ready: () => void): void {
    const current = next === form ? done : form;
    motion.forEach((a) => a.cancel());
    motion = [];
    views.style.overflow = '';
    const swap = (): void => {
      current.hidden = true;
      next.hidden = false;
      ready();
    };
    if (calm.matches || !('animate' in views) || current.hidden) return swap();

    const from = views.offsetHeight;
    const out = current.animate([{ opacity: 1 }, { opacity: 0, translate: '0 -4px' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    motion = [out];
    out.onfinish = () => {
      swap();
      out.cancel();
      const to = views.offsetHeight;
      views.style.overflow = 'hidden';   // what's coming in shows only as the section makes room for it
      const grow = views.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 420, easing: EASE });
      const appear = next.animate(
        [{ opacity: 0, translate: '0 8px' }, { opacity: 0, translate: '0 8px', offset: 0.15 }, { opacity: 1, translate: '0 0' }],
        { duration: 420, easing: EASE },
      );
      motion = [grow, appear];
      grow.onfinish = () => {
        views.style.overflow = '';
        motion = [];
      };
    };
  }

  // The form gives way to the thanks; the button to send another shows when this browser can
  function sentTo(address: string, nextAt: number): void {
    thanks.textContent = `Thanks! I got your message and will write back to ${address} as soon as I can.`;
    clearTimeout(paused);
    again.hidden = nextAt > Date.now();
    if (again.hidden) paused = window.setTimeout(() => { again.hidden = false; }, nextAt - Date.now());
    show(done, () => thanks.focus());
  }

  // Back to the form, its message empty, for the next one
  again.addEventListener('click', () => show(form, () => message.focus()));

  // What happened, read out by screen readers. With `offerEmail`, the email address follows as a
  // link, for when the form can't get the message through.
  function say(text: string, offerEmail = false): void {
    if (!offerEmail) {
      status.textContent = text;
      return;
    }
    const link = document.createElement('a');
    link.className = 'link';
    link.href = `mailto:${site.email}`;
    link.textContent = site.email;
    status.replaceChildren(`${text} or email me at `, link, '.');
  }

  // While a message is on its way, the fields can't be changed, but they keep the keyboard's place
  function busy(on: boolean): void {
    sending = on;
    for (const field of fields) field.readOnly = on;
    send.textContent = on ? 'Sending…' : 'Send message';
    send.setAttribute('aria-disabled', String(on));
  }

  // ⌘ or Ctrl + Enter sends, from any field
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  // The browser has already checked that every field is filled in and the email looks like one
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return;
    const sent = { name: name.value.trim(), email: email.value.trim(), message: message.value.trim() };
    // Only spaces or line breaks get past the browser's own check for an empty field
    const blank = !sent.name ? name : !sent.message ? message : null;
    if (blank) {
      say(blank === name ? 'Add your name, then send your message.' : 'Write a message first.');
      blank.focus();
      return;
    }
    if (!connected()) {
      say(`Messages can only be sent on ${SITE}.`);
      return;
    }

    busy(true);
    say('');
    try {
      const res = await fetch(messagesApi, {
        method: 'POST',
        headers: { apikey: messagesKey, 'Content-Type': 'application/json', Prefer: 'return=minimal', 'x-notes-visitor': visitorId() },
        body: JSON.stringify(sent),
      });
      if (res.status === 429) {
        // Paused, by this browser's limit or the one for its whole network
        const { wait, seconds, network } = await pause(res, 'send');
        // This browser's pause, as the database has it, so the count here agrees from now on
        if (!network) keep({ sent: 0, last: Date.now(), pausedUntil: Date.now() + seconds * 1000 });
        busy(false);
        say(network
          ? `Lots of messages have come from your network in the last hour. ${wait}`
          : `That’s the limit of ${MESSAGES_IN_A_ROW} messages for now. ${wait}`);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      // Emptied for the next one, but for the name and the address. (Emptying only the message
      // would leave it marked as a field left empty, with a red edge, until it's typed in.)
      form.reset();
      name.value = sent.name;
      email.value = sent.email;
      busy(false);
      sentTo(sent.email, countSent());
    } catch {
      busy(false);
      say('Your message didn’t go through. Please try again,', true);
    }
  });
}
