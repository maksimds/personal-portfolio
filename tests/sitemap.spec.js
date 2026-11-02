// Checks the sitemap against the built site: search engines can find it at the addresses they look
// for, and it lists every page once, at the address in its canonical tag, with the day it last changed.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { dist, pages } = require('./helpers');

const read = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
const tag = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>(.*?)</${name}>`, 'g'))].map((m) => m[1]);

test('robots.txt points to the sitemap index, and the index to the list of pages', () => {
  const [, address] = /^Sitemap: (.+)$/m.exec(read('robots.txt'));
  expect(tag(read(new URL(address).pathname), 'loc')).toEqual(['https://dmaksimoff.com/sitemap-0.xml']);
});

test('the list of pages is also at /sitemap.xml', () => {
  expect(read('sitemap.xml')).toBe(read('sitemap-0.xml'));
});

test('every page is listed once, at the address in its canonical tag', async ({ page }) => {
  const canonicals = [];
  for (const file of pages.filter((p) => p !== '404.html')) {
    await page.goto(file);
    canonicals.push(await page.locator('link[rel="canonical"]').getAttribute('href'));
  }
  expect(tag(read('sitemap.xml'), 'loc').sort()).toEqual(canonicals.sort());
});

test('every page says when it last changed', () => {
  for (const entry of tag(read('sitemap.xml'), 'url')) {
    const [address] = tag(entry, 'loc');
    const [date] = tag(entry, 'lastmod');
    // No date usually means the build ran on a shallow clone: see fetch-depth in the workflows
    expect(date, `${address} has a date`).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(new Date(date).getTime(), `${address} isn't dated in the future`).toBeLessThan(Date.now() + 24 * 60 * 60 * 1000);
  }
});
