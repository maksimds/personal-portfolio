// @ts-check
import { execFileSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { defineConfig, fontProviders, sharpImageService } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// The day a page's own content last changed, from the git history, for its date in the sitemap.
// Changes to the shared layout and styles don't count. Left out if the history isn't there: a shallow
// clone (GitHub's default, hence fetch-depth in the workflows) would date every page the same day.
/** @param {string} url */
function lastChanged(url) {
  /** @param {string[]} args */
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  /** @param {string[]} args */
  const changed = (...args) => git('log', '-1', '--format=%cs', ...args);
  const { pathname } = new URL(url);
  const caseStudy = pathname.match(/^\/projects\/(.+)-case-study\.html$/);
  try {
    if (git('rev-parse', '--is-shallow-repository') === 'true') return undefined;
    if (caseStudy) return changed('--', `src/content/projects/${caseStudy[1]}.mdx`) || undefined;
    if (pathname === '/about.html') return changed('--', 'src/pages/about.astro') || undefined;
    // The home page: its own files, and the lines of each case study that appear in its row
    return [
      changed('--', 'src/pages/index.astro', 'src/components/home'),
      changed('-G^(order|published|title|listDescription|thumb):', '--', 'src/content/projects', ':!src/content/projects/_template.mdx'),
    ].sort().at(-1) || undefined;
  } catch {
    return undefined;
  }
}

export default defineConfig({
  site: 'https://dmaksimoff.com',
  // No `base`: the custom domain serves the site from the root
  build: { format: 'file' },   // about.astro builds to about.html, so every current URL stays the same
  trailingSlash: 'never',
  // Keep the whitespace exactly as written. Astro 7's default ('jsx') drops the spaces between
  // elements on separate lines, which can move text that sits next to an arrow or a link.
  compressHTML: false,
  // The AVIF copies of the images (see src/components/Img.astro) at quality 65 instead of the default
  // 50, which visibly softens fine detail in the screenshots and photos.
  image: { service: sharpImageService({ avif: { quality: 65 } }) },
  // Inter and Roboto Mono, downloaded from Google Fonts at build time and served from the site
  // itself. Inter is all the board's text; Roboto Mono is the "technical" labels (facts, metadata,
  // the clock). latin-ext covers the ō in dōTERRA and the ₽; the browser only downloads it on pages
  // that use one of those. Astro gives each font its own name (Inter-1a2b3c…), so the CSS uses the
  // variables (--font-sans and --font-mono in styles.css).
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Roboto Mono',
      cssVariable: '--font-roboto-mono',
      weights: ['400 600'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: [],             // falls back to the system's monospace font, in --font-mono in styles.css
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-inter',
      // Only 400 is ever set in italic, but asking Google for upright Inter alone returns a
      // re-cut file that draws text slightly differently, so the italic covers 400 to 700 too
      weights: ['400 700'],
      styles: ['normal', 'italic'],
      subsets: ['latin', 'latin-ext'],
      options: { experimental: { variableAxis: { opsz: [['14', '32']] } } },
      // The same fallbacks as before. The arrows (→ ←) aren't in Inter's files, so they're drawn
      // with the system font; Astro's size-adjusted Arial fallback would come first and draw them instead.
      fallbacks: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
      optimizedFallbacks: false,
    },
  ],
  integrations: [
    // Case study text stays exactly as written: no automatic curly quotes or dashes
    mdx({ smartypants: false }),
    // Every built page except the 404 page. With build.format 'file' the integration leaves out
    // the .html, so it's added back: the sitemap lists the same addresses as the canonical tags.
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize: (item) => {
        const url = item.url.endsWith('/') ? item.url : item.url + '.html';
        return { ...item, url, lastmod: lastChanged(url) };
      },
    }),
    // The list of pages is also at /sitemap.xml, the address people and tools try first. Runs after
    // the integration above, which writes sitemap-0.xml and the sitemap-index.xml pointing to it.
    {
      name: 'sitemap-xml',
      hooks: {
        'astro:build:done': async ({ dir }) => {
          await copyFile(new URL('sitemap-0.xml', dir), new URL('sitemap.xml', dir));
        },
      },
    },
  ],
});
