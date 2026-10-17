/* ---------- Back links ----------
   A link with data-back returns to the previous page when the visitor came from this site;
   otherwise it follows its href (the home page). */
export function initBackLinks(): void {
  document.querySelectorAll('[data-back]').forEach((link) => {
    link.addEventListener('click', (e) => {
      let fromHere = false;
      try { fromHere = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch {}
      if (fromHere && history.length > 1) {
        e.preventDefault();
        history.back();
      }
    });
  });
}
