// Checks the floating pills and the toolbar (src/components/board/, src/scripts/chrome.ts): the
// menus list the site's pages, the single-key shortcuts do what their buttons do, and the switch
// that turns them off works and is remembered.
const { test, expect } = require('@playwright/test');
const { pages } = require('./helpers');

test('the page switcher lists every page and marks the current one', async ({ page }) => {
  await page.goto('about.html');
  await page.locator('.page-switch--desktop').click();
  const menu = page.locator('#page-menu');
  await expect(menu).toBeVisible();
  // Every page of the site except the 404 page
  await expect(menu.locator('a')).toHaveCount(pages.length - 1);
  await expect(menu.locator('[aria-current="page"]')).toHaveText('About');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('a shortcut key does what its tool does', async ({ page }) => {
  await page.goto('index.html');
  await page.keyboard.press('i');
  await expect(page.locator('#more-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('?');
  await expect(page.locator('#help')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('a');
  await expect(page).toHaveURL(/about\.html$/);
  await expect(page.locator('.toolbar [data-shortcut="a"]')).toHaveAttribute('aria-current', 'page');
});

test('shortcut keys with Ctrl held are left to the browser', async ({ page }) => {
  await page.goto('index.html');
  await page.keyboard.press('Control+i');
  await expect(page.locator('#more-menu')).toBeHidden();
});

test('the shortcuts can be switched off, and stay off', async ({ page }) => {
  await page.goto('index.html');
  await page.locator('#help-button').click();
  const toggle = page.locator('[data-pref="shortcuts"]');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  await page.keyboard.press('i');
  await expect(page.locator('#more-menu')).toBeHidden();
  await page.reload();
  await page.keyboard.press('i');
  await expect(page.locator('#more-menu')).toBeHidden();
  // The buttons themselves still work
  await page.locator('#more-button').click();
  await expect(page.locator('#more-menu')).toBeVisible();
});

test('a tool shows its tooltip on keyboard focus, and Escape hides it', async ({ page }) => {
  await page.goto('about.html');
  await page.locator('.toolbar [data-shortcut="w"]').focus();
  await page.keyboard.press('Tab');
  const tip = page.locator('#tip-about');
  await expect(page.locator('.toolbar [data-shortcut="a"]')).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(/About\s*A/);
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the page switcher opens the full-screen menu, and Escape closes it', async ({ page }) => {
    await page.goto('index.html');
    const toggle = page.locator('.menu-toggle');
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    await expect(menu.locator('a[href="/about.html"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeHidden();
  });
});
