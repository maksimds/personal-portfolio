// @ts-check
import { defineConfig } from 'astro/config';
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
  integrations: [
    mdx(),
    // Every built page except the 404 page. With build.format 'file' the integration leaves out
    // the .html, so it's added back: the sitemap lists the same addresses as the canonical tags.
    sitemap({
      filter: (page) => !page.includes('/404'),
      serialize: (item) => ({ ...item, url: item.url.endsWith('/') ? item.url : item.url + '.html' }),
    }),
  ],
});
