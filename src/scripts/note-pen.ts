/* ---------- The "Leave me a note" sticker's pen ----------
   The ✍️ on the home page's note sticker (src/components/home/NotePen.astro) writes while the
   sticker is pointed at, or reached with the keyboard: the class is-writing plays its loop (see
   "The note sticker's pen" in src/styles/styles.css) over and over. Once it's neither, the class
   comes off at the end of the loop, not in the middle of it, so the hand always finishes its line
   and the ink always fades. A finger "points at" the sticker only as it taps it, and goes to
   About, so on a touch screen it doesn't write. Nothing plays for visitors who have turned on
   reduced motion (the styles). */
export function initNotePen(): void {
  document.querySelectorAll<HTMLElement>('.note-pen').forEach((pen) => {
    const link = pen.closest<HTMLElement>('a') ?? pen;
    let pointed = false;
    let focused = false;
    const update = (): void => {
      if (pointed || focused) pen.classList.add('is-writing');
      // Not playing (reduced motion): there's no loop to finish
      else if (!pen.getAnimations({ subtree: true }).length) pen.classList.remove('is-writing');
    };
    link.addEventListener('pointerenter', (e) => { pointed = e.pointerType !== 'touch'; update(); });
    link.addEventListener('pointerleave', () => { pointed = false; update(); });
    link.addEventListener('focus', () => { focused = link.matches(':focus-visible'); update(); });
    link.addEventListener('blur', () => { focused = false; update(); });
    // The hand and the ink loop together; the hand's loop ending is the end of a line
    const hand = pen.querySelector('.note-pen__hand');
    pen.addEventListener('animationiteration', (e) => {
      if (e.target === hand && !pointed && !focused) pen.classList.remove('is-writing');
    });
  });
}
