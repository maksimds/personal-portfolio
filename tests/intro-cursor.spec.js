// Checks the scene the "Denis" cursor plays in the home page's intro (src/scripts/intro-cursor.ts):
// on a desktop canvas it says hello, then goes to the end of "design systems" on the Focus sticky,
// double-clicks, deletes the words a letter at a time and types them back, and clicks away. The
// words themselves never leave the page. As a list, with reduced motion and on a phone, nothing plays.
const { test, expect } = require('@playwright/test');

const WORDS = 'design systems';
const cursor = (page) => page.locator('.home-cursor');
const words = (page) => page.locator('[data-cursor-edit]');
const running = (page) => cursor(page).evaluate((el) => el.getAnimations({ subtree: true }).length);

// Plays the scene through once, a tenth of a second at a time, and returns what there was to see
// at each moment: the words that show, the page's own text, the outline, the caret, the chat bubble
// and where the arrow's tip is (from the end of the words, when they're all there)
const watch = (page) => page.evaluate(async () => {
  const cursor = document.querySelector('.home-cursor');
  const target = document.querySelector('[data-cursor-edit]');
  const sticky = target.closest('.sticky');
  const animations = cursor.getAnimations({ subtree: true });
  const length = animations[0].effect.getComputedTiming().duration;
  animations.forEach((a) => a.pause());
  const seen = [];
  for (let t = 0; t < length; t += 100) {
    animations.forEach((a) => { a.currentTime = t; });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const lines = target.getClientRects();
    const end = lines[lines.length - 1];
    const tip = cursor.querySelector('.cursor__arrow').getBoundingClientRect();
    seen.push({
      t,
      shown: [...target.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.data).join(''),
      text: sticky.querySelector('strong').textContent,
      outlined: getComputedStyle(sticky).outlineStyle === 'solid',
      caret: !!target.querySelector('.type-caret'),
      chat: Number(getComputedStyle(cursor.querySelector('.cursor__chat')).opacity) > 0.5,
      fromEnd: Math.round(Math.hypot(tip.left + 2.4 - end.right, tip.top + 2.4 - (end.top + end.height / 2))),
      height: Math.round(sticky.getBoundingClientRect().height),
    });
  }
  animations.forEach((a) => { a.currentTime = 0; });
  return { length, seen };
});

test.describe('on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
    await expect.poll(() => running(page)).toBe(3);
  });

  test('it says hello, then deletes "design systems" and types it back', async ({ page }) => {
    const { length, seen } = await watch(page);
    expect(length).toBeGreaterThan(15000);
    expect(length).toBeLessThan(40000);

    // The page's own text is whole at every moment, whatever shows
    expect([...new Set(seen.map((s) => s.text))]).toEqual(['Mobile apps, websites, platforms & design systems']);

    // Hello comes first, and is over before the editing starts
    const editing = seen.filter((s) => s.caret);
    const hello = seen.filter((s) => s.chat);
    expect(hello.length).toBeGreaterThan(20);
    expect(hello.at(-1).t).toBeLessThan(editing[0].t);

    // The caret arrives with the arrow's tip at the end of the words, and the sticky outlined
    expect(editing[0].shown).toBe(WORDS);
    expect(editing[0].fromEnd).toBeLessThan(6);
    expect(editing.every((s) => s.outlined)).toBe(true);
    expect(seen.filter((s) => !s.caret && s.shown !== WORDS)).toEqual([]);

    // The words only get shorter until they're gone, then only longer until they're back: always
    // the start of "design systems", never anything else
    const lengths = editing.map((s) => s.shown.length);
    const empty = lengths.indexOf(0);
    expect(empty).toBeGreaterThan(0);
    expect(editing.every((s) => WORDS.startsWith(s.shown))).toBe(true);
    for (let i = 1; i < lengths.length; i++) {
      if (i <= empty) expect(lengths[i]).toBeLessThanOrEqual(lengths[i - 1]);
      else expect(lengths[i]).toBeGreaterThanOrEqual(lengths[i - 1]);
    }
    expect(editing.at(-1).shown).toBe(WORDS);

    // The sticky never changes size, and afterwards it's as it was: no outline, no caret
    expect([...new Set(seen.map((s) => s.height))]).toHaveLength(1);
    const after = seen.filter((s) => s.t > editing.at(-1).t);
    expect(after.length).toBeGreaterThan(5);
    expect(after.some((s) => s.outlined || s.caret)).toBe(false);
    await expect(words(page).locator('*')).toHaveCount(0);
  });

  test('it moves like a hand: in arcs, never in a jump, and to a stop between moves', async ({ page }) => {
    const path = await page.evaluate(() => {
      const cursor = document.querySelector('.home-cursor');
      const animation = cursor.getAnimations()[0];
      const length = animation.effect.getComputedTiming().duration;
      animation.pause();
      const points = [];
      for (let t = 0; t < length; t += 20) {
        animation.currentTime = t;
        const box = cursor.getBoundingClientRect();
        points.push({ x: box.left, y: box.top });
      }
      animation.currentTime = 0;
      return points;
    });
    const steps = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
    expect(Math.max(...steps)).toBeLessThan(40);                              // under 2000px a second
    expect(steps.filter((d) => d < 0.05).length).toBeGreaterThan(steps.length / 3);   // it rests a good part of the time

    // Each long move bows away from the straight line between its ends
    const moves = [];
    let from = null;
    steps.forEach((d, i) => {
      if (d >= 0.05 && from === null) from = i;
      if (d < 0.05 && from !== null) { moves.push(path.slice(from, i + 1)); from = null; }
    });
    const long = moves.filter((m) => Math.hypot(m.at(-1).x - m[0].x, m.at(-1).y - m[0].y) > 150);
    expect(long.length).toBeGreaterThanOrEqual(4);
    for (const m of long) {
      const a = m[0];
      const b = m.at(-1);
      const far = Math.hypot(b.x - a.x, b.y - a.y);
      const bow = Math.max(...m.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / far));
      expect(bow).toBeGreaterThan(far * 0.03);
    }
  });

  test('"View as list" stops it and leaves the words as they were; back on the canvas it starts again', async ({ page }) => {
    // Left in the middle of the editing, with half the words gone
    await page.evaluate(async () => {
      const animations = document.querySelector('.home-cursor').getAnimations({ subtree: true });
      const target = document.querySelector('[data-cursor-edit]');
      animations.forEach((a) => a.pause());
      const length = animations[0].effect.getComputedTiming().duration;
      for (let t = 0; t < length && !(target.querySelector('.type-caret') && target.firstChild.data.length < 8); t += 50) {
        animations.forEach((a) => { a.currentTime = t; });
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
    });
    await expect(words(page).locator('.type-caret')).toHaveCount(1);

    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    await expect(cursor(page)).toBeHidden();
    await expect(words(page).locator('*')).toHaveCount(0);
    await expect(words(page)).toHaveText(WORDS);
    await expect(page.locator('.intro .sticky.is-edited')).toHaveCount(0);
    expect(await running(page)).toBe(0);

    await page.locator('[data-pref="list"]').click();
    await expect(cursor(page)).toBeVisible();
    await expect.poll(() => running(page)).toBe(3);
  });

  test('with reduced motion it never starts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(cursor(page)).toBeHidden();
    await page.waitForTimeout(600);
    expect(await running(page)).toBe(0);
    await expect(words(page).locator('*')).toHaveCount(0);
  });
});

test('on a phone there\'s no cursor, and the words are plain text', { tag: '@phone' }, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone\'s check');
  await page.goto('index.html');
  await expect(cursor(page)).toBeHidden();
  await page.waitForTimeout(600);
  expect(await running(page)).toBe(0);
  await expect(words(page)).toHaveText(WORDS);
  await expect(words(page).locator('*')).toHaveCount(0);
});
