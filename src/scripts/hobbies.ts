/* ---------- About: the hobby stickers ----------
   A sticker on "Who I am" with the class "hobby" plays a short scene when it's pointed at, or
   tapped on a touch screen (🎾: a racket hits the ball, src/components/about/HobbyTennis.astro;
   ♞: the knight takes a queen, src/components/about/HobbyChess.astro; 📚: the top book opens as the
   two under it fly away, src/components/about/HobbyBooks.astro; ✈️: the plane flies round the
   world, src/components/about/HobbyTravel.astro).
   The class is-playing starts it (see "The hobby stickers" in src/styles/styles.css) and comes off
   when its last animation ends, so the scene always plays to the end, and pointing at the sticker
   again plays it again. Nothing plays for visitors who have turned on reduced motion. */
export function initHobbies(): void {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll<HTMLElement>('.hobby').forEach((hobby) => {
    const play = (): void => {
      if (reduce.matches || hobby.classList.contains('is-playing')) return;
      hobby.classList.add('is-playing');
    };
    // A finger "enters" the sticker as it starts to scroll past it, so on a touch screen it takes a tap
    hobby.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') play(); });
    hobby.addEventListener('click', play);
    hobby.addEventListener('animationend', () => {
      if (!hobby.getAnimations({ subtree: true }).some((a) => a.playState === 'running')) hobby.classList.remove('is-playing');
    });
  });
}
