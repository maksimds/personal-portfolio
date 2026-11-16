// Checks the hobby stickers on the About page's "Who I am" (src/scripts/hobbies.ts). Pointed at,
// a sticker plays its scene once through, all inside the sticker's circle. 🎾: a racket
// (src/components/about/HobbyTennis.astro) plays a forehand and hits the ball out through the
// circle's edge, and the ball drops back in. ♞ (src/components/about/HobbyChess.astro): on a
// board that shows while it plays, the knight jumps an L onto a queen and knocks her out through
// the edge, then hops home. Pointing at one again plays it again; on a touch screen a tap plays
// it; with reduced motion nothing plays.
const { test, expect } = require('@playwright/test');

const sticker = (page, name) => page.locator(`.hobby--${name}`);
const tennis = (page) => sticker(page, 'tennis');
const chess = (page) => sticker(page, 'chess');
const playing = (page, name = 'tennis') => sticker(page, name).evaluate((el) => el.classList.contains('is-playing'));

// The About page is a canvas on a desktop: the board is panned down until the stickers are on screen
async function open(page) {
  await page.goto('about.html');
  await expect(page.locator('.about-hobbies')).toBeVisible();
  await page.mouse.move(700, 300);
  for (let i = 0; i < 10 && !(await page.locator('.about-hobbies').evaluate((el) => el.getBoundingClientRect().bottom < innerHeight - 120)); i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
  }
  await expect(tennis(page)).toBeInViewport();
  await expect(chess(page)).toBeInViewport();
}

// Points at a sticker from away from it, so it's a fresh "enter"
async function pointAt(page, locator) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x - 200, box.y - 200);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
}

test.describe('on a desktop', () => {
  test('pointing at 🎾 plays a forehand inside the sticker, once through, then it plays again', async ({ page }) => {
    await open(page);
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');

    // Everything happens in a scene cut to the circle inside the white ring
    const scene = await tennis(page).evaluate((el) => {
      const box = el.getBoundingClientRect();
      const inner = el.querySelector('.hobby__scene').getBoundingClientRect();
      const ring = (box.width - inner.width) / 2;
      return { clip: getComputedStyle(el.querySelector('.hobby__scene')).clipPath, ring, centred: Math.abs(inner.left - box.left - ring) < 0.5 && Math.abs(inner.top - box.top - ring) < 0.5 };
    });
    expect(scene.clip).toMatch(/^circle\(50%/);
    expect(scene.ring).toBeGreaterThan(1);
    expect(scene.centred).toBe(true);

    const box = await tennis(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect.poll(() => playing(page)).toBe(true);

    // Stepped through, in the scene's own units (the circle is 40 across, the ball's home at 20, 20):
    // where the hand holds the racket, which way the racket points, and where the ball is
    const frames = await tennis(page).evaluate((el) => {
      const ball = el.querySelector('.hobby__ball');
      const racket = el.querySelector('.hobby__racket');
      const animations = el.getAnimations({ subtree: true });
      animations.forEach((a) => a.pause());
      const xy = (value) => (value === 'none' ? [0, 0] : value.split(' ').map(parseFloat).concat(0).slice(0, 2));
      const out = [];
      for (let t = 0; t <= 1700; t += 10) {
        animations.forEach((a) => { a.currentTime = t; });
        const r = getComputedStyle(racket);
        const [bx, by] = xy(getComputedStyle(ball).translate);
        const [hx, hy] = xy(r.translate);
        out.push({ t, shows: Number(r.opacity), hand: { x: hx, y: hy }, turn: parseFloat(r.rotate) || 0, ball: { x: 20 + bx, y: 20 + by } });
      }
      animations.forEach((a) => { a.currentTime = 0; a.play(); });
      return out;
    });
    // The middle of the racket's head: 12.8 from the hand, the way it points (0deg is up)
    const head = (f) => ({ x: f.hand.x + 12.8 * Math.sin((f.turn * Math.PI) / 180), y: f.hand.y - 12.8 * Math.cos((f.turn * Math.PI) / 180) });
    const swing = frames.filter((f) => f.shows > 0.5);
    expect(swing.length).toBeGreaterThan(40);

    // One loop, one way (anticlockwise), most of the way round
    for (let i = 1; i < swing.length; i++) expect(swing[i].turn).toBeLessThanOrEqual(swing[i - 1].turn + 0.01);
    expect(swing[0].turn - swing.at(-1).turn).toBeGreaterThan(300);

    // Taken back: the head behind the hand. The hit: the head in front of the hand, on the ball,
    // with the hand lower than where it finishes, high, the head behind again
    expect(head(swing[0]).x).toBeLessThan(swing[0].hand.x);
    const hit = frames.reduce((best, f) => (Math.hypot(head(f).x - f.ball.x, head(f).y - f.ball.y) < Math.hypot(head(best).x - best.ball.x, head(best).y - best.ball.y) && f.shows > 0.5 ? f : best), swing[0]);
    expect(Math.hypot(head(hit).x - hit.ball.x, head(hit).y - hit.ball.y)).toBeLessThan(3);
    expect(head(hit).x).toBeGreaterThan(hit.hand.x + 8);
    expect(hit.ball.x).toBeGreaterThan(24);
    expect(swing.at(-1).hand.y).toBeLessThan(hit.hand.y - 6);
    expect(head(swing.at(-1)).x).toBeLessThan(swing.at(-1).hand.x);

    // After the hit the ball goes out through the circle's edge (half size, it's about 9 across),
    // then comes back to the middle; it's never outside the circle before the hit
    const away = (f) => Math.hypot(f.ball.x - 20, f.ball.y - 20);
    expect(frames.filter((f) => f.t < hit.t).every((f) => away(f) < 20)).toBe(true);
    const gone = frames.find((f) => f.t > hit.t && away(f) > 25);
    expect(gone).toBeTruthy();
    expect(gone.t - hit.t).toBeLessThan(300);
    expect(away(frames.at(-1))).toBeLessThan(0.5);

    // It finishes, and everything is back as it was
    await expect.poll(() => playing(page), { timeout: 4000 }).toBe(false);
    await expect(page.locator('.hobby__ball')).toHaveCSS('translate', 'none');
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');

    // Away and back again: it plays again
    await page.mouse.move(box.x - 200, box.y - 200);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expect.poll(() => playing(page)).toBe(true);
  });

  test('pointing at ♞ plays the knight taking a queen inside the sticker, once through, then it plays again', async ({ page }) => {
    await open(page);
    // The sticker is a knight (drawn, there's no knight emoji), not the ♟️ pawn it was
    await expect(chess(page).locator('.hobby__knight svg')).toBeVisible();
    await expect(page.locator('.about-hobbies')).not.toContainText('♟');
    await expect(chess(page).locator('.hobby__queen')).toHaveCSS('opacity', '0');
    await expect(chess(page).locator('.hobby__board')).toHaveCSS('opacity', '0');
    expect(await chess(page).evaluate((el) => getComputedStyle(el.querySelector('.hobby__scene')).clipPath)).toMatch(/^circle\(50%/);

    await pointAt(page, chess(page));
    await expect.poll(() => playing(page, 'chess')).toBe(true);

    // Stepped through, in the scene's own units (the circle is 40 across, its middle at 20, 20; the
    // board's squares are 8 across). A piece's place is where it stands, the middle of its base:
    // the knight's is 20, 30 at rest, and it's drawn 18 × 20 at full size; the queen's square is
    // at 12, 24, and she's drawn 10.8 × 12
    const frames = await chess(page).evaluate((el) => {
      const knight = el.querySelector('.hobby__knight');
      const piece = knight.querySelector('svg');
      const queen = el.querySelector('.hobby__queen');
      const board = el.querySelector('.hobby__board');
      const animations = el.getAnimations({ subtree: true });
      animations.forEach((a) => a.pause());
      const xy = (value) => (value === 'none' ? [0, 0] : value.split(' ').map(parseFloat).concat(0).slice(0, 2));
      const out = [];
      for (let t = 0; t <= 2000; t += 10) {
        animations.forEach((a) => { a.currentTime = t; });
        const p = getComputedStyle(piece);
        const q = getComputedStyle(queen);
        const [kx, ky] = xy(getComputedStyle(knight).translate);
        const [qx, qy] = xy(q.translate);
        const [sx, sy = sx] = p.scale === 'none' ? [1] : p.scale.split(' ').map(Number);
        out.push({ t, knight: { x: 20 + kx, y: 30 + ky }, lift: xy(p.translate)[1], size: { w: 18 * sx, h: 20 * sy }, queen: { x: 12 + qx, y: 24 + qy }, board: Number(getComputedStyle(board).opacity) });
      }
      animations.forEach((a) => { a.currentTime = 0; a.play(); });
      return out;
    });
    const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    // Whether any of the queen is inside the circle: the point of her that's nearest its middle
    const queenIn = (f) => Math.hypot(Math.min(Math.max(20, f.queen.x - 5.4), f.queen.x + 5.4) - 20, Math.min(Math.max(20, f.queen.y - 12), f.queen.y) - 20) < 20;

    // It starts at home, full size, the queen out of sight beyond the edge, the board not yet shown
    expect(apart(frames[0].knight, { x: 20, y: 30 })).toBeLessThan(0.01);
    expect(frames[0].size.h).toBeCloseTo(20, 1);
    expect(queenIn(frames[0])).toBe(false);
    expect(frames[0].board).toBe(0);

    // Where the knight stops on the board, in order: two squares, an L apart, then home
    const rests = [];
    frames.forEach((f, i) => {
      const still = i > 0 && apart(f.knight, frames[i - 1].knight) < 0.01 && Math.abs(f.lift) < 0.01;
      if (still && !(rests.length && apart(rests.at(-1).knight, f.knight) < 0.01)) rests.push(f);
    });
    expect(rests).toHaveLength(3);
    const [from, onto, home] = rests;
    for (const f of [from, onto]) {
      expect(Math.abs(((f.knight.x - 4) % 8))).toBeLessThan(0.01);   // in the middle of a column...
      expect(Math.abs(f.knight.y % 8)).toBeLessThan(0.01);   // ...standing at the bottom of a row
      const settled = frames.find((g) => g.t === f.t + 100);
      expect(settled.size.w).toBeLessThan(11);   // small enough for a square
    }
    expect([Math.abs(onto.knight.x - from.knight.x), Math.abs(onto.knight.y - from.knight.y)].sort((a, b) => a - b)).toEqual([8, 16]);
    expect(Math.min(...frames.filter((f) => f.t > from.t && f.t < onto.t).map((f) => f.lift))).toBeLessThan(-6);   // over, not along
    expect(apart(home.knight, { x: 20, y: 30 })).toBeLessThan(0.01);

    // The queen comes in straight along her row and is on the square before the knight jumps; it
    // lands on her, and she goes out through the edge soon after, not to come back
    const takeoff = frames.filter((f) => f.t < onto.t && apart(f.knight, from.knight) < 0.01).at(-1);
    const landing = frames.find((f) => apart(f.knight, onto.knight) < 0.01);
    expect(landing.lift).toBeCloseTo(0, 2);
    expect(frames.filter((f) => f.t <= landing.t).every((f) => Math.abs(f.queen.y - onto.knight.y) < 0.01)).toBe(true);
    expect(apart(takeoff.queen, onto.knight)).toBeLessThan(0.3);
    expect(apart(landing.queen, onto.knight)).toBeLessThan(0.3);
    const gone = frames.find((f) => f.t > landing.t && !queenIn(f));
    expect(gone).toBeTruthy();
    expect(gone.t - landing.t).toBeLessThan(300);
    expect(frames.filter((f) => f.t >= gone.t).some(queenIn)).toBe(false);

    // The board shows while the pieces are on it, and is gone by the end
    expect(frames.filter((f) => f.t >= from.t && f.t <= onto.t).every((f) => f.board === 1)).toBe(true);
    expect(frames.at(-1).board).toBe(0);

    // The knight never leaves the circle: its base's corners and the top of it stay inside
    for (const f of frames) {
      const base = f.knight.y + f.lift;
      for (const p of [{ x: f.knight.x - f.size.w / 2, y: base }, { x: f.knight.x + f.size.w / 2, y: base }, { x: f.knight.x, y: base - f.size.h }]) expect(apart(p, { x: 20, y: 20 })).toBeLessThan(20);
    }

    // It finishes, and everything is back as it was
    expect(frames.at(-1).size.h).toBeCloseTo(20, 1);
    await expect.poll(() => playing(page, 'chess'), { timeout: 4000 }).toBe(false);
    await expect(chess(page).locator('.hobby__knight')).toHaveCSS('translate', 'none');
    await expect(chess(page).locator('.hobby__queen')).toHaveCSS('opacity', '0');
    await expect(chess(page).locator('.hobby__board')).toHaveCSS('opacity', '0');

    // Away and back again: it plays again
    await pointAt(page, chess(page));
    await expect.poll(() => playing(page, 'chess')).toBe(true);
  });

  test('with reduced motion nothing plays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    for (const name of ['tennis', 'chess']) {
      const box = await sticker(page, name).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      expect(await playing(page, name)).toBe(false);
    }
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');
    await expect(page.locator('.hobby__queen')).toHaveCSS('opacity', '0');
    await expect(page.locator('.hobby__board')).toHaveCSS('opacity', '0');
  });
});

test('on a phone a tap on 🎾 or ♞ plays it', { tag: '@phone' }, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone\'s check');
  await page.goto('about.html');
  for (const name of ['tennis', 'chess']) {
    await sticker(page, name).scrollIntoViewIfNeeded();
    await expect(sticker(page, name)).toBeInViewport();
    expect(await playing(page, name)).toBe(false);
    await sticker(page, name).tap();
    await expect.poll(() => playing(page, name)).toBe(true);
    await expect.poll(() => playing(page, name), { timeout: 4000 }).toBe(false);
  }
});
