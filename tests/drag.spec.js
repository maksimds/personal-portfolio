// Checks moving the board's objects (src/scripts/drag.ts): on a desktop canvas the intro, the works,
// the About page's sections, photo and playlist, and the footer can be picked up with the pointer
// tool and put somewhere else. A plain click still works, the lines follow, the places last while
// you go to another page and back, and a reload puts everything back.
const { test, expect } = require('@playwright/test');

// How far an object has been moved from its place in the layout (its left and top, in board pixels)
const moved = (page, name) => page.locator(`[data-drag="${name}"]`).evaluate((el) => {
  const style = getComputedStyle(el);
  return { x: Math.round(parseFloat(style.left)), y: Math.round(parseFloat(style.top)) };
});
const layer = (page) => page.locator('.board__layer').evaluate((el) => {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
});
// Presses the mouse on the middle of an element, moves it by (dx, dy) and lets go
async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
// Where the "see my work" line starts on the board
const lineStart = (page) => page.locator('[data-from="intro-notes"] .connector__line').evaluate((el) => {
  const [x, y] = el.getAttribute('d').slice(1).split(' ').map(Number);
  return { x: Math.round(x), y: Math.round(y) };
});

test.describe('the home page on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
    await expect(page.locator('.intro__title')).toBeInViewport();
    await expect(page.locator('[data-from="intro-notes"]')).toHaveClass(/\bis-ready\b/);
  });

  test('pressing on the intro and moving the mouse moves it, not the board, and the line follows', async ({ page }) => {
    const board = await layer(page);
    const line = await lineStart(page);
    const title = await page.locator('.intro__title').boundingBox();
    await page.mouse.move(title.x + 40, title.y + title.height / 2);
    await page.mouse.down();
    await page.mouse.move(title.x + 140, title.y + title.height / 2 + 60, { steps: 8 });
    // Picked up: a selection outline, and the text isn't being selected
    await expect(page.locator('[data-drag="intro"]')).toHaveClass(/\bis-dragged\b/);
    await expect(page.locator('[data-drag="intro"]')).toHaveCSS('outline-color', 'rgb(13, 153, 255)');
    await page.mouse.up();

    await expect.poll(() => moved(page, 'intro')).toEqual({ x: 100, y: 60 });
    await expect(page.locator('[data-drag="intro"]')).not.toHaveClass(/\bis-dragged\b/);
    expect(await layer(page)).toEqual(board);
    expect(await page.evaluate(() => getSelection().toString())).toBe('');
    await expect.poll(() => lineStart(page)).toEqual({ x: line.x + 100, y: line.y + 60 });
  });

  test('"My works" moves when dragged by a card, without opening it; a click still opens it', async ({ page }) => {
    await page.locator('.toolbar [data-shortcut="w"]').click();
    await expect.poll(() => page.locator('#work').evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(120);
    const card = page.locator('a.work-card__link').first();
    await drag(page, card, 150, -50);
    await expect.poll(() => moved(page, 'work')).toEqual({ x: 150, y: -50 });
    expect(page.url()).toMatch(/index\.html#work$/);

    await card.click();
    await expect(page).toHaveURL(/\/projects\/.+-case-study\.html$/);
  });

  test('the places last while you go to another page and back, and a reload puts everything back', async ({ page }) => {
    await drag(page, page.locator('.intro__title'), 100, 60);
    await expect.poll(() => moved(page, 'intro')).toEqual({ x: 100, y: 60 });

    // Back on the page, the intro is drawn in its new place before the page's script runs
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') window.earlyLeft = getComputedStyle(document.querySelector('[data-drag="intro"]')).left;
      });
    });
    await page.goto('about.html');
    await page.goto('index.html');
    expect(await moved(page, 'intro')).toEqual({ x: 100, y: 60 });
    expect(await page.evaluate(() => window.earlyLeft)).toBe('100px');
    expect(await moved(page, 'work')).toEqual({ x: 0, y: 0 });

    await page.reload();
    expect(await moved(page, 'intro')).toEqual({ x: 0, y: 0 });
    await page.goto('about.html');
    await page.goto('index.html');
    expect(await moved(page, 'intro')).toEqual({ x: 0, y: 0 });
  });

  test('with the hand tool, dragging an object pans the board instead', async ({ page }) => {
    const board = await layer(page);
    await page.keyboard.press('h');
    await drag(page, page.locator('.intro__title'), -100, -60);
    await expect.poll(() => layer(page)).toEqual({ x: board.x - 100, y: board.y - 60, zoom: 1 });
    expect(await moved(page, 'intro')).toEqual({ x: 0, y: 0 });
  });

  test('held at the edge of the screen, the board pans by itself; nothing goes off the board', async ({ page }) => {
    const title = await page.locator('.intro__title').boundingBox();
    await page.mouse.move(title.x + 40, title.y + 10);
    await page.mouse.down();
    await page.mouse.move(title.x - 100, title.y + 10, { steps: 4 });
    await page.mouse.move(1, title.y + 10, { steps: 4 });
    // The board pans until its left edge reaches the screen's...
    await expect.poll(() => layer(page).then((l) => l.x)).toBe(0);
    await page.mouse.up();
    // ...and the intro stops 96px in from it
    const left = await page.locator('[data-drag="intro"]').evaluate((el) => Math.round(el.getBoundingClientRect().left));
    expect(left).toBe(96);
  });

  test('"View as list" puts everything back in the page\'s order, and the canvas brings the places back', async ({ page }) => {
    await drag(page, page.locator('.intro__title'), 100, 60);
    await expect.poll(() => moved(page, 'intro')).toEqual({ x: 100, y: 60 });
    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    expect(await moved(page, 'intro')).toEqual({ x: 0, y: 0 });
    await page.locator('[data-pref="list"]').click();
    expect(await moved(page, 'intro')).toEqual({ x: 100, y: 60 });
  });
});

test.describe('the About page on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('about.html');
    await expect(page.locator('#about-title')).toBeInViewport();
  });

  test('the photo moves and comes to the front, and its dots still switch the photos', async ({ page }) => {
    const photo = page.locator('[data-drag="photo"]');
    await drag(page, photo.locator('.about-photos__frame'), -300, 120);
    await expect.poll(() => moved(page, 'photo')).toEqual({ x: -300, y: 120 });
    expect(Number(await photo.evaluate((el) => getComputedStyle(el).zIndex)))
      .toBeGreaterThan(Number(await page.locator('[data-drag="about"]').evaluate((el) => getComputedStyle(el).zIndex)));

    const dots = page.locator('.about-photos__dots button');
    await dots.nth(2).click();
    await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
  });

  test('each section, the playlist and the footer can be moved', async ({ page }) => {
    for (const name of ['about', 'who', 'do', 'believe', 'playlist', 'footer']) {
      const el = page.locator(`[data-drag="${name}"]`);
      // Pan it to the middle of the screen, then move it a little
      const box = await el.boundingBox();
      await page.mouse.move(720, 450);
      await page.mouse.wheel(box.x + box.width / 2 - 720, box.y + Math.min(box.height / 2, 200) - 450);
      await expect.poll(() => el.evaluate((node) => Math.round(node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2))).toBe(720);
      const now = await el.boundingBox();
      await page.mouse.move(now.x + 30, now.y + 20);
      await page.mouse.down();
      await page.mouse.move(now.x + 70, now.y + 50, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => moved(page, name), name).toEqual({ x: 40, y: 30 });
    }
  });
});

test('on a phone the objects stay in the page\'s order', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  await page.goto('index.html');
  // A place kept from earlier in the tab is ignored on a page that scrolls
  await page.evaluate(() => sessionStorage.setItem('moved', JSON.stringify({ home: { intro: [100, 60, 2] } })));
  await page.goto('index.html');
  await expect(page.locator('#moved-places')).toHaveCount(0);   // the script has taken over
  expect(await moved(page, 'intro')).toEqual({ x: 0, y: 0 });
  await phone.close();
});
