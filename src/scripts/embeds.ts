/* ---------- Embedded prototypes ----------
   A link with data-embed="<id>" opens and closes the panel with that id (just below it). The
   iframe, whose URL is the panel's data-src, is only created the first time it opens, so the page
   doesn't load the embed until someone asks for it. A panel without data-src just reveals what's
   already in it (e.g. a "before" screenshot). Without JavaScript the link simply opens the
   prototype or image in a new tab. */
export function initEmbeds(): void {
  document.querySelectorAll<HTMLElement>('[data-embed]').forEach((link) => {
    const panel = document.getElementById(link.getAttribute('data-embed') ?? '');
    if (!panel) return;
    const label = link.querySelector('[data-embed-label]');
    const closedText = label ? label.textContent : '';
    const openText = link.getAttribute('data-embed-open-label') || closedText;
    link.setAttribute('role', 'button');
    link.setAttribute('aria-expanded', 'false');
    link.setAttribute('aria-controls', panel.id);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const open = link.getAttribute('aria-expanded') !== 'true';
      if (open && panel.hasAttribute('data-src') && !panel.querySelector('iframe')) {
        const frame = document.createElement('iframe');
        frame.src = panel.getAttribute('data-src') ?? '';
        frame.title = panel.getAttribute('data-title') || '';
        frame.allowFullscreen = true;
        (panel.querySelector('.case-embed__frame') || panel).appendChild(frame);
      }
      link.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
      panel.inert = !open;
      if (label) label.textContent = open ? openText : closedText;
    });
    // As a role="button", the link should also toggle on Space (a plain link only reacts to Enter).
    link.addEventListener('keydown', (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        link.click();
      }
    });
  });
}
