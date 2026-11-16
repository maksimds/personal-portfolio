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
   - Without JavaScript the form is hidden, and the section gives the email address instead. */
import { messagesApi, messagesKey, MESSAGES_IN_A_ROW } from '../data/contact';
import { site } from '../data/site';
import { SITE, connected, visitorId, pause } from './database';

export function initContactForm(): void {
  const form = document.querySelector<HTMLFormElement>('[data-contact-form]');
  if (!form) return;
  const status = form.querySelector<HTMLElement>('[data-contact-status]')!;
  const send = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const name = form.querySelector<HTMLInputElement>('input[name="name"]')!;
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')!;
  const message = form.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!;
  const fields = [name, email, message];

  let sending = false;

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
        const { wait, network } = await pause(res, 'send');
        busy(false);
        say(network
          ? `Lots of messages have come from your network in the last hour. ${wait}`
          : `That’s the limit of ${MESSAGES_IN_A_ROW} messages for now. ${wait}`);
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      form.reset();
      busy(false);
      say(`Thanks! I got your message and will write back to ${sent.email} as soon as I can.`);
    } catch {
      busy(false);
      say('Your message didn’t go through. Please try again,', true);
    }
  });
}
