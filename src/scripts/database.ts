/* ---------- Talking to the database ----------
   What the notes wall (src/scripts/notes.ts) and the contact form (src/scripts/contact.ts) share.
   Both keep what visitors send in one Supabase project, with the same rules:
   - Only the live site (dmaksimoff.com) and `npm run dev` talk to it. A built copy anywhere else
     (the browser checks, `npm run preview`) never does, so the checks can't post to it.
   - Each browser has a random ID, kept in localStorage and sent in the `x-notes-visitor` header,
     which the database counts sends by (3, then a 60-minute pause; supabase/notes-limit.sql and
     supabase/messages.sql). It says nothing about who the visitor is. One internet address (a
     home's or an office's Wi-Fi) has a limit of its own between all its browsers.
   - Past either limit the database answers 429, with the seconds left and which limit it was. */

export const SITE = 'dmaksimoff.com';

export const connected = (): boolean => import.meta.env.DEV || location.hostname === SITE || location.hostname === 'www.' + SITE;

// This browser's random ID, the same on every visit. Without localStorage (a private window that
// blocks it) it's new for each page, which only loosens this browser's own limit; the one per
// address still holds.
export function visitorId(): string {
  const KEY = 'notes-visitor';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const fresh = (): string => crypto.randomUUID?.()
    // Older browsers without randomUUID: the same random version-4 shape from getRandomValues
    ?? '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16));
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && UUID.test(saved)) return saved;
    const id = fresh();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return fresh();
  }
}

// What a 429 says: how long the pause has left, as "You can … another in 42 minutes." and in
// seconds (`details` is the seconds left; if it's missing, the whole pause, 60 minutes), and
// whether it's the limit for the visitor's whole network (`hint`) rather than for this browser
export async function pause(res: Response, verb: string): Promise<{ wait: string; seconds: number; network: boolean }> {
  const { details, hint } = await res.json().catch(() => ({ details: '', hint: '' }));
  const seconds = Number(details) > 0 ? Number(details) : 60 * 60;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return { wait: `You can ${verb} another in ${minutes} minute${minutes === 1 ? '' : 's'}.`, seconds, network: hint === 'network' };
}
