/* ---------- Chrome: menus, tooltips, shortcuts and the stamp ----------
   The floating panels around the board (src/components/board/). The menus are native popovers,
   which open, close and trap nothing without any script; this only lines each one up with the
   button that opens it. */

const root = document.documentElement;
const GAP = 8;        // between a button and its menu
const EDGE = 12;      // the closest a menu gets to the screen's edge

/* A menu names its button in data-anchor. Its class says which way it opens: below the button,
   left edges together (the top pills); or above it, centred or right edges together (the bottom
   ones). Placed just before it opens, from where the button is at that moment. Without this (no
   JavaScript, or the button isn't on screen), the menu keeps the fixed spot it has in the CSS. */
function initMenus(): void {
  document.querySelectorAll<HTMLElement>('.menu[popover][data-anchor]').forEach((menu) => {
    menu.addEventListener('beforetoggle', (e) => {
      if ((e as ToggleEvent).newState !== 'open') return;
      const anchor = document.querySelector<HTMLElement>(menu.dataset.anchor ?? '');
      const box = anchor?.getBoundingClientRect();
      menu.style.cssText = '';
      if (!box || !box.width) return;
      if (menu.classList.contains('menu--below-start')) {
        menu.style.top = box.bottom + GAP + 'px';
        menu.style.left = Math.max(EDGE, box.left) + 'px';
      } else {
        menu.style.bottom = innerHeight - box.top + GAP + 'px';
        if (menu.classList.contains('menu--above-end')) menu.style.right = Math.max(EDGE, innerWidth - box.right) + 'px';
        else menu.style.left = box.left + box.width / 2 + 'px';
      }
    });
    // A link in a menu closes it, so it isn't still open when the Back button returns to the page
    menu.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('a')) menu.hidePopover();
    });
  });
}

/* A tooltip shows on hover and on keyboard focus (CSS). Escape hides it without moving the
   pointer or the focus; it comes back the next time its button is pointed at or focused. */
function initTooltips(): void {
  const dismissed = new Set<Element>();
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.tool:hover, .tool:focus-within').forEach((tool) => {
      tool.classList.add('is-dismissed');
      dismissed.add(tool);
    });
  });
  const restore = (e: Event) => {
    dismissed.forEach((tool) => {
      if (e.target instanceof Node && tool.contains(e.target)) return;
      tool.classList.remove('is-dismissed');
      dismissed.delete(tool);
    });
  };
  document.addEventListener('pointerover', restore);
  document.addEventListener('focusin', restore);
}

/* Single-key shortcuts: each tool names its key in data-shortcut, and pressing the key clicks
   it, so a shortcut can never do something its button doesn't. They don't fire while typing, with
   Ctrl, Alt or ⌘ held (those belong to the browser), for a tool that isn't on screen, or once
   switched off in the "?" list. A screen reader's own single-key commands never reach the page,
   so they aren't affected. */
function initShortcuts(): void {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (root.classList.contains('no-shortcuts')) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, iframe, [contenteditable]')) return;
    const key = e.key.toLowerCase();
    if (key.length !== 1 || (e.shiftKey && key !== '?')) return;
    const tool = document.querySelector<HTMLElement>(`[data-shortcut="${CSS.escape(key)}"]`);
    if (!tool || !tool.getClientRects().length) return;
    e.preventDefault();
    tool.click();
  });

  // The switch in the "?" list, remembered for next time (the script in the <head> of
  // BaseLayout.astro reads it back before the page is drawn)
  const toggle = document.querySelector<HTMLElement>('[data-pref="shortcuts"]');
  if (!toggle) return;
  const show = () => toggle.setAttribute('aria-checked', String(!root.classList.contains('no-shortcuts')));
  show();
  toggle.addEventListener('click', () => {
    const off = root.classList.toggle('no-shortcuts');
    try { localStorage.setItem('shortcuts', off ? 'off' : 'on'); } catch { /* private window: it just isn't remembered */ }
    show();
  });
}

/* The stamp: choosing it arms the next click anywhere on the board, which drops an emote there
   that pops in and fades after two seconds. That click does nothing else (a link under it isn't
   followed). Escape, or clicking the chrome, puts the stamp down. The button is hidden with
   reduced motion (CSS), so none of this runs then. */
const EMOTES = ['👍', '⭐', '❤️', '🎉', '👀', '🔥'];

function initStamp(): void {
  const button = document.querySelector<HTMLElement>('[data-tool="stamp"]');
  if (!button) return;
  let armed = false;
  let next = 0;

  function arm(on: boolean): void {
    armed = on;
    root.classList.toggle('is-stamping', on);
    button!.setAttribute('aria-pressed', String(on));
  }

  button.addEventListener('click', () => arm(!armed));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && armed) arm(false);
  });
  document.addEventListener('click', (e) => {
    if (!armed || !(e.target instanceof Element) || button.contains(e.target)) return;
    arm(false);
    // A click on the chrome just picks something else
    if (e.target.closest('.chrome, .menu, .mobile-menu')) return;
    e.preventDefault();
    e.stopPropagation();
    const emote = document.createElement('span');
    emote.className = 'emote';
    emote.setAttribute('aria-hidden', 'true');
    emote.textContent = EMOTES[next++ % EMOTES.length]!;
    emote.style.left = e.clientX + 'px';
    emote.style.top = e.clientY + 'px';
    emote.style.setProperty('--tilt', (Math.random() * 24 - 12).toFixed(1) + 'deg');
    document.body.appendChild(emote);
    emote.addEventListener('animationend', () => emote.remove());
  }, true);
}

export function initChrome(): void {
  initMenus();
  initTooltips();
  initShortcuts();
  initStamp();
}
