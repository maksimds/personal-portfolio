/* ==========================================================================
   Personal portfolio — scripts (loaded on every page by src/layouts/BaseLayout.astro)
   - the chrome: menus, tooltips, single-key shortcuts and the stamp
   - the board as a canvas: panning and zooming the home page on a wide screen, and moving the
     big objects on it around
   - the phone menu
   - live clocks (the top-right pill and the hero)
   - objects dropping in as they come into view
   - the board's connectors (lines between objects), its drifting cursors, and the visitor's own
     cursor that follows the mouse
   - embedded prototypes and "before" screenshots, back links, current year in the footer
   - the dots that switch the photo on the About page
   The inline script in the <head> of BaseLayout adds the "js" class to <html> before the page is
   drawn; everything here runs a moment later.
   ========================================================================== */
import { initChrome } from './chrome';
import { initBoard } from './board';
import { initDrag } from './drag';
import { initMenu } from './menu';
import { initClock } from './clock';
import { initDropIn } from './reveal';
import { initConnectors } from './connectors';
import { initCursors } from './cursors';
import { initUserCursor } from './user-cursor';
import { initEmbeds } from './embeds';
import { initBackLinks } from './back-links';
import { initYear } from './year';
import { initPhotoDots } from './photos';

initChrome();
initMenu();
initClock();
initDropIn();
initConnectors();
initCursors();
initUserCursor();
initDrag(initBoard());
initEmbeds();
initBackLinks();
initYear();
initPhotoDots();
