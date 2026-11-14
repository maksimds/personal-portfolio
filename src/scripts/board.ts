/* ---------- The board as a canvas ----------
   On a wide screen, a page whose <html> has data-board="canvas" (home) isn't scrolled: its
   content sits on one big layer (.board__layer) that is moved and scaled with a CSS transform.
   - Pan: scroll (wheel or trackpad), the arrow keys, drag with the hand tool, with Space held or
     with the middle mouse button, or drag with one finger on a touch screen
   - Zoom: Ctrl or ⌘ + scroll, pinch, or the zoom pill; always between 50% and 150%
   - Tabbing to something off screen moves the board to it, and so does a link to a section (#work)
   The page's own order never changes, only where things are drawn, so it reads the same to a
   screen reader. Under 1024px wide, without JavaScript, or with "View as list" switched on, the
   same page is an ordinary scrolling one.

   The script in the <head> of BaseLayout.astro adds the "is-canvas" class before the page is
   drawn, and the CSS puts the layer at its starting place by itself (--start-x and --start-y,
   see "Canvas" in styles.css), so nothing jumps when this takes over a moment later. */
import { updateConnectors } from './connectors';
import { showAllDropIns } from './reveal';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;
const DOT_GAP = 24;        // --board-dot-gap
const TOP = 120;           // where the top of a section linked to (#work) stops, below the pills
const START_Y = 0.46;      // the starting point sits a little above the middle of the screen
// What stays clear of the chrome when the board moves to show something that got keyboard focus
const SAFE = { top: 84, right: 24, bottom: 84, left: 24 };

export function initBoard(): void {
  const root = document.documentElement;
  const board = document.querySelector<HTMLElement>('.board');
  const layer = document.querySelector<HTMLElement>('.board__layer');
  if (!board || !layer || root.dataset.board !== 'canvas') return;

  const wide = window.matchMedia('(min-width: 1024px)');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const zoomLabel = document.querySelector<HTMLElement>('[data-zoom-value]');
  const zoomOut = document.querySelector<HTMLButtonElement>('[data-zoom="out"]');
  const zoomIn = document.querySelector<HTMLButtonElement>('[data-zoom="in"]');
  const tools = Array.from(document.querySelectorAll<HTMLElement>('[data-tool="select"], [data-tool="hand"]'));
  const listSwitch = document.querySelector<HTMLElement>('[data-pref="list"]');

  // Where the layer's top-left corner is on screen, and how big it's drawn
  let x = 0;
  let y = 0;
  let zoom = 1;
  let frame = 0;         // a drawing waiting for the next frame
  let glideFrame = 0;    // an eased move in progress
  let idle = 0;
  let hand = false;      // the hand tool is chosen
  let space = false;     // Space is held

  const active = (): boolean => root.classList.contains('is-canvas');
  const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  /* ----- Drawing ----- */

  // Keeps the screen inside the board; a board smaller than the screen (zoomed out on a big one) is centred
  function limit(): void {
    const w = layer!.offsetWidth * zoom;
    const h = layer!.offsetHeight * zoom;
    x = w <= innerWidth ? (innerWidth - w) / 2 : Math.min(0, Math.max(innerWidth - w, x));
    y = h <= innerHeight ? (innerHeight - h) / 2 : Math.min(0, Math.max(innerHeight - h, y));
  }

  function draw(): void {
    frame = 0;
    layer!.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    // The dots move and scale with the layer, so the board reads as one surface
    board!.style.backgroundPosition = `${x}px ${y}px`;
    board!.style.backgroundSize = `${DOT_GAP * zoom}px ${DOT_GAP * zoom}px`;
    if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
    if (zoomOut) zoomOut.disabled = zoom <= MIN_ZOOM;
    if (zoomIn) zoomIn.disabled = zoom >= MAX_ZOOM;
  }

  // Moves the board, drawing at most once a frame. While it's moving the layer is kept as one
  // picture for the browser to slide around (will-change in the CSS); shortly after it stops the
  // class comes off again, so the text is redrawn sharp at the new zoom.
  function set(nx: number, ny: number, nz: number = zoom): void {
    zoom = clampZoom(nz);
    x = nx;
    y = ny;
    limit();
    if (!frame) frame = requestAnimationFrame(draw);
    layer!.classList.add('is-moving');
    clearTimeout(idle);
    idle = window.setTimeout(() => layer!.classList.remove('is-moving'), 200);
  }

  // The same, eased over a third of a second; straight there for visitors who have turned on reduced motion
  function glide(nx: number, ny: number, nz: number = zoom): void {
    cancelAnimationFrame(glideFrame);
    if (calm.matches) { set(nx, ny, nz); return; }
    const from = { x, y, zoom };
    const began = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - began) / 360);
      const k = 1 - Math.pow(1 - t, 3);
      set(from.x + (nx - from.x) * k, from.y + (ny - from.y) * k, from.zoom + (nz - from.zoom) * k);
      if (t < 1) glideFrame = requestAnimationFrame(step);
    };
    glideFrame = requestAnimationFrame(step);
  }

  // Zooms with the point (cx, cy) of the screen staying where it is: the pointer, or the middle
  function zoomAt(nz: number, cx: number = innerWidth / 2, cy: number = innerHeight / 2, eased = false): void {
    const next = clampZoom(nz);
    const k = next / zoom;
    (eased ? glide : set)(cx - (cx - x) * k, cy - (cy - y) * k, next);
  }

  /* ----- Places ----- */

  // Where the page starts: the board's point (--start-x, --start-y) in the middle of the screen
  // and a little above its centre. The CSS draws the layer there before this script runs.
  function start(): { x: number; y: number } {
    const style = getComputedStyle(root);
    const sx = parseFloat(style.getPropertyValue('--start-x')) || layer!.offsetWidth / 2;
    const sy = parseFloat(style.getPropertyValue('--start-y')) || layer!.offsetHeight / 2;
    return { x: innerWidth / 2 - sx * zoom, y: innerHeight * START_Y - sy * zoom };
  }

  // The place that shows a section linked to: centred, its top just below the pills
  function placeOf(el: Element): { x: number; y: number } {
    const box = el.getBoundingClientRect();
    return { x: x + innerWidth / 2 - (box.left + box.width / 2), y: y + TOP - box.top };
  }

  // The element a # address points at, if it's on the board
  function hashTarget(hash: string): HTMLElement | null {
    if (hash.length < 2) return null;
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    return el && layer!.contains(el) ? el : null;
  }

  function goTo(hash: string, eased: boolean): void {
    const target = hashTarget(hash);
    // #main is the whole board, so it's the same as the start
    const place = target && target.id !== 'main' ? placeOf(target) : start();
    (eased ? glide : set)(place.x, place.y);
  }

  // Moves the board just far enough to show something that got keyboard focus
  function reveal(el: Element): void {
    const box = el.getBoundingClientRect();
    const right = innerWidth - SAFE.right;
    const bottom = innerHeight - SAFE.bottom;
    let dx = 0;
    let dy = 0;
    if (box.left < SAFE.left || box.width > right - SAFE.left) dx = SAFE.left - box.left;
    else if (box.right > right) dx = right - box.right;
    if (box.top < SAFE.top || box.height > bottom - SAFE.top) dy = SAFE.top - box.top;
    else if (box.bottom > bottom) dy = bottom - box.bottom;
    if (dx || dy) glide(x + dx, y + dy);
  }

  /* ----- Canvas on and off ----- */

  function setTool(name: string): void {
    hand = name === 'hand';
    root.classList.toggle('tool-hand', hand);
    tools.forEach((tool) => tool.setAttribute('aria-pressed', String(tool.dataset.tool === name)));
  }

  function listView(): boolean {
    try { return localStorage.getItem('view') === 'list'; } catch { return false; }
  }

  function enter(): void {
    // Pick up from where the CSS has drawn the layer, then go to where the address says
    const drawn = new DOMMatrix(getComputedStyle(layer!).transform);
    x = drawn.e;
    y = drawn.f;
    zoom = 1;
    goTo(location.hash, false);
    cancelAnimationFrame(frame);
    draw();
    // Nothing waits to be scrolled to on a canvas: every object drops in as the page opens
    showAllDropIns();
    updateConnectors();
  }

  function leave(): void {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(glideFrame);
    frame = 0;
    layer!.style.transform = '';
    layer!.classList.remove('is-moving');
    board!.style.backgroundPosition = '';
    board!.style.backgroundSize = '';
    setTool('select');
    window.scrollTo(0, 0);
    updateConnectors();
  }

  // A canvas only on a wide screen, and only while "View as list" is off
  function sync(): void {
    const on = wide.matches && !listView();
    if (listSwitch) listSwitch.setAttribute('aria-checked', String(listView()));
    if (on === active()) return;
    root.classList.toggle('is-canvas', on);
    if (on) enter(); else leave();
  }

  /* ----- Moving it ----- */

  // Scrolling pans. With Ctrl or ⌘ (which is also what a trackpad pinch sends) it zooms on the pointer.
  window.addEventListener('wheel', (e) => {
    if (!active()) return;
    if (e.target instanceof Element && e.target.closest('.menu, .mobile-menu')) return;   // a long menu scrolls itself
    e.preventDefault();
    cancelAnimationFrame(glideFrame);
    const unit = e.deltaMode === 1 ? 16 : 1;   // a mouse wheel that counts in lines, not pixels
    if (e.ctrlKey || e.metaKey) {
      // One notch of a mouse wheel is a far bigger number than a pinch sends, so it's capped
      const delta = Math.max(-24, Math.min(24, e.deltaY * unit));
      zoomAt(zoom * Math.exp(-delta * 0.01), e.clientX, e.clientY);
    } else if (e.shiftKey && !e.deltaX) {
      set(x - e.deltaY * unit, y);             // Shift + wheel goes sideways
    } else {
      set(x - e.deltaX * unit, y - e.deltaY * unit);
    }
  }, { passive: false });

  // Safari sends its own events for a trackpad pinch
  let pinchZoom = 1;
  window.addEventListener('gesturestart', (e) => {
    if (!active()) return;
    e.preventDefault();
    pinchZoom = zoom;
  });
  window.addEventListener('gesturechange', (e) => {
    if (!active()) return;
    e.preventDefault();
    const gesture = e as Event & { scale: number; clientX: number; clientY: number };
    zoomAt(pinchZoom * gesture.scale, gesture.clientX, gesture.clientY);
  });

  // Dragging: a finger always pans (two pinch to zoom); a mouse pans with the hand tool, with
  // Space held, or with its middle button. A drag doesn't count as a click on what's under it.
  const pointers = new Map<number, { x: number; y: number }>();
  let travelled = 0;
  let dragged = false;

  board.addEventListener('pointerdown', (e) => {
    if (!active()) return;
    const touch = e.pointerType === 'touch';
    if (!touch && e.button !== 1 && !(e.button === 0 && (hand || space))) return;
    if (!touch) e.preventDefault();            // no text selection, and no middle-button auto-scroll
    cancelAnimationFrame(glideFrame);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) travelled = 0;
  });

  window.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    if (pointers.size === 2) {
      // Two fingers: the board follows the point between them and scales with their distance apart
      const [a, b] = Array.from(pointers.values()) as [{ x: number; y: number }, { x: number; y: number }];
      const before = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, gap: Math.hypot(a.x - b.x, a.y - b.y) };
      last.x = e.clientX;
      last.y = e.clientY;
      const after = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, gap: Math.hypot(a.x - b.x, a.y - b.y) };
      const next = clampZoom(zoom * (after.gap / (before.gap || 1)));
      const k = next / zoom;
      set(after.x - (before.x - x) * k, after.y - (before.y - y) * k, next);
      travelled = Infinity;
      return;
    }
    travelled += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
    set(x + e.clientX - last.x, y + e.clientY - last.y);
    last.x = e.clientX;
    last.y = e.clientY;
    root.classList.add('is-grabbing');
  });

  const release = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId) || pointers.size) return;
    root.classList.remove('is-grabbing');
    if (travelled > 4) {
      dragged = true;
      setTimeout(() => { dragged = false; });   // only the click that ends this drag
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('click', (e) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Arrow keys pan (further with Shift), Page Up and Page Down by most of a screen, Home goes
  // back to the start. Holding Space turns the pointer into the hand, unless a button or link
  // has the focus (there, Space presses it).
  window.addEventListener('keydown', (e) => {
    if (!active() || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable], .menu, .mobile-menu')) return;
    const step = e.shiftKey ? 240 : 80;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
      PageUp: [0, innerHeight * 0.8], PageDown: [0, -innerHeight * 0.8],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      cancelAnimationFrame(glideFrame);
      if (e.key.startsWith('Page')) glide(x + move[0], y + move[1]); else set(x + move[0], y + move[1]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      const place = start();
      glide(place.x, place.y);
    } else if (e.key === ' ' && !target?.closest('a, button, summary')) {
      e.preventDefault();
      space = true;
      root.classList.add('is-space');
    }
  });
  const dropSpace = (): void => {
    space = false;
    root.classList.remove('is-space');
  };
  window.addEventListener('keyup', (e) => { if (e.key === ' ') dropSpace(); });
  window.addEventListener('blur', dropSpace);

  // Tabbing to something off screen brings it into view. Only for the keyboard: moving the board
  // under the mouse halfway through a click would make it miss.
  layer.addEventListener('focusin', (e) => {
    if (active() && e.target instanceof Element && e.target.matches(':focus-visible')) reveal(e.target);
  });
  // The board can't be scrolled (overflow: clip in the CSS). Where a browser doesn't know that
  // value and scrolls it anyway to show a link's target, put it straight back.
  board.addEventListener('scroll', () => {
    if (active() && (board.scrollLeft || board.scrollTop)) board.scrollTo(0, 0);
  });

  // A link to a section of this page (the toolbar's Work tile, "Skip to content") glides there
  document.addEventListener('click', (e) => {
    if (!active() || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href);
    const page = (path: string): string => path.replace(/index\.html$/, '');
    if (url.origin !== location.origin || page(url.pathname) !== page(location.pathname) || !hashTarget(url.hash)) return;
    e.preventDefault();
    if (url.hash !== location.hash) history.pushState(null, '', url.hash);
    goTo(url.hash, true);
  });
  // ...and so do the Back and Forward buttons between them
  window.addEventListener('popstate', () => { if (active()) goTo(location.hash, true); });

  /* ----- The chrome's controls ----- */

  tools.forEach((tool) => tool.addEventListener('click', () => setTool(tool.dataset.tool ?? 'select')));

  // The zoom pill: a tenth at a time, and the percentage itself goes back to 100%. Each click
  // counts from where the last one was heading, so quick clicks add up while the zoom is still easing.
  let aim = 1;
  let aimed = 0;
  document.querySelectorAll<HTMLElement>('[data-zoom]').forEach((button) => {
    button.addEventListener('click', () => {
      const tenths = Math.round((performance.now() - aimed < 400 ? aim : zoom) * 10);
      aim = clampZoom({ out: (tenths - 1) / 10, in: (tenths + 1) / 10, reset: 1 }[button.dataset.zoom ?? 'reset'] ?? 1);
      aimed = performance.now();
      zoomAt(aim, undefined, undefined, true);
    });
  });

  // "View as list" in the "?" list, remembered for next time (the script in the <head> reads it back)
  listSwitch?.addEventListener('click', () => {
    try { localStorage.setItem('view', listView() ? 'canvas' : 'list'); } catch { /* private window: it lasts until the page is left */ }
    sync();
  });

  wide.addEventListener('change', sync);
  window.addEventListener('resize', () => {
    if (!active()) return;
    limit();
    draw();
  });

  if (listSwitch) listSwitch.setAttribute('aria-checked', String(listView()));
  if (active()) enter();
}
