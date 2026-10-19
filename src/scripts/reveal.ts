/* ---------- Fade in on scroll ---------- */
export function initReveal(): void {
  const revealEls = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });

    revealEls.forEach((el) => { io.observe(el); });
  } else {
    revealEls.forEach((el) => { el.classList.add('is-visible'); });
  }
}

/* ---------- Blur in on scroll (My works, About, footer) ----------
   Plays the heroes' blur-in (see src/styles/styles.css) on each .blur-in line once its top is 64px
   into view. Lines that come in together follow each other 0.1s apart, in page order.
   It's a fixed 64px rather than the fade-in's 8% of the screen: on tall screens 8% is more
   than the footer's height, so the footer could never scroll far enough up to reach it.
   The footer's lines start together once the footer itself is 64px into view: they sit so
   close to the bottom of the page that on some screens they can't get that far on their own.
   Lines already in view on load (on phones, the top of My works) wait for the hero's
   lines and follow on after the last one. */
export function initBlurIn(): void {
  const blurEls = Array.from(document.querySelectorAll<HTMLElement>('.blur-in'));
  const footer = document.querySelector<HTMLElement>('.site-footer');
  const heroLines = document.querySelectorAll('.hero-in');
  let blurStart = heroLines.length
    ? parseFloat(getComputedStyle(heroLines[heroLines.length - 1]!).animationDelay) + 0.1
    : 0;

  if ('IntersectionObserver' in window) {
    const blurIo = new IntersectionObserver((entries) => {
      let els: HTMLElement[] = [];
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        blurIo.unobserve(entry.target);
        els = els.concat(footer && entry.target === footer
          ? Array.from(footer.querySelectorAll<HTMLElement>('.blur-in'))
          : [entry.target as HTMLElement]);
      });
      els.forEach((el, i) => {
        el.style.setProperty('--blur-in-delay', (blurStart + i * 0.1) + 's');
        el.classList.add('is-visible');
      });
      blurStart = 0;   // the first call reports every line, so only the lines in view on load wait
    }, { rootMargin: '0px 0px -64px 0px' });

    blurEls.forEach((el) => {
      if (!footer || !footer.contains(el)) blurIo.observe(el);
    });
    if (footer && footer.querySelector('.blur-in')) blurIo.observe(footer);
  } else {
    blurEls.forEach((el) => { el.classList.add('is-visible'); });
  }
}
