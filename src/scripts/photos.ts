/* ---------- About: the dots under the photo ----------
   Each dot shows its photo: the photo fades in over the others (see .about-photos__slide in
   src/styles/styles.css), the others are hidden from screen readers, and the dot turns white. */
export function initPhotoDots(): void {
  document.querySelectorAll('.about-photos').forEach((frame) => {
    const slides = Array.from(frame.querySelectorAll('.about-photos__slide'));
    const dots = Array.from(frame.querySelectorAll('.about-photos__dots button'));
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        slides.forEach((slide, j) => {
          slide.classList.toggle('is-current', i === j);
          if (i === j) slide.removeAttribute('aria-hidden');
          else slide.setAttribute('aria-hidden', 'true');
        });
        dots.forEach((d, j) => d.setAttribute('aria-current', String(i === j)));
      });
    });
  });
}
