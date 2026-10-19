// Checks the home page's structured data for search engines (the schema.org "Person" in
// src/pages/index.astro): it's valid JSON, says who the site is about, and its photo exists.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { dist } = require('./helpers');

test('the home page says who the site is about', async ({ page }) => {
  await page.goto('/');
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks).toHaveLength(1);

  const person = JSON.parse(blocks[0]);
  expect(person).toMatchObject({ '@context': 'https://schema.org', '@type': 'Person', url: 'https://dmaksimoff.com/' });
  expect(person.name).toBe(await page.locator('.site-title').innerText());

  // The photo's address is on the live site; the same file must be in the build
  const photo = new URL(person.image);
  expect(photo.origin).toBe('https://dmaksimoff.com');
  expect(fs.existsSync(path.join(dist, photo.pathname)), `${photo.pathname} is in dist/`).toBe(true);
});
