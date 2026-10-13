// Checks that nothing animated stays hidden: on every page, at every screen size in playwright.config.js,
// with reduced motion and without JavaScript.
const { test, expect } = require('@playwright/test');
const { pages, ANIMATED, scrollThrough, collectErrors } = require('./helpers');

for (const url of pages) {
  test.describe(url, () => {
    test('every animated line ends up visible, with no errors', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(url);
      await scrollThrough(page);

      // Each line must reach full opacity (each check waits up to 5s for its animation to finish)
      for (const line of await page.locator(ANIMATED).all()) {
        await expect(line).toHaveCSS('opacity', '1');
      }
      // ...and every scroll-triggered line must have been triggered
      for (const line of await page.locator('.blur-in, .reveal').all()) {
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

      // Checked without waiting. Right after load, no blur-in may be playing (the heroes' would be),
      // and right after scrolling to the bottom, nothing may still be hidden or fading in (the last
      // lines to come into view would be).
      await page.goto(url);
      expect(await page.evaluate(() => document.getAnimations().filter((a) => a.animationName === 'blur-in').length)).toBe(0);
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
  });
}
