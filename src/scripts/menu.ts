/* ---------- Phone menu ----------
   On phones the page switcher in the top bar (.menu-toggle) opens a full-screen menu (#mobile-menu)
   instead of the small list it opens on wider screens. */
export function initMenu(): void {
  const body = document.body;
  const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  // The page under the full-screen menu, made inert while it's open so Tab stays in the menu
  const behindMenu = document.querySelectorAll<HTMLElement>('main, .site-footer');

  function setMenu(open: boolean): void {
    body.classList.toggle('menu-open', open);
    behindMenu.forEach((el) => { el.inert = open; });
    if (toggle) toggle.setAttribute('aria-expanded', String(open));
    if (menu) menu.setAttribute('aria-hidden', String(!open));
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

    // Close the overlay if the window is widened past the phone breakpoint.
    window.matchMedia('(min-width: 768px)').addEventListener('change', (mq) => {
      if (mq.matches) setMenu(false);
    });
  }
}
