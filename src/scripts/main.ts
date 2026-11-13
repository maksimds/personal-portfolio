/* ==========================================================================
   Personal portfolio — scripts (loaded on every page by src/layouts/BaseLayout.astro)
   - the chrome: menus, tooltips, single-key shortcuts and the stamp
   - the board as a canvas: panning and zooming the home page on a wide screen
   - the phone menu
   - live clocks (the top-right pill and the hero)
   - objects dropping in, plus the older fade-in and blur-in on pages not yet redesigned
   - the board's connectors (lines between objects) and its drifting cursors
   - embedded prototypes and "before" screenshots, back links, current year in the footer
   - the dots that switch the photo on the About page
   The inline script in the <head> of BaseLayout adds the "js" class to <html> before the page is
   drawn; everything here runs a moment later.
   ========================================================================== */
import { initChrome } from './chrome';
import { initBoard } from './board';
import { initMenu } from './menu';
import { initClock } from './clock';
import { initDropIn, initReveal, initBlurIn } from './reveal';
import { initConnectors } from './connectors';
import { initCursors } from './cursors';
import { initEmbeds } from './embeds';
import { initBackLinks } from './back-links';
import { initYear } from './year';
import { initPhotoDots } from './photos';

initChrome();
initMenu();
initClock();
initDropIn();
initReveal();
initBlurIn();
initConnectors();
initCursors();
initBoard();
initEmbeds();
initBackLinks();
initYear();
initPhotoDots();
