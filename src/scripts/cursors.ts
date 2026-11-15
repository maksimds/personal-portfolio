/* ---------- Drifting cursors ----------
   The decorative cursors (src/components/board/Cursor.astro) drift with a CSS animation; this
   stops each one while it's off screen, so it costs nothing where nobody can see it. A cursor
   that plays a scene instead (the home page's, src/scripts/intro-cursor.ts) looks after itself. */
export function initCursors(): void {
  const cursors = document.querySelectorAll('[data-cursor]:not([data-cursor-script])');
  if (!cursors.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => entry.target.classList.toggle('is-paused', !entry.isIntersecting));
  }, { rootMargin: '160px' });
  cursors.forEach((cursor) => io.observe(cursor));
}
