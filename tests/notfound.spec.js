// Checks the page-not-found page (src/pages/404.astro): the message and the way back are on the
// first screen, search engines are told not to list it, and "Go back" returns to the page the
// visitor came from on this site, or goes home when they came from somewhere else.
const { test, expect } = require('@playwright/test');

test('the message and the way back are on the first screen', { tag: '@phone' }, async ({ page }) => {
  await page.goto('404.html');
  await expect(page.locator('h1')).toHaveText('This page does not exist.');
  await expect(page.locator('h1')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.notfound__back')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  // Nothing is wider than the screen
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('"Go back" goes home for a visitor who came from somewhere else', async ({ page }) => {
  await page.goto('404.html');
  await page.locator('.notfound__back').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.intro__title')).toBeVisible();
});

test('"Go back" returns to the page the visitor came from on this site', async ({ page, baseURL }) => {
  await page.goto('about.html');
  await page.goto('404.html', { referer: `${baseURL}/about.html` });
  await page.locator('.notfound__back').click();
  await expect(page).toHaveURL(/about\.html$/);
});
