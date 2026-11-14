// Checks the visitor's own cursor (src/scripts/user-cursor.ts): with a mouse, a Charcoal arrow saying
// "Me" follows the pointer in place of the system one, stays above the open menus, and steps aside
// for the hand tool; after a click to another page it's already there; on a phone it never shows.
const { test, expect } = require('@playwright/test');

const cursor = (page) => page.locator('[data-user-cursor]');
// Where the arrow's tip is drawn: the element's top-left corner plus the tip's 2.4px
const tip = (page) => cursor(page).evaluate((el) => {
  const box = el.getBoundingClientRect();
  return { x: Math.round(box.left + 2.4), y: Math.round(box.top + 2.4) };
});
const systemPointer = (page, selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).cursor);

test('with a mouse, the arrow with "Me" follows the pointer and the system pointer is hidden', async ({ page }) => {
  await page.goto('about.html');
  await expect(cursor(page)).toBeHidden();             // nothing until the mouse moves
  await page.mouse.move(400, 300);
  await expect(cursor(page)).toBeVisible();
  await expect(cursor(page)).toHaveText('Me');
  await expect.poll(() => tip(page)).toEqual({ x: 400, y: 300 });
  expect(await systemPointer(page, '.toolbar a')).toBe('none');

  await page.mouse.move(700, 520);
  await expect.poll(() => tip(page)).toEqual({ x: 700, y: 520 });
  // It's only a picture: clicks go to what's under it
  expect(await cursor(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
});

test('the arrow stays above an open menu', async ({ page }) => {
  await page.goto('about.html');
  await page.mouse.move(400, 300);
  // The top layer draws what went in last on top, so note the order the two open in
  await page.evaluate(() => {
    window.opened = [];
    document.addEventListener('toggle', (e) => { if (e.newState === 'open') window.opened.push(e.target.id || 'arrow'); }, true);
  });
  await page.locator('.page-switch--desktop').click();
  await expect(page.locator('#page-menu')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.opened)).toEqual(['page-menu', 'arrow']);
  await expect(cursor(page)).toBeVisible();
  const box = await page.locator('#page-menu a').first().boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await expect(cursor(page)).toBeVisible();
  // The menu still works through it
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await expect(page).toHaveURL(/\/(index\.html)?$/);
});

test('the hand tool brings back the system grab pointer', async ({ page }) => {
  await page.goto('index.html');
  await page.mouse.move(700, 450);
  await expect(cursor(page)).toBeVisible();
  await page.keyboard.press('h');
  await expect(cursor(page)).toBeHidden();
  expect(await systemPointer(page, '.board')).toBe('grab');
  await page.keyboard.press('v');
  await expect(cursor(page)).toBeVisible();
});

test('after a click to another page, the arrow is already where the mouse is', async ({ page }) => {
  await page.goto('about.html');
  const link = page.locator('.toolbar [data-shortcut="w"]');
  const box = await link.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await link.click();
  await expect(page).toHaveURL(/#work$/);
  await expect(cursor(page)).toBeVisible();
  // Within a pixel: the click lands on a half pixel, which the browser rounds
  await expect.poll(async () => {
    const at = await tip(page);
    return Math.abs(at.x - (box.x + box.width / 2)) <= 1 && Math.abs(at.y - (box.y + box.height / 2)) <= 1;
  }).toBe(true);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the arrow never shows', async ({ page }) => {
    await page.goto('about.html');
    await page.locator('h1').tap();
    await expect(cursor(page)).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.classList.contains('has-user-cursor'))).toBe(false);
  });
});
