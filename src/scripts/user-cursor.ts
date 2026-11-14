/* ---------- The visitor's own cursor ----------
   A Charcoal arrow with "Me" under it (src/components/board/UserCursor.astro) that follows the
   mouse, in place of the system pointer. The system pointer comes back:
   - on a touch screen, or a screen without a mouse or trackpad (the media query below)
   - in Windows' high-contrast mode, which needs the system's own pointer
   - while the hand tool, Space or the stamp is in use: they have pointers of their own
     (the CSS leaves those out, see "The visitor's own cursor" in styles.css)
   - over the Figma embed, whose page draws its own pointer
   - in browsers without popovers, where the arrow couldn't stay above the menus
   html.has-user-cursor says the arrow is showing: the CSS then hides the system pointer.

   After a click on a link to another page of the site, the new page starts with the arrow where
   the mouse was, so it doesn't flash the system pointer until the mouse moves. */
const TIP = 2.4;                 // where the arrow's tip is, from the element's top-left corner
const KEY = 'cursor';            // sessionStorage: where the mouse was when a link was clicked

export function initUserCursor(): void {
  const el = document.querySelector<HTMLElement>('[data-user-cursor]');
  if (!el || !('showPopover' in HTMLElement.prototype)) return;

  const root = document.documentElement;
  const mouse = window.matchMedia('(hover: hover) and (pointer: fine)');
  const contrast = window.matchMedia('(forced-colors: active)');
  let x = 0;
  let y = 0;
  let frame = 0;

  const usable = (): boolean => mouse.matches && !contrast.matches;

  function draw(): void {
    frame = 0;
    el!.style.translate = `${x - TIP}px ${y - TIP}px`;
  }

  function show(): void {
    if (!el!.matches(':popover-open')) el!.showPopover();
    root.classList.add('has-user-cursor');
  }

  function hide(): void {
    root.classList.remove('has-user-cursor');
  }

  function moveTo(nx: number, ny: number): void {
    x = nx;
    y = ny;
    if (!frame) frame = requestAnimationFrame(draw);
  }

  // Each move of the mouse (or a pen) brings the arrow; a finger puts the system pointer back
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !usable()) { hide(); return; }
    moveTo(e.clientX, e.clientY);
    show();
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') hide(); }, { passive: true });

  // Leaving the window, or moving onto an embed, which gets no events from here
  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget || e.relatedTarget instanceof HTMLIFrameElement) hide();
  });

  // A menu that opens goes into the top layer above the arrow, so the arrow goes in again after it
  document.addEventListener('toggle', (e) => {
    const opened = (e as ToggleEvent).newState === 'open';
    if (e.target !== el && opened && el.matches(':popover-open')) {
      el.hidePopover();
      el.showPopover();
    }
  }, true);

  // The screen or the contrast mode changed (a tablet's keyboard taken off, high contrast on)
  const recheck = (): void => { if (!usable()) hide(); };
  mouse.addEventListener('change', recheck);
  contrast.addEventListener('change', recheck);

  // A page brought back by the Back button: the mouse may be anywhere now
  window.addEventListener('pageshow', (e) => { if (e.persisted) hide(); });

  // Remember where a real click on a link to this site happened...
  document.addEventListener('click', (e) => {
    const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || e.detail === 0 || !root.classList.contains('has-user-cursor')) return;
    if (link.target === '_blank' || new URL(link.href).origin !== location.origin) return;
    try { sessionStorage.setItem(KEY, JSON.stringify({ x, y, at: Date.now() })); } catch { /* private window */ }
  }, true);

  // ...and start the page it led to with the arrow there. Only after following a link (not the
  // Back button or a reload, where the mouse could be anywhere), and only within a few seconds.
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { x: number; y: number; at: number } | null;
    sessionStorage.removeItem(KEY);
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (saved && usable() && Date.now() - saved.at < 10000 && entry?.type === 'navigate') {
      moveTo(saved.x, saved.y);
      draw();
      show();
    }
  } catch { /* no storage: the arrow comes with the first move */ }
}
