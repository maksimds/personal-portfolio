/* ==========================================================================
   Personal portfolio — scripts (loaded on every page by src/layouts/BaseLayout.astro)
   - header height and the "scroll back" header (hides on scroll down, shows on scroll up)
   - mobile menu toggle
   - live local clock in the hero
   - fade-in on scroll, and blur-in on scroll (My works, About, footer)
   - cursor-following glow behind the hero and footers
   - embedded prototypes and "before" screenshots, back links, current year in the footer
   - the dots that switch the photo on the About page
   The inline script at the end of BaseLayout adds the "js" class to <html> before the page is
   drawn; everything here runs a moment later, in the same order as before.
   ========================================================================== */
import { initHeaderHeight, initScrollHeader } from './header';
import { initMenu } from './menu';
import { initClock } from './clock';
import { initReveal, initBlurIn } from './reveal';
import { initGlows } from './glow';
import { initEmbeds } from './embeds';
import { initBackLinks } from './back-links';
import { initYear } from './year';
import { initPhotoDots } from './photos';

initHeaderHeight();
initMenu();
initScrollHeader();
initClock();
initReveal();
initBlurIn();
initGlows();
initEmbeds();
initBackLinks();
initYear();
initPhotoDots();
