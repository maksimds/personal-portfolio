/* ---------- Drop in ----------
   Board objects with class "drop-in" start see-through and 8px higher, then settle into place
   (see "Drop in" in src/styles/styles.css) once their top is 48px into view. Objects that come in
   together follow each other 0.06s apart, in page order; after the eighth they come together, so
   a long page doesn't keep you waiting. On a page laid out as a canvas nothing is scrolled to, so
   they all drop in as the page opens (src/scripts/board.ts calls showAllDropIns). The older class
   "reveal" counts as "drop-in": a case study's file can still carry it on a line of its own. */
const DROP = '.drop-in, .reveal';
function show(list: HTMLElement[]): void {
  list.forEach((el, i) => {
    el.style.setProperty('--drop-delay', Math.min(i, 8) * 0.06 + 's');
    el.classList.add('is-visible');
  });
}

export function showAllDropIns(): void {
  show(Array.from(document.querySelectorAll<HTMLElement>(DROP)).filter((el) => !el.classList.contains('is-visible')));
}

export function initDropIn(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(DROP));
  if (!('IntersectionObserver' in window) || document.documentElement.classList.contains('is-canvas')) {
    show(els);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    const seen = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement);
    seen.forEach((el) => io.unobserve(el));
    show(seen.filter((el) => !el.classList.contains('is-visible')));
  }, { rootMargin: '0px 0px -48px 0px' });
  // Something that isn't drawn at this screen size (the intro's portrait on a phone) can never come
  // into view, so it's marked as shown now: it's there, settled, if the screen later has room for it
  show(els.filter((el) => !el.getClientRects().length));
  els.filter((el) => el.getClientRects().length).forEach((el) => io.observe(el));
}
