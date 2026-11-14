/* ---------- Moving the board's objects ----------
   On a page shown as a canvas, the big objects (marked data-drag: the home page's intro, works
   and footer; the About page's sections, photo, playlist and footer) can be picked up with the
   pointer tool and put anywhere on the board, as in FigJam. Press on one and move more than a few
   pixels: it follows the pointer, comes to the front and has a blue selection outline. A plain
   click still does what it did (a link opens, a dot switches the photo); the click that ends a
   drag does nothing. Hold Shift to keep it on a straight line. Held at the edge of the screen, the
   board pans by itself; an object can't be put off the board.
   - Only with a mouse, trackpad or pen: a finger pans the board. Not with the hand tool, Space or
     the stamp, and not on a page that scrolls (phones, tablets, "View as list"), where every
     object stays in the page's order.
   - Each object's place is kept for this browser tab (sessionStorage), so it's still there after
     going to another page and back. Reloading a page puts everything back where it started: the
     script in the <head> of BaseLayout.astro forgets the places on a reload, and otherwise draws
     the objects at them before the page shows, so nothing jumps.
   - A place is an offset from where the page's own layout puts the object (--drag-x, --drag-y),
     and --drag-z is the stacking order: see "Moving objects" in styles.css. */
import type { BoardView } from './board';
import { updateConnectors } from './connectors';

const THRESHOLD = 4;   // how far the pointer moves (px) before a press becomes a drag
const EDGE = 40;       // how close to the window's edge (px) the board starts to pan by itself
const SPEED = 16;      // how fast it pans (px a frame) with the pointer right at the edge
const MARGIN = 96;     // how close to the board's edge an object can be put
const KEY = 'moved';   // sessionStorage: { page: { name: [x, y, z] } }

type Spot = { x: number; y: number; z: number };
type Point = { x: number; y: number };
type Saved = Record<string, Record<string, [number, number, number]>>;

function load(): Saved {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; }
}

export function initDrag(view: BoardView | null): void {
  const root = document.documentElement;
  const layer = document.querySelector<HTMLElement>('.board__layer');
  const page = root.dataset.page;
  if (!view || !layer || !page || !document.querySelector('[data-drag]')) return;

  // Where each object that has been moved is, by its name
  const spots = new Map<string, Spot>();

  function draw(el: HTMLElement, spot: Spot): void {
    el.style.setProperty('--drag-x', spot.x + 'px');
    el.style.setProperty('--drag-y', spot.y + 'px');
    el.style.setProperty('--drag-z', String(spot.z));
  }

  function save(): void {
    const all = load();
    all[page!] = Object.fromEntries(Array.from(spots, ([name, s]) => [name, [s.x, s.y, s.z]]));
    try { sessionStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private window: they stay until the page is left */ }
  }

  // The places from earlier in this tab (the <head> script has already drawn them with a
  // stylesheet of its own; from here on they're on the objects themselves)
  Object.entries(load()[page] ?? {}).forEach(([name, [x, y, z]]) => {
    const el = document.querySelector<HTMLElement>(`[data-drag="${CSS.escape(name)}"]`);
    if (!el || ![x, y, z].every(Number.isFinite)) return;
    spots.set(name, { x, y, z });
    draw(el, spots.get(name)!);
  });
  document.getElementById('moved-places')?.remove();

  // Puts this object on top: every moved object is stacked 2 and up in the order it was last
  // picked up; one that hasn't been moved stays at 1, under them all
  function raise(name: string): void {
    const order = Array.from(spots.keys()).filter((n) => n !== name).sort((a, b) => spots.get(a)!.z - spots.get(b)!.z);
    order.push(name);
    order.forEach((n, i) => {
      spots.get(n)!.z = i + 2;
      const el = document.querySelector<HTMLElement>(`[data-drag="${CSS.escape(n)}"]`);
      if (el) draw(el, spots.get(n)!);
    });
  }

  /* ----- Picking up, moving, putting down ----- */

  let held: {
    el: HTMLElement;
    name: string;
    id: number;          // the pointer's
    down: Point;         // where it was pressed, on screen
    grab: Point;         // ...and on the board
    from: Spot;          // where the object was then
    box: { left: number; top: number; right: number; bottom: number };   // its box on the board, without the offset
  } | null = null;
  let dragging = false;
  let dragged = false;   // a drag just ended: the click that ends it does nothing
  let pointer: Point = { x: 0, y: 0 };
  let straight = false;  // Shift is held
  let frame = 0;

  // How fast the board pans with the pointer this close to an edge (0 further in)
  const push = (gap: number): number => SPEED * Math.min(1, Math.max(0, 1 - gap / EDGE));

  function step(): void {
    frame = 0;
    if (!held || !dragging) return;
    const panX = push(pointer.x) - push(innerWidth - pointer.x);
    const panY = push(pointer.y) - push(innerHeight - pointer.y);
    if (panX || panY) view!.panBy(panX, panY);

    const now = view!.toBoard(pointer.x, pointer.y);
    let dx = now.x - held.grab.x;
    let dy = now.y - held.grab.y;
    if (straight) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
    }
    // Kept on the board, clear of its edges
    const { box } = held;
    const clamp = (value: number, min: number, max: number): number => Math.round(Math.min(Math.max(value, min), max));
    const spot = spots.get(held.name)!;
    spot.x = clamp(held.from.x + dx, MARGIN - box.left, layer!.offsetWidth - MARGIN - box.right);
    spot.y = clamp(held.from.y + dy, MARGIN - box.top, layer!.offsetHeight - MARGIN - box.bottom);
    draw(held.el, spot);
    updateConnectors();
    // A press that has started selecting text doesn't go on selecting it
    getSelection()?.removeAllRanges();
    // Held still at an edge, the board keeps panning
    if (panX || panY) frame = requestAnimationFrame(step);
  }

  function pickUp(): void {
    if (!held) return;
    dragging = true;
    const { el, name } = held;
    if (!spots.has(name)) spots.set(name, { x: 0, y: 0, z: 1 });
    held.from = { ...spots.get(name)! };
    const rect = el.getBoundingClientRect();
    const a = view!.toBoard(rect.left, rect.top);
    const b = view!.toBoard(rect.right, rect.bottom);
    held.box = { left: a.x - held.from.x, top: a.y - held.from.y, right: b.x - held.from.x, bottom: b.y - held.from.y };
    raise(name);
    try { el.setPointerCapture(held.id); } catch { /* the pointer is already gone */ }
    el.classList.add('is-dragged');
    root.classList.add('is-dragging');
  }

  function putDown(): void {
    if (!held) return;
    if (dragging) {
      cancelAnimationFrame(frame);
      frame = 0;
      held.el.classList.remove('is-dragged');
      root.classList.remove('is-dragging');
      updateConnectors();
      save();
      dragged = true;
      setTimeout(() => { dragged = false; });   // only the click that ends this drag
    }
    held = null;
    dragging = false;
  }

  layer.addEventListener('pointerdown', (e) => {
    if (held || !view.active() || e.pointerType === 'touch' || e.button !== 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    // The hand tool and Space pan the board instead (src/scripts/board.ts); the stamp drops an emote
    if (root.matches('.tool-hand, .is-space, .is-stamping')) return;
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-drag]') : null;
    const name = el?.dataset.drag;
    if (!el || !name) return;
    const down = { x: e.clientX, y: e.clientY };
    held = { el, name, id: e.pointerId, down, grab: view.toBoard(down.x, down.y), from: { x: 0, y: 0, z: 1 }, box: { left: 0, top: 0, right: 0, bottom: 0 } };
    pointer = down;
    straight = e.shiftKey;
  });

  window.addEventListener('pointermove', (e) => {
    if (!held || e.pointerId !== held.id) return;
    pointer = { x: e.clientX, y: e.clientY };
    straight = e.shiftKey;
    if (!dragging) {
      if (Math.hypot(pointer.x - held.down.x, pointer.y - held.down.y) <= THRESHOLD) return;
      pickUp();
    }
    if (!frame) frame = requestAnimationFrame(step);
  });

  const release = (e: PointerEvent): void => {
    if (held && e.pointerId === held.id) putDown();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', putDown);

  // Shift pressed or let go while the pointer rests
  const shift = (e: KeyboardEvent): void => {
    if (e.key !== 'Shift' || !dragging) return;
    straight = e.type === 'keydown';
    if (!frame) frame = requestAnimationFrame(step);
  };
  window.addEventListener('keydown', shift);
  window.addEventListener('keyup', shift);

  window.addEventListener('click', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // The browser's own dragging of a link, a picture or selected text would take the pointer away
  layer.addEventListener('dragstart', (e) => {
    const target = e.target instanceof Element ? e.target : (e.target as Node | null)?.parentElement;
    if (view.active() && target?.closest('[data-drag]')) e.preventDefault();
  });
}
