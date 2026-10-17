/* ---------- Header height (used for page offset + mobile menu) ----------
   The inline script at the end of BaseLayout sets it once before the page is drawn; this keeps it
   up to date when the window is resized. */
export function initHeaderHeight(): void {
  const root = document.documentElement;
  const header = document.querySelector<HTMLElement>('.site-header');

  function setHeaderHeight(): void {
    if (!header) return;
    root.style.setProperty('--header-height', header.getBoundingClientRect().height + 'px');
  }
  setHeaderHeight();
  window.addEventListener('resize', setHeaderHeight);
}

/* ---------- Scroll-back header ----------
   Hides on scroll down and returns on scroll up. It's see-through only when the
   page is scrolled all the way to the top; anywhere else it has a solid
   background, so the text underneath never shows through it. */
export function initScrollHeader(): void {
  const body = document.body;
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;

  let lastY = window.scrollY;
  let ticking = false;

  function onScroll(): void {
    if (!header) return;
    const y = window.scrollY;
    header.classList.toggle('is-solid', y > 1);
    if (!body.classList.contains('menu-open')) {
      const goingDown = y > lastY;
      header.classList.toggle('is-hidden', goingDown && y > header.offsetHeight);
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
}
