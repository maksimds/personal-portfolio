// Checks that Google Analytics counts every page on the live site, and only there. Each page must load
// js/analytics.js. On dmaksimoff.com the tag must start with the Measurement ID (skipped while the ID is
// empty, which turns Analytics off); on any other address (your own previews, these checks) nothing may
// go to Google. The live address is faked: the browser is handed the local files as if they came from
// dmaksimoff.com, and Google's tag is stopped before it loads, so no test visit is ever counted.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { pages } = require('./helpers');

const root = path.join(__dirname, '..');
const GOOGLE = /^https:\/\/www\.googletagmanager\.com\//;
const id = fs.readFileSync(path.join(root, 'js/analytics.js'), 'utf8').match(/MEASUREMENT_ID = '([^']*)'/)[1];

for (const url of pages) {
  test(`${url}: loads Google Analytics`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('head script[src$="js/analytics.js"]')).toHaveCount(1);
  });
}

test('on dmaksimoff.com, Google Analytics starts with the Measurement ID', async ({ page }) => {
  test.skip(!id, 'no Measurement ID in js/analytics.js yet, so Analytics is off');
  await page.route('https://dmaksimoff.com/**', (route) => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    return route.fulfill({ path: path.join(root, file) });
  });
  const requested = [];
  await page.route(GOOGLE, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ body: '' });
  });

  await page.goto('https://dmaksimoff.com/');
  await expect.poll(() => requested, { message: 'Google\'s tag was not loaded with the Measurement ID' })
    .toEqual([`https://www.googletagmanager.com/gtag/js?id=${id}`]);
});

test('anywhere else, nothing goes to Google', async ({ page }) => {
  const requested = [];
  page.on('request', (r) => { if (GOOGLE.test(r.url())) requested.push(r.url()); });
  await page.goto('index.html');
  expect(requested).toEqual([]);
  expect(await page.evaluate(() => typeof window.gtag)).toBe('undefined');
});
