// Checks the home page and the About page as canvases (src/scripts/board.ts): on a desktop each is a
// board you pan and zoom instead of scrolling; the keyboard, links to a section and "View as list"
// all still get you everywhere; and on a phone, or without JavaScript, they're ordinary pages.
const { test, expect } = require('@playwright/test');

// Where the board's layer is drawn: its offset on screen and its zoom
const layer = (page) => page.locator('.board__layer').evaluate((el) => {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
});
// Where the CSS alone draws the layer (as it does before the script runs)
const drawnByCss = (page) => page.locator('.board__layer').evaluate((el) => {
  const set = el.style.transform;
  el.style.transform = '';
  const m = new DOMMatrix(getComputedStyle(el).transform);
  el.style.transform = set;
  return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
});
const isCanvas = (page) => page.evaluate(() => document.documentElement.classList.contains('is-canvas'));
const zoomLabel = (page) => page.locator('[data-zoom-value]');

test.describe('the home page on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
    await expect(page.locator('.intro__title')).toBeInViewport();
  });

  test('is a canvas that starts on the intro, at 75%, and does not scroll', async ({ page }) => {
    expect(await isCanvas(page)).toBe(true);
    await expect(zoomLabel(page)).toHaveText('75%');
    expect((await layer(page)).zoom).toBe(0.75);
    // The CSS draws the board in the same place and at the same size as the script, so nothing jumps
    expect(await drawnByCss(page)).toEqual(await layer(page));
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.locator('.zoom')).toBeVisible();
    await expect(page.locator('[data-tool="hand"]')).toBeVisible();
  });

  test('it opens with the top of the welcome sign level with the bottom of the top pills, however tall the screen', async ({ page }) => {
    for (const height of [900, 700, 1200]) {
      await page.setViewportSize({ width: 1440, height });
      await page.reload();
      await expect(page.locator('.intro__title')).toBeInViewport();
      const { sign, pills, intro, mid } = await page.evaluate(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const i = box('[data-drag="intro"]');
        return { sign: box('[data-cursor-welcome]').top, pills: box('.chrome--top .pill').bottom, intro: i.top, mid: (i.left + i.right) / 2 };
      });
      expect(Math.abs(sign - pills), `${height}px tall`).toBeLessThan(1);
      // The intro under it (88 on the board: the sign and the 24 between them) and centred across
      expect(intro - sign).toBeCloseTo(88 * 0.75, 0);
      expect(Math.abs(mid - 720)).toBeLessThan(1);
    }
  });

  test('from 75%, the zoom pill goes to the next tenth: 80% in, 70% out', async ({ page }) => {
    await page.locator('[data-zoom="in"]').click();
    await expect(zoomLabel(page)).toHaveText('80%');
    await page.reload();
    await expect(zoomLabel(page)).toHaveText('75%');
    await page.locator('[data-zoom="out"]').click();
    await expect(zoomLabel(page)).toHaveText('70%');
  });

  test('scrolling pans the board', async ({ page }) => {
    const before = await layer(page);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(120, 300);
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 120, y: before.y - 300, zoom: 0.75 });
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
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 200, y: before.y - 200, zoom: 0.75 });
  });

  test('holding Space drags the board with the pointer tool', async ({ page }) => {
    const before = await layer(page);
    await page.mouse.move(1300, 760);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(1200, 700, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 100, y: before.y - 60, zoom: 0.75 });
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
    await expect.poll(() => layer(page)).toEqual({ x: before.x - 80, y: before.y - 80, zoom: 0.75 });
  });

  test('tabbing to something off screen brings it into view', async ({ page }) => {
    const last = page.locator('.site-footer .footer-link').last();
    await expect(last).not.toBeInViewport();
    for (let i = 0; i < 60 && !(await last.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(last).toBeFocused();
    // All of it (at 75% its edges fall between pixels, so a hair under 1)
    await expect(last).toBeInViewport({ ratio: 0.99 });
  });

  test('"Work" and "Side projects" sit side by side under the intro, their cards in order', async ({ page }) => {
    const names = (id) => page.locator(`#${id} .work-card__name`).allTextContents();
    expect(await names('work')).toEqual(['dōTERRA', 'tap.', 'Focal']);
    expect(await names('side-projects')).toEqual(['Polka', 'Kalorie', 'Lynea', 'Turblend']);
    await expect(page.locator('#work-title')).toHaveText('Work');
    await expect(page.locator('#side-projects-title')).toHaveText('Side projects');
    await expect(page.locator('#side-projects .work-card').first()).toContainText('Designed and developed a macOS app that lives in the notch');
    // Polka's card (its demo playing, rather than a logo) leads to its case study. Its clip, and
    // Kalorie's and Lynea's (each prototype in its phone frame), are as tall as the logos' marks
    // and aren't read out (the card is named by the project)
    await expect(page.locator('#side-projects .work-card').first().locator('.work-card__link')).toHaveAttribute('href', '/projects/polka-case-study.html');
    await expect(page.locator('#side-projects .work-card').first().locator('.work-card__thumb--wide')).toHaveCount(1);
    const canPlay = await page.evaluate(() => !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'));
    for (const [i, src] of [[0, '/videos/polka-card.mp4'], [1, '/videos/kalorie-card.mp4'], [2, '/videos/lynea-card.mp4']]) {
      const clip = page.locator('#side-projects .work-card').nth(i).locator('.work-card__thumb video');
      await expect(clip).toHaveAttribute('src', src);
      await expect(clip).toHaveAttribute('aria-hidden', 'true');
      expect(await clip.evaluate((v) => v.offsetHeight)).toBe(64);
      if (canPlay) await expect.poll(() => clip.evaluate((v) => !v.paused && v.currentTime > 0)).toBe(true);
    }

    const boxes = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      return {
        intro: box(document.querySelector('[data-drag="intro"]')),
        work: box(document.querySelector('#work')),
        side: box(document.querySelector('#side-projects')),
        cards: [...document.querySelectorAll('#side-projects .work-card')].map(box),
      };
    });
    // Both below the intro, their tops level, "Work" on the left, and the intro centred over the pair
    expect(boxes.work.top).toBeGreaterThan(boxes.intro.bottom);
    expect(Math.abs(boxes.work.top - boxes.side.top)).toBeLessThan(1);
    expect(boxes.work.right).toBeLessThan(boxes.side.left);
    expect(Math.abs((boxes.work.left + boxes.side.right) / 2 - (boxes.intro.left + boxes.intro.right) / 2)).toBeLessThan(1);
    // Three to a row in "Side projects": Turblend starts the second, under Polka
    const [polka, kalorie, lynea, turblend] = boxes.cards;
    for (const card of [kalorie, lynea]) expect(Math.abs(card.top - polka.top)).toBeLessThan(4);
    expect(turblend.top).toBeGreaterThan(polka.bottom);
    expect(Math.abs(turblend.left - polka.left)).toBeLessThan(4);
  });

  test('the sections are 193px under the intro, and the footer is centred under "Work", clear of "Side projects"', async ({ page }) => {
    // Once everything has dropped in, which moves it a few pixels
    await page.waitForFunction(() => document.getAnimations().every((a) => a.animationName !== 'drop-in' || a.playState === 'finished'));
    const { intro, work, side, footer, zoom } = await page.evaluate(() => {
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      return { intro: box('[data-drag="intro"]'), work: box('#work'), side: box('#side-projects'), footer: box('.site-footer'), zoom: new DOMMatrix(getComputedStyle(document.querySelector('.board__layer')).transform).a };
    });
    expect(Math.round((work.top - intro.bottom) / zoom)).toBe(193);
    expect(Math.abs((footer.top - work.bottom) / zoom - 152)).toBeLessThan(1);
    expect(Math.abs((footer.left + footer.right) / 2 - (work.left + work.right) / 2)).toBeLessThan(1);
    expect(footer.right).toBeLessThan(side.left);
  });

  test('"see my work" splits, a branch to each section, and there is no line to the footer', async ({ page }) => {
    const line = page.locator('[data-connector][data-from="intro-notes"]');
    await expect(line).toHaveClass(/\bis-ready\b/);
    await expect(page.locator('[data-connector]')).toHaveCount(1);
    const drawn = await line.evaluate((el) => {
      const svg = el.querySelector('svg');
      const toScreen = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y }; };
      // Each branch is a subpath: where it starts and ends; each arrowhead, where its point is
      const branches = el.querySelector('.connector__line').getAttribute('d').split('M').filter(Boolean).map((part) => {
        const nums = part.match(/-?[\d.]+/g).map(Number);
        return { from: toScreen(nums[0], nums[1]), to: toScreen(nums.at(-2), nums.at(-1)), turns: nums };
      });
      const tips = el.querySelector('.connector__head').getAttribute('d').split('M').filter(Boolean).map((part) => { const [x, y] = part.match(/-?[\d.]+/g).map(Number); return toScreen(x, y); });
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
      const label = el.querySelector('.connector__label').getBoundingClientRect();
      return { branches, tips, label: { x: label.left + label.width / 2, y: label.top + label.height / 2 }, notes: box('#intro-notes'), intro: box('[data-drag="intro"]'), work: box('#work'), side: box('#side-projects') };
    });
    // Both branches start at the same place, under the middle of the stickies
    expect(drawn.branches).toHaveLength(2);
    expect(drawn.tips).toHaveLength(2);
    const [toWork, toSide] = drawn.branches;
    expect(toWork.from).toEqual(toSide.from);
    expect(Math.abs(toWork.from.x - (drawn.notes.left + drawn.notes.right) / 2)).toBeLessThan(1);
    // Each arrowhead points into the top of its section, in the middle
    const [workTip, sideTip] = drawn.tips;
    for (const [tip, section] of [[workTip, drawn.work], [sideTip, drawn.side]]) {
      expect(Math.abs(tip.x - (section.left + section.right) / 2)).toBeLessThan(1);
      expect(tip.y).toBeLessThan(section.top);
      expect(section.top - tip.y).toBeLessThan(10);
    }
    // The label is on the trunk, where it splits, below the intro and above the sections
    expect(Math.abs(drawn.label.x - toWork.from.x)).toBeLessThan(1);
    expect(drawn.label.y).toBeGreaterThan(drawn.intro.bottom + 10);
    expect(drawn.label.y).toBeLessThan(Math.min(drawn.work.top, drawn.side.top) - 10);
  });

  test('a link to the works moves the board there', async ({ page }) => {
    // It starts lower down, its tab only just showing under the intro
    expect(await page.locator('#work').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThan(400);
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

  test('is a canvas that starts on the name and the photo, at 80%', async ({ page }) => {
    expect(await isCanvas(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    await expect(page.locator('.about-photo')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.zoom')).toBeVisible();
    await expect(zoomLabel(page)).toHaveText('80%');
    expect((await layer(page)).zoom).toBe(0.8);
    // The CSS draws the board in the same place and at the same size as the script, so nothing jumps
    // when the script takes over
    expect(await drawnByCss(page)).toEqual(await layer(page));
  });

  test('scrolling pans the board', async ({ page }) => {
    const before = await layer(page);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => layer(page)).toEqual({ x: before.x, y: before.y - 300, zoom: 0.8 });
  });

  test('the footer\'s tab starts about as far under "What I believe in" as the rows are apart', async ({ page }) => {
    // Once everything has dropped in, which moves it a few pixels
    await page.waitForFunction(() => document.getAnimations().every((a) => a.animationName !== 'drop-in' || a.playState === 'finished'));
    const gap = await page.evaluate(() => {
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.board__layer')).transform).a;
      const believe = document.querySelector('#believe').getBoundingClientRect();
      const tab = document.querySelector('.site-footer .board-section__tab').getBoundingClientRect();
      return (tab.top - believe.bottom) / zoom;
    });
    expect(gap).toBeGreaterThan(100);
    expect(gap).toBeLessThan(140);
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

  test('"View as list" turns it into a page that scrolls; back on the canvas, it opens at 80% again', async ({ page }) => {
    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    expect(await isCanvas(page)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
    await expect(page.locator('#about-title')).toBeInViewport();

    await page.locator('[data-pref="list"]').click();
    expect(await isCanvas(page)).toBe(true);
    await expect(zoomLabel(page)).toHaveText('80%');
    expect((await layer(page)).zoom).toBe(0.8);
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
