/* ---------- Mobile menu ---------- */
export function initMenu(): void {
  const body = document.body;
  const header = document.querySelector<HTMLElement>('.site-header');
  const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  // The page under the full-screen menu, made inert while it's open so Tab stays in the menu
  const behindMenu = document.querySelectorAll<HTMLElement>('main, .site-footer');

  function setMenu(open: boolean): void {
    body.classList.toggle('menu-open', open);
    behindMenu.forEach((el) => { el.inert = open; });
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    if (menu) menu.setAttribute('aria-hidden', String(!open));
    if (open && header) header.classList.remove('is-hidden');
  }

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      setMenu(!body.classList.contains('menu-open'));
    });

    menu.addEventListener('click', (e) => {
      if (e.target instanceof Element && e.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) {
        setMenu(false);
        toggle.focus();
      }
    });

    // Close the overlay if the window is widened past the mobile breakpoint.
    window.matchMedia('(min-width: 768px)').addEventListener('change', (mq) => {
      if (mq.matches) setMenu(false);
    });
  }
}
