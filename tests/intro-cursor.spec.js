// Checks the scene the "Denis" cursor plays in the home page's intro (src/scripts/intro-cursor.ts).
// On a desktop canvas it has four parts: hello (a wave and the chat bubble), and one for each
// sticky, where it goes to the end of the marked words, double-clicks, deletes them a letter at a
// time, types them back and clicks away. The parts play in a new order on every visit, never
// opening with the part that opened the visit before. The words themselves never leave the page.
// As a list, with reduced motion and on a phone, nothing plays.
const { test, expect } = require('@playwright/test');

// The stickies in the page's order: the whole line, and the words of it that are retyped
const STICKIES = [
  { text: 'Product Designer @ dōTERRA', words: 'dōTERRA' },
  { text: 'Design roles after graduation in May ’27', words: 'May ’27' },
  { text: 'Mobile apps, websites, platforms & design systems', words: 'design systems' },
];
const cursor = (page) => page.locator('.home-cursor');
const words = (page) => page.locator('[data-cursor-edit]');
const running = (page) => cursor(page).evaluate((el) => el.getAnimations({ subtree: true }).length);
// The order the parts are playing in, as the script remembers it: "2031" is the second sticky,
// hello, the third sticky, the first
const order = (page) => page.evaluate(() => localStorage.getItem('intro-cursor-order'));

// Plays the scene through once, a tenth of a second at a time, and returns what there was to see
// at each moment: the chat bubble, and for each sticky the words that show, the page's own text,
// the outline, the caret, how far the arrow's tip is from the end of the words, and its lines' places
const watch = (page) => page.evaluate(async () => {
  const cursor = document.querySelector('.home-cursor');
  const targets = [...document.querySelectorAll('[data-cursor-edit]')];
  const animations = cursor.getAnimations({ subtree: true });
  const length = animations[0].effect.getComputedTiming().duration;
  animations.forEach((a) => a.pause());
  const seen = [];
  for (let t = 0; t < length; t += 100) {
    animations.forEach((a) => { a.currentTime = t; });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const tip = cursor.querySelector('.cursor__arrow').getBoundingClientRect();
    seen.push({
      t,
      chat: Number(getComputedStyle(cursor.querySelector('.cursor__chat')).opacity) > 0.5,
      stickies: targets.map((target) => {
        const sticky = target.closest('.sticky');
        const strong = sticky.querySelector('strong');
        const lines = target.getClientRects();
        const end = lines[lines.length - 1];
        return {
          shown: [...target.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.data).join(''),
          text: strong.textContent,
          outlined: getComputedStyle(sticky).outlineStyle === 'solid',
          caret: !!target.querySelector('.type-caret'),
          fromEnd: Math.round(Math.hypot(tip.left + 2.4 - end.right, tip.top + 2.4 - (end.top + end.height / 2))),
          // Where the sticky and each line of its text are: none of it may move
          layout: [sticky, strong].flatMap((el) => [...el.getClientRects()]).map((box) => [box.left, box.top, box.width, box.height].map(Math.round).join(' ')).join(', '),
        };
      }),
    });
  }
  animations.forEach((a) => { a.currentTime = 0; });
  return { length, seen };
});

// Any moments of the scene when part of the cursor (the arrow, the name, the chat bubble while it
// shows) is outside the intro
const outside = (page) => page.evaluate(() => {
  const cursor = document.querySelector('.home-cursor');
  const intro = document.querySelector('[data-drag="intro"]').getBoundingClientRect();
  const animations = cursor.getAnimations({ subtree: true });
  const length = animations[0].effect.getComputedTiming().duration;
  const out = [];
  for (let t = 0; t < length; t += 50) {
    animations.forEach((a) => { a.pause(); a.currentTime = t; });
    for (const el of cursor.children) {
      if (Number(getComputedStyle(el).opacity) < 0.5) continue;
      const b = el.getBoundingClientRect();
      if (b.left < intro.left || b.top < intro.top || b.right > intro.right || b.bottom > intro.bottom) out.push(`${el.getAttribute('class')} at ${t}ms`);
    }
  }
  animations.forEach((a) => { a.currentTime = 0; a.play(); });
  return out;
});

test.describe('on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
    await expect.poll(() => running(page)).toBe(3);
  });

  test('it says hello and retypes the words on each sticky, one part at a time, in the order it picked', async ({ page }) => {
    const played = await order(page);
    expect(played.split('').sort().join('')).toBe('0123');
    const { length, seen } = await watch(page);
    expect(length, `order ${played}`).toBeGreaterThan(25000);
    expect(length, `order ${played}`).toBeLessThan(50000);

    const hello = seen.filter((s) => s.chat);
    expect(hello.length).toBeGreaterThan(20);
    const starts = [hello[0].t];        // when each part starts to show: hello, then the stickies in the page's order

    STICKIES.forEach(({ text, words: whole }, i) => {
      const at = seen.map((s) => ({ t: s.t, chat: s.chat, ...s.stickies[i] }));
      const where = `order ${played}, "${whole}"`;

      // The page's own text is whole at every moment, whatever shows, and nothing on the sticky moves
      expect([...new Set(at.map((s) => s.text))], where).toEqual([text]);
      expect([...new Set(at.map((s) => s.layout))], where).toHaveLength(1);

      // It's selected for one stretch of the scene, with nothing else going on meanwhile: no chat
      // bubble, and no other sticky outlined or with a caret
      const selected = at.filter((s) => s.outlined);
      starts.push(selected[0].t);
      expect(selected.at(-1).t - selected[0].t, where).toBe((selected.length - 1) * 100);
      const meanwhile = seen.filter((s) => s.t >= selected[0].t && s.t <= selected.at(-1).t);
      expect(meanwhile.some((s) => s.chat || s.stickies.some((other, j) => j !== i && (other.outlined || other.caret))), where).toBe(false);

      // The caret arrives with the arrow's tip at the end of the words, and only ever shows on
      // the outlined sticky; without it, the words are all there
      const editing = at.filter((s) => s.caret);
      expect(editing[0].shown, where).toBe(whole);
      expect(editing[0].fromEnd, where).toBeLessThan(6);
      expect(editing.every((s) => s.outlined), where).toBe(true);
      expect(at.filter((s) => !s.caret && s.shown !== whole), where).toEqual([]);

      // The words only get shorter until they're gone, then only longer until they're back:
      // always the start of the words, never anything else
      const lengths = editing.map((s) => s.shown.length);
      const empty = lengths.indexOf(0);
      expect(empty, where).toBeGreaterThan(0);
      expect(editing.every((s) => whole.startsWith(s.shown)), where).toBe(true);
      for (let n = 1; n < lengths.length; n++) {
        if (n <= empty) expect(lengths[n], where).toBeLessThanOrEqual(lengths[n - 1]);
        else expect(lengths[n], where).toBeGreaterThanOrEqual(lengths[n - 1]);
      }
      expect(editing.at(-1).shown, where).toBe(whole);
    });

    // The parts came in the order it picked, and by the end every sticky is as it was
    expect([0, 1, 2, 3].sort((a, b) => starts[a] - starts[b]).join('')).toBe(played);
    expect(seen.at(-1).stickies.some((s) => s.outlined || s.caret)).toBe(false);
    await expect(words(page).locator('*')).toHaveCount(0);
  });

  test('every visit plays the parts in a new order, opening with a different one, and stays inside the intro', async ({ page }) => {
    const orders = [await order(page)];
    expect(await outside(page)).toEqual([]);
    for (let visit = 0; visit < 7; visit++) {
      await page.reload();
      await expect.poll(() => running(page)).toBe(3);
      orders.push(await order(page));
      expect(await outside(page), `order ${orders.at(-1)}`).toEqual([]);
    }
    // Coming back to it from another page...
    await page.goto('about.html');
    await page.goBack();
    await expect.poll(() => running(page)).toBe(3);
    orders.push(await order(page));
    // ...and a page the browser kept as it was left and shows again (the back/forward cache, which
    // the test browser has turned off; its "pageshow" event is played here on the page itself)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => order(page)).not.toBe(orders.at(-1));
    await expect.poll(() => running(page)).toBe(3);
    orders.push(await order(page));
    await expect(words(page).locator('*')).toHaveCount(0);

    for (const [i, o] of orders.entries()) {
      expect(o.split('').sort().join(''), orders.join(' ')).toBe('0123');
      if (i) expect(o[0], orders.join(' ')).not.toBe(orders[i - 1][0]);
    }
    expect(new Set(orders).size, orders.join(' ')).toBeGreaterThan(3);
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
    expect(long.length).toBeGreaterThanOrEqual(3);
    for (const m of long) {
      const a = m[0];
      const b = m.at(-1);
      const far = Math.hypot(b.x - a.x, b.y - a.y);
      const bow = Math.max(...m.map((p) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / far));
      expect(bow).toBeGreaterThan(far * 0.03);
    }
  });

  test('"View as list" stops it and leaves the words as they were; back on the canvas it starts again', async ({ page }) => {
    // Left in the middle of an edit, with some of the words gone
    await page.evaluate(async () => {
      const animations = document.querySelector('.home-cursor').getAnimations({ subtree: true });
      animations.forEach((a) => a.pause());
      const length = animations[0].effect.getComputedTiming().duration;
      for (let t = 0; t < length && !document.querySelector('[data-cursor-edit] .type-rest'); t += 50) {
        animations.forEach((a) => { a.currentTime = t; });
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
    });
    await expect(page.locator('[data-cursor-edit] .type-caret')).toHaveCount(1);
    await expect(page.locator('.intro .sticky.is-edited')).toHaveCount(1);

    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    await expect(cursor(page)).toBeHidden();
    await expect(words(page).locator('*')).toHaveCount(0);
    await expect(words(page)).toHaveText(STICKIES.map((s) => s.words));
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
  await expect(words(page)).toHaveText(STICKIES.map((s) => s.words));
  await expect(words(page).locator('*')).toHaveCount(0);
});
