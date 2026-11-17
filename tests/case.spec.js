// Checks the case studies (src/components/case/): each is a page that scrolls, never a canvas; its
// sections carry their headings; the links that open a panel under them ("See how it was before",
// "View prototype", "App Store link") work with the mouse and the keyboard; and on a phone nothing
// is wider than the screen.
const { test, expect } = require('@playwright/test');
const { pages } = require('./helpers');

const cases = pages.filter((url) => url.startsWith('projects/'));

// Figma's embeds are never loaded by the checks
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/([a-z]+\.)?figma\.com\//, (route) => route.abort());
});

for (const url of cases) {
  test(`${url}: a page that scrolls, with a title, a status and its sections`, { tag: '@phone' }, async ({ page }) => {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.classList.contains('is-canvas'))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expect(page.locator('.case-head h1')).toBeVisible();
    await expect(page.locator('.case-status')).toBeVisible();
    await expect(page.locator('.case-hero img')).toBeVisible();
    await expect(page.locator('.zoom')).toBeHidden();
    // Every section has a heading with words in it, and its tab
    const sections = page.locator('.case-section');
    expect(await sections.count()).toBeGreaterThan(0);
    for (const section of await sections.all()) {
      await expect(section.locator('h2')).toHaveText(/\S/);
      await expect(section.locator('.board-section__tab')).toHaveCount(1);
    }
    // Nothing is wider than the screen (asked again for a moment, in case the page is still settling)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const url of cases) {
  test(`${url}: the status stamp is 15% smaller than a large stamp, its words on one line inside it`, { tag: '@phone' }, async ({ page }) => {
    await page.goto(url);
    const stamp = page.locator('.case-status');
    await expect(stamp).not.toHaveText(/In development/);
    const size = await stamp.evaluate((el) => {
      const style = getComputedStyle(el);
      const range = document.createRange();
      range.selectNodeContents(el);
      return {
        width: parseFloat(style.width),
        height: parseFloat(style.height),
        fontSize: parseFloat(style.fontSize),
        lines: range.getClientRects().length,
        // Wider than the inside of the white ring would make it scroll sideways (rotation doesn't count here)
        overflows: el.scrollWidth > el.clientWidth,
      };
    });
    expect(size.width).toBeCloseTo(112 * 0.85, 1);
    expect(size.height).toBeCloseTo(112 * 0.85, 1);
    expect(size.fontSize).toBeCloseTo(14 * 0.85, 1);
    expect(size.lines).toBe(1);
    expect(size.overflows).toBe(false);
  });
}

test('a title with a colon is split into the tab and a heading, and still reads as one', async ({ page }) => {
  await page.goto('projects/doterra-case-study.html');
  const title = page.locator('.case-section__title').first();
  await expect(title.locator('.board-section__tab')).toHaveText('Problem:');
  expect(await title.evaluate((el) => el.textContent)).toMatch(/^Problem: \S/);
});

test('"See how it was before" opens the old screen under the new one, and closes it again', async ({ page }) => {
  await page.goto('projects/doterra-case-study.html');
  const link = page.locator('[data-embed="login-before"]');
  const panel = page.locator('#login-before');
  await expect(link).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.locator('img')).not.toBeInViewport();

  await link.click();
  await expect(link).toHaveAttribute('aria-expanded', 'true');
  await expect(link).toHaveText(/Hide how it was before/);
  await expect(panel.locator('img')).toBeInViewport();

  // Space works too, as on any button
  await link.focus();
  await page.keyboard.press('Space');
  await expect(link).toHaveAttribute('aria-expanded', 'false');
  await expect(link).toHaveText(/See how it was before/);
});

test('"View prototype" adds the embed only when it is opened', async ({ page }) => {
  await page.goto('projects/kalorie-case-study.html');
  const link = page.locator('[data-embed="prototype-1"]');
  const panel = page.locator('#prototype-1');
  await expect(panel.locator('iframe')).toHaveCount(0);
  await link.click();
  await expect(link).toHaveText(/Hide prototype/);
  await expect(panel.locator('iframe')).toHaveCount(1);
  await expect(panel.locator('iframe')).toHaveAttribute('src', /^https:\/\/embed\.figma\.com\//);
  await expect(panel.locator('iframe')).toHaveAttribute('title', /\S/);
});

test('"All work" leads to the works on the home page', async ({ page }) => {
  await page.goto('projects/tap-case-study.html');
  await page.locator('.case-back').click();
  await expect(page).toHaveURL(/\/#work$/);
  await expect(page.locator('#work-title')).toBeInViewport();
});

test('a side project\'s "All work" leads to the side projects', async ({ page }) => {
  await page.goto('projects/kalorie-case-study.html');
  await page.locator('.case-back').click();
  await expect(page).toHaveURL(/\/#side-projects$/);
  await expect(page.locator('#side-projects-title')).toBeInViewport();
  await expect.poll(() => page.locator('#side-projects').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(120);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the links that open a panel are plain links to the same thing', async ({ page }) => {
    await page.goto('projects/kalorie-case-study.html');
    const link = page.locator('[data-embed="prototype-1"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.figma\.com\/proto\//);
    await expect(link).toHaveAttribute('target', '_blank');
  });
});
