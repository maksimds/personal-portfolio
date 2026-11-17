/* ---------- The notes wall's view (About page, on the canvas) ----------
   How the notes sit in their section on the canvas (src/components/about/Notes.astro; the styles
   are "The notes wall" in styles.css). On a page that scrolls (phones, "View as list") none of it
   shows: the notes are all there, one after another.
   - Scrolling: past ROWS rows the notes scroll inside the section instead of making it taller.
     The list is cut PEEK px into the next row, so the tops of its notes show at the section's
     bottom edge: the sign that there are more. While it scrolls it can be tabbed to, and the keys
     scroll it then (data-board-scroll: board.ts leaves it the keys, the wheel and a finger).
   - The scrollbar is drawn here, not the browser's (which looks different everywhere, and which a
     press would pick the section up from): a thin thumb in the gutter on the right that shows
     while the pointer is over the notes. Drag it, or press the track to jump there; the wheel
     over it scrolls the notes too.
   - Resizing: the grip in the section's bottom-right corner makes it wider and taller, with the
     pointer tool (with the hand, Space or the stamp, a press there pans or stamps as anywhere).
     Wider, the notes take more columns (a third from 864px, a fourth from 1136px, the widest it
     goes); taller, more of them show, up to all of them. It's never smaller than it starts, nor
     taller than the notes need. The size lasts while the page is open, as places do (drag.ts).
   Pressing the grip or the scrollbar never picks the section up (data-board-handle), but brings it
   to the front, over anything it's grown across. Everything is measured in the board's own px,
   so it's right at any zoom. */

const ROWS = 2;            // rows shown in full before the list scrolls
const PEEK = 40;           // how far the next row shows, as the sign there's more
const MIN_WIDTH = 592;     // the section's width as it starts (.about-notes in styles.css)
const MAX_WIDTH = 1136;    // four columns of notes
const MIN_THUMB = 32;      // the scrollbar's thumb is never shorter than this

export function initNotesView(): { refresh(): void } {
  const root = document.documentElement;
  const view = document.querySelector<HTMLElement>('[data-notes-view]');
  const list = view?.querySelector<HTMLElement>('[data-notes-list]');
  const section = view?.closest<HTMLElement>('.board-section');
  const track = view?.querySelector<HTMLElement>('[data-notes-bar]');
  const thumb = track?.firstElementChild as HTMLElement | null | undefined;
  const grip = section?.querySelector<HTMLElement>('[data-notes-resize]');
  if (!view || !list || !section || !track || !thumb || !grip) return { refresh() {} };

  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = (): boolean => root.classList.contains('is-canvas');
  // The hand tool, Space and the stamp have the pointer: a press pans or stamps instead
  const otherTool = (): boolean => root.matches('.tool-hand, .is-space, .is-stamping');
  // How much bigger the section is on screen than on the board (the board's zoom)
  const scale = (): number => section.getBoundingClientRect().width / (section.offsetWidth || 1);

  // The size the visitor has given it, in board px: the section's width, and how tall the list
  // shows (null: as it starts)
  let width: number | null = null;
  let height: number | null = null;

  /* ----- Scrolling ----- */

  function fit(): void {
    // The first note of the row after the ones shown in full: rows are told apart by their tops
    const tops: number[] = [];
    const next = (Array.from(list!.children) as HTMLElement[]).find((item) => {
      if (!tops.includes(item.offsetTop)) tops.push(item.offsetTop);
      return tops.length > ROWS;
    });
    view!.classList.toggle('notes__view--scroll', !!next);
    if (next) {
      // At least the rows and the peek; at most all the notes (the list's whole height)
      const least = next.offsetTop + PEEK;
      const shown = Math.min(Math.max(height ?? least, least), list!.scrollHeight);
      list!.style.setProperty('--notes-view', `${shown}px`);
    }
    if (list!.scrollHeight > list!.clientHeight + 1) list!.tabIndex = 0; else list!.removeAttribute('tabindex');
    bar();
  }

  // On the next frame: fitting changes the list's size, which would otherwise call this again at once
  let fitting = 0;
  const refit = (): void => {
    cancelAnimationFrame(fitting);
    fitting = requestAnimationFrame(fit);
  };
  const sizes = 'ResizeObserver' in window ? new ResizeObserver(refit) : null;

  /* ----- The scrollbar ----- */

  // The thumb's length and place, from how much of the list shows and how far it's scrolled
  function bar(): void {
    const range = list!.scrollHeight - list!.clientHeight;
    track!.hidden = !view!.classList.contains('notes__view--scroll') || range < 1;
    if (track!.hidden) return;
    const length = track!.clientHeight;
    const size = Math.max(MIN_THUMB, (length * list!.clientHeight) / list!.scrollHeight);
    thumb!.style.height = `${size}px`;
    thumb!.style.translate = `0 ${((length - size) * list!.scrollTop) / range}px`;
  }
  list.addEventListener('scroll', bar, { passive: true });

  let held: { id: number; y: number; top: number } | null = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || otherTool()) return;
    e.preventDefault();
    const range = list.scrollHeight - list.clientHeight;
    const length = track.clientHeight;
    const size = thumb.offsetHeight;
    if (e.target === thumb) {
      // Picked up: it follows the pointer
      held = { id: e.pointerId, y: e.clientY, top: list.scrollTop };
      try { track.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
      track.classList.add('is-held');
      return;
    }
    // Pressed beside it: the thumb goes there, centred on the pointer
    const at = (e.clientY - track.getBoundingClientRect().top) / scale();
    list.scrollTo({ top: ((at - size / 2) / (length - size)) * range, behavior: calm.matches ? 'auto' : 'smooth' });
  });
  track.addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) return;
    const range = list.scrollHeight - list.clientHeight;
    const travel = track.clientHeight - thumb.offsetHeight;
    list.scrollTop = held.top + ((e.clientY - held.y) / scale()) * (range / (travel || 1));
  });
  const letGo = (e: PointerEvent): void => {
    if (!held || e.pointerId !== held.id) return;
    held = null;
    track.classList.remove('is-held');
  };
  track.addEventListener('pointerup', letGo);
  track.addEventListener('pointercancel', letGo);
  // The wheel over the scrollbar scrolls the notes too (the board would pan otherwise)
  track.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey || !canvas()) return;
    e.preventDefault();
    e.stopPropagation();
    list.scrollTop += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  }, { passive: false });

  /* ----- Resizing ----- */

  let resizing: { id: number; x: number; y: number; width: number; height: number; scale: number } | null = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || otherTool() || !canvas()) return;
    e.preventDefault();
    resizing = { id: e.pointerId, x: e.clientX, y: e.clientY, width: section.offsetWidth, height: list.clientHeight, scale: scale() };
    try { grip.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    section.classList.add('is-resizing');
    root.classList.add('is-resizing');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!resizing || e.pointerId !== resizing.id) return;
    width = Math.round(Math.min(Math.max(resizing.width + (e.clientX - resizing.x) / resizing.scale, MIN_WIDTH), MAX_WIDTH));
    height = Math.round(resizing.height + (e.clientY - resizing.y) / resizing.scale);
    section.style.setProperty('--notes-w', `${width}px`);
    fit();
  });
  const stop = (e: PointerEvent): void => {
    if (!resizing || e.pointerId !== resizing.id) return;
    resizing = null;
    section.classList.remove('is-resizing');
    root.classList.remove('is-resizing');
    // What it ended up showing, so the next resize starts from there
    if (height !== null) height = list.clientHeight;
  };
  grip.addEventListener('pointerup', stop);
  grip.addEventListener('pointercancel', stop);

  // Back on the page from the back/forward cache: it starts afresh, like any other visit
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    width = null;
    height = null;
    section.style.removeProperty('--notes-w');
    list.scrollTop = 0;
    refit();
  });

  return {
    // The notes have changed: watch their sizes, and fit the list to them
    refresh(): void {
      sizes?.disconnect();
      [list, ...Array.from(list.children)].forEach((el) => sizes?.observe(el));
      fit();
    },
  };
}
