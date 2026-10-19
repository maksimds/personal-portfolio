// Full-page screenshots of every page at every screen size in playwright.config.js, compared pixel for
// pixel with the saved ones, so a change that moves or restyles something by accident fails the
// checks. (Made for the Astro migration, to prove the rebuilt site looked the same; kept since.)
// Reduced motion makes the animations finish straight away; the live clock is masked and the glows
// are hidden, since they change all the time.
//
// The screenshots depend on the computer's fonts and browser, so they're only compared on your Mac
// (the saved ones are in tests/visual-baseline.spec.js-snapshots/). After a change you meant to
// make, or for a new page, take new ones and look them over before committing:
// npx playwright test visual-baseline --update-snapshots
const { test, expect } = require('@playwright/test');
const { pages, scrollThrough } = require('./helpers');

test.skip(!!process.env.CI, 'screenshots were taken on macOS; GitHub\'s Linux draws text differently');

for (const url of pages) {
  test(`${url} looks the same`, async ({ page }) => {
    // The hero clock always shows the same time, so its mask is always the same width
    await page.clock.setFixedTime(new Date('2026-10-17T12:00:00-04:00'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);

    // Scroll down so every line is triggered and every lazy image loads, then back to the top,
    // where the header is see-through
    await scrollThrough(page);
    const headerHeight = await page.evaluate(async () => {
      await Promise.all([...document.images].map((img) => img.complete || img.decode().catch(() => {})));
      await document.fonts.ready;
      scrollTo(0, 0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return getComputedStyle(document.documentElement).getPropertyValue('--header-height');
    });
    await expect(page.locator('.site-header')).not.toHaveClass(/\bis-(hidden|solid)\b/);

    // Taking a full-page screenshot briefly resizes the window, and src/scripts/header.ts measures the header
    // again on every resize. On a busy computer it can measure it mid-resize, too short, which moves
    // the whole page up. So the height measured above is kept for the screenshot. The glows are
    // hidden rather than masked: a mask would also cover the hero and footer text on top of them.
    await page.addStyleTag({ content: `
      :root { --header-height: ${headerHeight} !important; }
      .glow__bg { display: none !important; }
    ` });

    const name = url.replace(/\.html$/, '').replace(/\//g, '-') + '.png';
    await expect(page).toHaveScreenshot(name, {
      fullPage: true,
      mask: [page.locator('[data-clock]')],
    });
  });
}
