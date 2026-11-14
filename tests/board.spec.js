// Checks the home page and the About page as canvases (src/scripts/board.ts): on a desktop each is a
// board you pan and zoom instead of scrolling; the keyboard, links to a section and "View as list"
// all still get you everywhere; and on a phone, or without JavaScript, they're ordinary pages.
const { test, expect } = require('@playwright/test');

// Where the board's layer is drawn: its offset on screen and its zoom
const layer = (page) => page.locator('.board__layer').evaluate((el) => {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
});
const isCanvas = (page) => page.evaluate(() => document.documentElement.classList.contains('is-canvas'));
const zoomLabel = (page) => page.locator('[data-zoom-value]');

test.describe('the home page on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
    await expect(page.locator('.intro__title')).toBeInViewport();
  });

  test('is a canvas that starts on the intro and does not scroll', async ({ page }) => {
    expect(await isCanvas(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.locator('.zoom')).toBeVisible();
    await expect(page.locator('[data-tool="hand"]')).toBeVisible();
  });

  test('scrolling pans the board', async ({ page }) => {
    const before = await layer(page);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(120, 300);
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 120, y: before.y - 300, zoom: 1 });
  });

  test('Ctrl + scroll and the zoom pill zoom, between 50% and 150%', async ({ page }) => {
    await page.mouse.move(700, 450);
    await page.keyboard.down('Control');
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect(zoomLabel(page)).toHaveText('150%');
    expect((await layer(page)).zoom).toBe(1.5);
    await expect(page.locator('[data-zoom="in"]')).toBeDisabled();

    for (let i = 0; i < 12; i++) await page.locator('[data-zoom="out"]').click({ force: true });
    await expect(zoomLabel(page)).toHaveText('50%');
    await expect(page.locator('[data-zoom="out"]')).toBeDisabled();

    await page.locator('[data-zoom="reset"]').click();
    await expect(zoomLabel(page)).toHaveText('100%');
  });

  test('the hand tool drags the board, and the pointer tool does not', async ({ page }) => {
    const before = await layer(page);
    const drag = async () => {
      await page.mouse.move(1300, 760);
      await page.mouse.down();
      await page.mouse.move(1100, 560, { steps: 4 });
      await page.mouse.up();
    };
    await drag();
    expect(await layer(page)).toEqual(before);

    await page.keyboard.press('h');
    await expect(page.locator('[data-tool="hand"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-tool="select"]')).toHaveAttribute('aria-pressed', 'false');
    await drag();
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 200, y: before.y - 200, zoom: 1 });
  });

  test('holding Space drags the board with the pointer tool', async ({ page }) => {
    const before = await layer(page);
    await page.mouse.move(1300, 760);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(1200, 700, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 100, y: before.y - 60, zoom: 1 });
  });

  test('with reduced motion, stickies sit straight and the cursors are gone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.intro .sticky').first()).toHaveCSS('rotate', 'none');
    await expect(page.locator('[data-cursor]').first()).toBeHidden();
    await expect(page.locator('.tool--stamp')).toBeHidden();
  });

  test('the arrow keys pan', async ({ page }) => {
    const before = await layer(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 80, y: before.y - 80, zoom: 1 });
  });

  test('tabbing to something off screen brings it into view', async ({ page }) => {
    const last = page.locator('a.work-card__link').last();
    await expect(last).not.toBeInViewport();
    for (let i = 0; i < 60 && !(await last.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(last).toBeFocused();
    await expect(last).toBeInViewport({ ratio: 1 });
  });

  test('a link to the works moves the board there', async ({ page }) => {
    await expect(page.locator('#work')).not.toBeInViewport({ ratio: 0.5 });
    await page.locator('.toolbar [data-shortcut="w"]').click();
    await expect(page).toHaveURL(/#work$/);
    await expect(page.locator('#work-title')).toBeInViewport();
    await expect.poll(() => page.locator('#work').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(120);
  });

  test('"View as list" turns it into a page that scrolls, and remembers', async ({ page }) => {
    await page.locator('#help-button').click();
    const toggle = page.locator('[data-pref="list"]');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await isCanvas(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expect(page.locator('.zoom')).toBeHidden();

    await page.reload();
    expect(await isCanvas(page)).toBe(false);

    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    expect(await isCanvas(page)).toBe(true);
    await expect(page.locator('.intro__title')).toBeInViewport();
  });
});

test('opening /#work starts the canvas on the works', async ({ page }) => {
  await page.goto('index.html#work');
  await expect(page.locator('#work-title')).toBeInViewport();
  await expect.poll(() => page.locator('#work').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(120);
});

test.describe('the About page on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('about.html');
    await expect(page.locator('#about-title')).toBeInViewport();
  });

  test('is a canvas that starts on the name and the photo', async ({ page }) => {
    expect(await isCanvas(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.locator('.about-photo')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.zoom')).toBeVisible();
  });

  test('scrolling pans the board', async ({ page }) => {
    const before = await layer(page);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => layer(page)).toEqual({ x: before.x, y: before.y - 300, zoom: 1 });
  });

  test('the dots under the photo switch between the photos', async ({ page }) => {
    const slides = page.locator('.about-photos__slide');
    const dots = page.locator('.about-photos__dots button');
    await expect(slides).toHaveCount(3);
    await dots.nth(1).click();
    await expect(slides.nth(1)).toHaveClass(/\bis-current\b/);
    await expect(slides.nth(1)).not.toHaveAttribute('aria-hidden');
    await expect(slides.nth(1)).toHaveCSS('opacity', '1');
    await expect(slides.nth(0)).toHaveAttribute('aria-hidden', 'true');
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(dots.nth(0)).toHaveAttribute('aria-current', 'false');
  });

  test('tabbing to the playlist link brings it into view', async ({ page }) => {
    const link = page.locator('.playlist-link');
    await expect(link).not.toBeInViewport();
    for (let i = 0; i < 60 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
  });

  test('"View as list" turns it into a page that scrolls', async ({ page }) => {
    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    expect(await isCanvas(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expect(page.locator('#about-title')).toBeInViewport();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the home page is an ordinary page: no canvas, no zoom pill, no connectors', async ({ page }) => {
    await page.goto('index.html');
    expect(await isCanvas(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expect(page.locator('.zoom')).toBeHidden();
    await expect(page.locator('[data-connector]').first()).toBeHidden();
    // Nothing is wider than the screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('the About page is an ordinary page too, with nothing wider than the screen', async ({ page }) => {
    await page.goto('about.html');
    expect(await isCanvas(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expect(page.locator('.zoom')).toBeHidden();
    await expect(page.locator('.about-photo')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the home page is an ordinary page', async ({ page }) => {
    await page.goto('index.html');
    expect(await isCanvas(page)).toBe(false);
    await expect(page.locator('.intro__title')).toBeVisible();
    await expect(page.locator('a.work-card__link').first()).toBeVisible();
  });

  test('the About page is an ordinary page: the first photo shows, without the dots', async ({ page }) => {
    await page.goto('about.html');
    expect(await isCanvas(page)).toBe(false);
    await expect(page.locator('#about-title')).toBeVisible();
    await expect(page.locator('.about-photos__slide.is-current img')).toBeVisible();
    await expect(page.locator('.about-photos__dots')).toBeHidden();
    await expect(page.locator('.playlist-link')).toBeVisible();
  });
});
