// Checks that nothing animated stays hidden on every page: after scrolling through it (on desktop and
// on a phone), with reduced motion, without JavaScript and in a very tall window (desktop only, since
// screen size doesn't change those).
const { test, expect } = require('@playwright/test');
const { pages, ANIMATED, scrollThrough, collectErrors } = require('./helpers');

for (const url of pages) {
  test.describe(url, () => {
    test('every animated line ends up visible, with no errors', { tag: '@phone' }, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(url);
      await scrollThrough(page);

      // Each line must reach full opacity (each check waits up to 5s for its animation to finish)
      for (const line of await page.locator(ANIMATED).all()) {
        await expect(line).toHaveCSS('opacity', '1');
      }
      // ...and must have been triggered by coming into view
      for (const line of await page.locator(ANIMATED).all()) {
        await expect(line).toHaveClass(/\bis-visible\b/);
      }
      expect(errors).toEqual([]);
    });

    test('with reduced motion, everything shows straight away', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const hiddenNow = () => page.evaluate((sel) =>
        [...document.querySelectorAll(sel)]
          .filter((el) => getComputedStyle(el).opacity !== '1')
          .map((el) => `<${el.tagName.toLowerCase()} class="${el.className}">`), ANIMATED);

      // Checked without waiting. Right after load, nothing may be dropping in (what's on screen would
      // be), and right after scrolling to the bottom, nothing may still be hidden or on its way in
      // (the last objects to come into view would be).
      await page.goto(url);
      expect(await page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'drop-in').length)).toBe(0);
      await scrollThrough(page);
      expect(await hiddenNow()).toEqual([]);
    });

    test.describe('without JavaScript', () => {
      test.use({ javaScriptEnabled: false });

      test('everything still shows', async ({ page }) => {
        await page.goto(url);
        for (const line of await page.locator(ANIMATED).all()) {
          await expect(line).toHaveCSS('opacity', '1');
        }
      });
    });

    // A search engine may draw the page in one very tall window, without scrolling, so nothing may
    // wait to be scrolled to there.
    test.describe('in a very tall window', () => {
      test.use({ viewport: { width: 412, height: 12000 } });

      test('everything shows without scrolling', async ({ page }) => {
        await page.goto(url);
        for (const line of await page.locator(ANIMATED).all()) {
          await expect(line).toHaveCSS('opacity', '1');
        }
      });
    });
  });
}
