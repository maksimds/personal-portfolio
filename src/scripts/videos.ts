/* ---------- Clips that play while they're in view ----------
   A <video data-loop> (src/components/Video.astro) plays, muted and in a loop, while at least a
   quarter of it is on screen, and pauses when it isn't: scrolled away, or in a closed "See demo"
   panel, whose box is clipped to nothing. Nothing is downloaded until it first plays. For visitors
   who've asked for less motion it stays on its still, with the controls to play it (data-controls)
   unless it's inside a link. */
export function initVideos(): void {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-loop]')];
  if (!videos.length) return;
  const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const inView = new Set<HTMLVideoElement>();

  // With less motion a clip in view is left alone: it plays only if the visitor started it
  const update = (video: HTMLVideoElement) => {
    video.controls = lessMotion.matches && video.hasAttribute('data-controls');
    if (!inView.has(video)) video.pause();
    else if (!lessMotion.matches) video.play().catch(() => {});
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target as HTMLVideoElement;
      if (entry.isIntersecting) inView.add(video);
      else inView.delete(video);
      update(video);
    }
  }, { threshold: 0.25 });

  for (const video of videos) {
    video.muted = true;   // the attribute alone doesn't always count for playing on its own
    observer.observe(video);
  }
  lessMotion.addEventListener('change', () => videos.forEach((video) => {
    if (lessMotion.matches) video.pause();
    update(video);
  }));
}
