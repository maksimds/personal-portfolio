// Checks the scene the "Denis" cursor plays in the home page's intro (src/scripts/intro-cursor.ts).
// On a desktop canvas it opens with the welcome, played once: it drags out the welcome sign just
// above the intro from its top-left corner to its bottom-right, types "Welcome to my portfolio 🎯"
// into it and clicks away, and the sign stays. The 🎯 is drawn: typed, the target pops up, and
// then a dart flies in and hits it. Then it goes round the stickies, over and over: on
// each it goes to the end of the marked words, double-clicks, deletes them a letter at a time,
// types them back and clicks away. The stickies come in a new order on every visit, never
// starting with the sticky the visit before started with. Their words never leave the page.
// As a list, with reduced motion and on a phone, nothing plays and there's no sign.
const { test, expect } = require('@playwright/test');

// The stickies in the page's order: the whole line, and the words of it that are retyped
const STICKIES = [
  { text: 'Finishing up my Bachelor’s degree in IT', words: 'degree in IT' },
  { text: 'Design roles after graduation in May ’27', words: 'May ’27' },
  { text: 'Mobile apps, websites, platforms & design systems', words: 'design systems' },
];
const WELCOME = 'Welcome to my portfolio 🎯';
const cursor = (page) => page.locator('.home-cursor');
const sign = (page) => page.locator('[data-cursor-welcome]');
const words = (page) => page.locator('[data-cursor-edit]');
// The scene's animations: the cursor's place and its arrow's clicks, the welcome's and the
// rounds', and the sign's size as it's drawn
const running = (page) => page.evaluate(() => [
  ...document.querySelector('.home-cursor').getAnimations({ subtree: true }),
  ...document.querySelector('[data-cursor-welcome]').getAnimations(),
].length);
// The order the parts are playing in, as the script remembers it: "0312" is the welcome, the
// third sticky, the first, the second
const order = (page) => page.evaluate(() => localStorage.getItem('intro-cursor-order'));
// The board's zoom (the page opens at 75%): a size on the screen over this is the size on the board
const zoom = (page) => page.locator('.board__layer').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);

// Plays the scene through once (the welcome and the first round), a tenth of a second at a time,
// and returns what there was to see at each moment: the sign, and for each sticky the words that
// show, the page's own text, the outline, the caret, how far the arrow's tip is from the end of
// the words, and its lines' places. Then a few moments of later rounds, to see the sign stays.
const watch = (page) => page.evaluate(async () => {
  const cursor = document.querySelector('.home-cursor');
  const sign = document.querySelector('[data-cursor-welcome]');
  const targets = [...document.querySelectorAll('[data-cursor-edit]')];
  const animations = [...cursor.getAnimations({ subtree: true }), ...sign.getAnimations()];
  const timing = animations.find((a) => a.effect.getTiming().iterations === Infinity).effect.getTiming();
  const first = timing.delay;
  const round = timing.duration;
  animations.forEach((a) => a.pause());
  const look = async (t) => {
    animations.forEach((a) => { a.currentTime = t; });
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const arrow = cursor.querySelector('.cursor__arrow').getBoundingClientRect();
    const tip = { x: arrow.left + 2.4, y: arrow.top + 2.4 };
    const box = sign.getBoundingClientRect();
    const text = sign.querySelector('.shape__text');
    return {
      t,
      cursor: [Math.round(cursor.getBoundingClientRect().left), Math.round(cursor.getBoundingClientRect().top)].join(' '),
      sign: {
        seen: Number(getComputedStyle(sign).opacity) > 0.5,
        box: { left: box.left, top: box.top, width: box.width, height: box.height },
        // The words typed so far, and the 🎯 at the end once it's typed (a drawing; its character is data-cursor-key)
        shown: [...text.childNodes].map((node) => (node.nodeType === Node.TEXT_NODE ? node.data : node.matches('[data-cursor-key]:not([hidden])') ? node.dataset.cursorKey : '')).join(''),
        outlined: getComputedStyle(sign).outlineStyle === 'solid',
        caret: !!text.querySelector('.type-caret'),
        // How far the arrow's tip is from the sign's bottom-right corner
        fromCorner: Math.hypot(tip.x - box.right, tip.y - box.bottom),
      },
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
          fromEnd: Math.round(Math.hypot(tip.x - end.right, tip.y - (end.top + end.height / 2))),
          // Where the sticky and each line of its text are: none of it may move
          layout: [sticky, strong].flatMap((el) => [...el.getClientRects()]).map((b) => [b.left, b.top, b.width, b.height].map(Math.round).join(' ')).join(', '),
        };
      }),
    };
  };
  const seen = [];
  for (let t = 0; t < first + round; t += 100) seen.push(await look(t));
  const later = [];
  for (const t of [first + round + 50, first + round * 1.5, first + round * 3 + 1234]) later.push({ ...(await look(t)), again: await look(t - round) });
  const intro = document.querySelector('[data-drag="intro"]').getBoundingClientRect();
  animations.forEach((a) => { a.currentTime = 0; });
  return { first, round, seen, later, intro: { left: intro.left, top: intro.top, width: intro.width } };
});

// Any moments of the scene (the welcome and one round) when part of the cursor (the arrow, the
// name) is outside the intro, or above it but higher than the sign (and the arc of the move up to
// its corner)
const outside = (page) => page.evaluate(() => {
  const cursor = document.querySelector('.home-cursor');
  const sign = document.querySelector('[data-cursor-welcome]');
  const intro = document.querySelector('[data-drag="intro"]').getBoundingClientRect();
  const animations = [...cursor.getAnimations({ subtree: true }), ...sign.getAnimations()];
  const timing = animations.find((a) => a.effect.getTiming().iterations === Infinity).effect.getTiming();
  const out = [];
  animations.forEach((a) => { a.pause(); a.currentTime = 0; });
  const top = sign.getBoundingClientRect().top - 8;
  for (let t = 0; t < timing.delay + timing.duration; t += 50) {
    animations.forEach((a) => { a.currentTime = t; });
    for (const el of cursor.children) {
      if (Number(getComputedStyle(el).opacity) < 0.5 || getComputedStyle(el).display === 'none') continue;
      const b = el.getBoundingClientRect();
      if (b.left < intro.left || b.top < top || b.right > intro.right || b.bottom > intro.bottom) out.push(`${el.getAttribute('class')} at ${t}ms`);
    }
  }
  animations.forEach((a) => { a.currentTime = 0; a.play(); });
  return out;
});

test.describe('on a desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('index.html');
    await expect.poll(() => running(page)).toBe(5);
  });

  test('it draws the welcome sign above the intro and types into it, then retypes the words on each sticky, one at a time, in the order it picked', async ({ page }) => {
    const played = await order(page);
    expect(played).toMatch(/^0[123]{3}$/);
    expect(played.split('').sort().join('')).toBe('0123');
    const { first, round, seen, later, intro } = await watch(page);
    expect(first, `order ${played}`).toBeGreaterThan(5000);
    expect(first, `order ${played}`).toBeLessThan(12000);
    expect(round, `order ${played}`).toBeGreaterThan(20000);
    expect(round, `order ${played}`).toBeLessThan(40000);

    // The sign: not there until it's drawn, and from then on there for good
    const drawn = seen.findIndex((s) => s.sign.seen);
    expect(drawn).toBeGreaterThan(0);
    expect(seen.slice(drawn).every((s) => s.sign.seen)).toBe(true);
    const full = seen.at(-1).sign.box;
    const z = await zoom(page);
    expect(Math.round(full.width / z)).toBe(320);
    expect(Math.round(full.height / z)).toBe(64);
    // ...just above the intro, centred over it
    expect(full.top + full.height).toBeLessThan(intro.top);
    expect(intro.top - (full.top + full.height)).toBeLessThan(40);
    expect(Math.abs(full.left + full.width / 2 - (intro.left + intro.width / 2))).toBeLessThan(2);

    // Dragged out from its top-left corner, which stays put, by its bottom-right one, which
    // follows the arrow's tip (once it's bigger than its own border); it only grows, to its full size
    const growing = seen.filter((s) => s.sign.seen && s.sign.box.width < full.width - 0.5);
    expect(growing.length).toBeGreaterThan(2);
    for (const s of seen.slice(drawn)) {
      expect(Math.abs(s.sign.box.left - full.left)).toBeLessThan(0.5);
      expect(Math.abs(s.sign.box.top - full.top)).toBeLessThan(0.5);
    }
    for (const s of growing.filter((g) => g.sign.box.width > 8 && g.sign.box.height > 8)) expect(s.sign.fromCorner, `at ${s.t}ms`).toBeLessThan(3);
    for (let n = drawn + 1; n < seen.length; n++) {
      expect(seen[n].sign.box.width).toBeGreaterThanOrEqual(seen[n - 1].sign.box.width - 0.01);
      expect(seen[n].sign.box.height).toBeGreaterThanOrEqual(seen[n - 1].sign.box.height - 0.01);
    }

    // Selected from the moment it's drawn until the click away, once; typed into only while
    // selected, the words only ever growing, always the start of the welcome, until it's whole
    const selected = seen.filter((s) => s.sign.outlined);
    expect(selected[0].t).toBe(seen[drawn].t);
    expect(selected.at(-1).t - selected[0].t).toBe((selected.length - 1) * 100);
    expect(selected.every((s) => s.sign.seen && s.stickies.every((x) => !x.outlined && !x.caret))).toBe(true);
    const typing = seen.filter((s) => s.sign.caret);
    expect(typing.length).toBeGreaterThan(20);
    expect(typing.every((s) => s.sign.outlined)).toBe(true);
    expect(typing[0].sign.shown).toBe('');
    expect(typing.every((s) => WELCOME.startsWith(s.sign.shown))).toBe(true);
    // The emoji goes in with one key, whole: never half of it on its own
    expect(typing.filter((s) => /[\uD800-\uDBFF]$/.test(s.sign.shown)).map((s) => s.t)).toEqual([]);
    expect(typing.some((s) => s.sign.shown === WELCOME.replace(/ 🎯$/, ' '))).toBe(true);
    for (let n = 1; n < typing.length; n++) expect(typing[n].sign.shown.length).toBeGreaterThanOrEqual(typing[n - 1].sign.shown.length);
    expect(typing.at(-1).sign.shown).toBe(WELCOME);
    expect(seen.filter((s) => s.sign.seen && !s.sign.outlined).every((s) => s.sign.shown === WELCOME)).toBe(true);

    // Later rounds leave it as it is, and play just as the first one did
    for (const s of later) {
      expect(s.sign).toMatchObject({ seen: true, shown: WELCOME, outlined: false, caret: false });
      expect(s.cursor, `at ${s.t}ms`).toBe(s.again.cursor);
    }

    const starts = [seen[drawn].t];       // when each part starts: the welcome, then the stickies in the page's order
    STICKIES.forEach(({ text, words: whole }, i) => {
      const at = seen.map((s) => ({ t: s.t, sign: s.sign, ...s.stickies[i] }));
      const where = `order ${played}, "${whole}"`;

      // The page's own text is whole at every moment, whatever shows, and nothing on the sticky moves
      expect([...new Set(at.map((s) => s.text))], where).toEqual([text]);
      expect([...new Set(at.map((s) => s.layout))], where).toHaveLength(1);

      // It's selected for one stretch of a round, after the welcome, with nothing else going on
      // meanwhile: the sign let go of, and no other sticky outlined or with a caret
      const picked = at.filter((s) => s.outlined);
      starts.push(picked[0].t);
      expect(picked[0].t, where).toBeGreaterThan(selected.at(-1).t);
      expect(picked.at(-1).t - picked[0].t, where).toBe((picked.length - 1) * 100);
      const meanwhile = seen.filter((s) => s.t >= picked[0].t && s.t <= picked.at(-1).t);
      expect(meanwhile.some((s) => s.sign.outlined || s.stickies.some((other, j) => j !== i && (other.outlined || other.caret))), where).toBe(false);

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

  test('every visit opens with the welcome, then goes round the stickies in a new order, starting with a different one, and stays over the intro and the sign', async ({ page }) => {
    const orders = [await order(page)];
    expect(await outside(page)).toEqual([]);
    for (let visit = 0; visit < 7; visit++) {
      await page.reload();
      await expect.poll(() => running(page)).toBe(5);
      orders.push(await order(page));
      expect(await outside(page), `order ${orders.at(-1)}`).toEqual([]);
    }
    // Coming back to it from another page...
    await page.goto('about.html');
    await page.goBack();
    await expect.poll(() => running(page)).toBe(5);
    orders.push(await order(page));
    // ...and a page the browser kept as it was left and shows again (the back/forward cache, which
    // the test browser has turned off; its "pageshow" event is played here on the page itself)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => order(page)).not.toBe(orders.at(-1));
    await expect.poll(() => running(page)).toBe(5);
    orders.push(await order(page));
    await expect(words(page).locator('*')).toHaveCount(0);

    for (const [i, o] of orders.entries()) {
      expect(o, orders.join(' ')).toMatch(/^0[123]{3}$/);
      expect(o.split('').sort().join(''), orders.join(' ')).toBe('0123');
      if (i) expect(o[1], orders.join(' ')).not.toBe(orders[i - 1][1]);
    }
    expect(new Set(orders).size, orders.join(' ')).toBeGreaterThan(2);
  });

  test('it moves like a hand: in arcs, never in a jump, and to a stop between moves', async ({ page }) => {
    const path = await page.evaluate(() => {
      const cursor = document.querySelector('.home-cursor');
      const animations = cursor.getAnimations();
      const timing = animations.find((a) => a.effect.getTiming().iterations === Infinity).effect.getTiming();
      animations.forEach((a) => a.pause());
      const points = [];
      for (let t = 0; t < timing.delay + timing.duration; t += 20) {
        animations.forEach((a) => { a.currentTime = t; });
        const box = cursor.getBoundingClientRect();
        points.push({ x: box.left, y: box.top });
      }
      animations.forEach((a) => { a.currentTime = 0; });
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

  test('the 🎯 goes in as a drawing: first the target pops up, then the dart flies in and hits the bull', async ({ page }) => {
    const target = page.locator('.welcome-target');
    // Not there until its key is typed
    await expect(target).toBeHidden();
    await expect(target).toBeVisible({ timeout: 20_000 });
    const at = (t) => target.evaluate(async (el, t) => {
      el.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = t; });
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const look = (part) => {
        const style = getComputedStyle(el.querySelector(part));
        return { opacity: Number(style.opacity), scale: style.scale, rotate: style.rotate, translate: style.translate };
      };
      return { board: look('.welcome-target__board'), dart: look('.welcome-target__dart'), running: el.getAnimations({ subtree: true }).length };
    }, t);
    expect((await at(0)).running).toBe(3);
    // The target pops up while the dart is still out of sight
    const shown = await at(450);
    expect(shown.board.opacity).toBe(1);
    expect(shown.dart.opacity).toBe(0);
    // The dart on its way, from the top right
    const flying = await at(620);
    expect(flying.dart.opacity).toBe(1);
    const [x, y] = flying.dart.translate.split(' ').map(parseFloat);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(0);
    // At the end: in the bull, at rest, as the emoji is
    const end = await at(1600);
    expect(end.dart).toMatchObject({ opacity: 1, rotate: '-45deg' });
    expect(['none', '0px', '0px 0px']).toContain(end.dart.translate);
    expect(end.board).toMatchObject({ opacity: 1, rotate: '0deg' });
  });

  test('scrolled out of sight and back, it carries on where it was, and the sign stays drawn', async ({ page }) => {
    // Past the welcome: the sign is drawn, and its animation is over
    await page.evaluate(async () => {
      const animations = [...document.querySelector('.home-cursor').getAnimations({ subtree: true }), ...document.querySelector('[data-cursor-welcome]').getAnimations()];
      const first = animations.find((a) => a.effect.getTiming().iterations === Infinity).effect.getTiming().delay;
      animations.forEach((a) => { a.currentTime = first + 500; });
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    await expect(sign(page)).toHaveCSS('opacity', '1');
    await expect(sign(page)).toHaveText(WELCOME);
    // Off screen and back on (the board panned away and back)
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 900);
    await expect(cursor(page)).not.toBeInViewport();
    await page.mouse.wheel(0, -900);
    await expect(cursor(page)).toBeInViewport();
    await page.waitForTimeout(400);
    await expect(sign(page)).toHaveCSS('opacity', '1');
    await expect(sign(page)).toHaveText(WELCOME);
    expect(Math.round(await sign(page).evaluate((el) => el.getBoundingClientRect().width) / await zoom(page))).toBe(320);
    await expect(sign(page)).not.toHaveCSS('outline-style', 'solid');
  });

  test('"View as list" stops it and leaves the words as they were; back on the canvas it starts again', async ({ page }) => {
    // Left in the middle of an edit, with some of the words gone
    await page.evaluate(async () => {
      const animations = [...document.querySelector('.home-cursor').getAnimations({ subtree: true }), ...document.querySelector('[data-cursor-welcome]').getAnimations()];
      animations.forEach((a) => a.pause());
      const timing = animations.find((a) => a.effect.getTiming().iterations === Infinity).effect.getTiming();
      for (let t = 0; t < timing.delay + timing.duration && !document.querySelector('[data-cursor-edit] .type-rest'); t += 50) {
        animations.forEach((a) => { a.currentTime = t; });
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      }
    });
    await expect(page.locator('[data-cursor-edit] .type-caret')).toHaveCount(1);
    await expect(page.locator('.intro .sticky.is-edited')).toHaveCount(1);

    await page.locator('#help-button').click();
    await page.locator('[data-pref="list"]').click();
    await expect(cursor(page)).toBeHidden();
    await expect(sign(page)).toBeHidden();
    await expect(words(page).locator('*')).toHaveCount(0);
    await expect(words(page)).toHaveText(STICKIES.map((s) => s.words));
    await expect(page.locator('.intro .sticky.is-edited')).toHaveCount(0);
    expect(await running(page)).toBe(0);

    await page.locator('[data-pref="list"]').click();
    await expect(cursor(page)).toBeVisible();
    await expect.poll(() => running(page)).toBe(5);
  });

  test('with reduced motion it never starts, and there\'s no sign', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(cursor(page)).toBeHidden();
    await expect(sign(page)).toBeHidden();
    await page.waitForTimeout(600);
    expect(await running(page)).toBe(0);
    await expect(words(page).locator('*')).toHaveCount(0);
  });
});

test('on a phone there\'s no cursor and no sign, and the words are plain text', { tag: '@phone' }, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone\'s check');
  await page.goto('index.html');
  await expect(cursor(page)).toBeHidden();
  await expect(sign(page)).toBeHidden();
  await page.waitForTimeout(600);
  expect(await running(page)).toBe(0);
  await expect(words(page)).toHaveText(STICKIES.map((s) => s.words));
  await expect(words(page).locator('*')).toHaveCount(0);
});
