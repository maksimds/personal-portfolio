// @ts-check
import { defineConfig, fontProviders, sharpImageService } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

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
  // Syne and Inter, downloaded from Google Fonts at build time and served from the site itself,
  // with the same weights and axes as the old Google Fonts link. latin-ext covers the ō in dōTERRA
  // and the ₽; the browser only downloads it on pages that use one of those. Astro gives each font
  // its own name (Inter-1a2b3c…), so the CSS uses the variables (--font-sans in styles.css).
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Syne',
      cssVariable: '--font-syne',
      weights: ['400 800'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: [],             // falls back to Inter, in --font-display in styles.css
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
      serialize: (item) => ({ ...item, url: item.url.endsWith('/') ? item.url : item.url + '.html' }),
    }),
  ],
});
