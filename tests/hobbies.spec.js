// Checks the hobby stickers on the About page's "Who I am" (src/scripts/hobbies.ts). Pointed at,
// a sticker plays its scene once through, all inside the sticker's circle. 🎾: a racket
// (src/components/about/HobbyTennis.astro) plays a forehand and hits the ball out through the
// circle's edge, and the ball drops back in. ♞ (src/components/about/HobbyChess.astro): on a
// board that shows while it plays, the knight jumps an L onto a queen and knocks her out through
// the edge, then hops home. 📚 (HobbyBooks.astro): the two books under the top one fly out, and
// the top one turns to face us, opens, turns a page, closes and lands back on them. ✈️
// (HobbyTravel.astro): the plane flies round the world, behind it on the far side, as it turns.
// Pointing at one again plays it again; on a touch screen a tap plays it; with reduced motion
// nothing plays.
const { test, expect } = require('@playwright/test');

const sticker = (page, name) => page.locator(`.hobby--${name}`);
const tennis = (page) => sticker(page, 'tennis');
const chess = (page) => sticker(page, 'chess');
const ALL = ['tennis', 'chess', 'books', 'travel'];
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
  for (const name of ALL) await expect(sticker(page, name)).toBeInViewport();
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
    // The ball is drawn, not the 🎾 emoji, which Windows draws as a racket with a ball
    await expect(tennis(page).locator('.hobby__ball svg')).toBeVisible();
    await expect(tennis(page)).not.toContainText('🎾');

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

  test('pointing at 📚 flies the two lower books away while the top one opens, once through, then it plays again', async ({ page }) => {
    const books = sticker(page, 'books');
    await open(page);
    await expect(books.locator('.hobby__spine')).toBeVisible();
    await expect(books.locator('.hobby__open')).toHaveCSS('opacity', '0');
    expect(await books.evaluate((el) => getComputedStyle(el.querySelector('.hobby__scene')).clipPath)).toMatch(/^circle\(50%/);

    await pointAt(page, books);
    await expect.poll(() => playing(page, 'books')).toBe(true);

    // Stepped through, in the scene's units (the circle 40 across, its middle at 20, 20). The red
    // book's middle is at 20.5, 19.75 at rest (18 × 5), the blue's at 20, 25 (20 × 5.5); the green
    // one is placed by its middle, 19.5, 14.5 at rest, and stands 13 × 17 when it faces us, its
    // spine down its left edge. A leaf's width goes from 1 (closed) to -1 (turned over)
    const frames = await books.evaluate((el) => {
      const q = (s) => getComputedStyle(el.querySelector(s));
      const animations = el.getAnimations({ subtree: true });
      animations.forEach((a) => a.pause());
      const xy = (value) => (value === 'none' ? [0, 0] : value.split(' ').map(parseFloat).concat(0).slice(0, 2));
      const sxy = (value) => (value === 'none' ? [1, 1] : value.split(' ').map(Number).concat(NaN).slice(0, 2).map((v, i, a) => (Number.isNaN(v) ? a[0] : v)));
      const out = [];
      for (let t = 0; t <= 2600; t += 10) {
        animations.forEach((a) => { a.currentTime = t; });
        const [rx, ry] = xy(q('.hobby__book--middle').translate);
        const [bx, by] = xy(q('.hobby__book--bottom').translate);
        const top = q('.hobby__book--top');
        const [gx, gy] = xy(top.translate);
        out.push({
          t,
          red: { x: 20.5 + rx, y: 19.75 + ry },
          blue: { x: 20 + bx, y: 25 + by },
          green: { x: 19.5 + gx, y: 14.5 + gy },
          size: sxy(top.scale),
          lying: Number(q('.hobby__spine').opacity),
          standing: Number(q('.hobby__open').opacity),
          shift: xy(q('.hobby__open').translate)[0],
          cover: sxy(q('.hobby__leaf--cover').scale)[0],
          coverInside: Number(q('.hobby__leaf--cover svg + svg').opacity),
          page: sxy(q('.hobby__leaf--page').scale)[0],
          pageBack: Number(q('.hobby__leaf--page svg + svg').opacity),
          pageOver: Number(q('.hobby__leaf--page').zIndex) > Number(q('.hobby__leaf--cover').zIndex),
        });
      }
      animations.forEach((a) => { a.currentTime = 0; a.play(); });
      return out;
    });
    const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: 20, y: 20 };
    const out = (p, halfDiagonal) => apart(p, mid) - halfDiagonal > 20;   // all of it past the edge
    const redOut = (f) => out(f.red, 9.4);
    const blueOut = (f) => out(f.blue, 10.4);

    // At rest: the stack, the top one lying on it
    expect(frames[0].lying).toBe(1);
    expect(frames[0].standing).toBe(0);
    expect(apart(frames[0].green, { x: 19.5, y: 14.5 })).toBeLessThan(0.01);

    // The red and the blue fly out through the edge, on opposite sides, before the top one opens
    const opening = frames.find((f) => f.cover < 0.99);
    const redGone = frames.find(redOut);
    const blueGone = frames.find(blueOut);
    expect(redGone.t).toBeLessThan(opening.t);
    expect(blueGone.t).toBeLessThan(opening.t);
    expect(Math.sign(redGone.red.x - 20)).toBe(-Math.sign(blueGone.blue.x - 20));

    // It opens: facing us, in the middle, open about the middle, all of it inside the circle
    const opened = frames.filter((f) => f.cover < -0.99);
    expect(opened.length).toBeGreaterThan(10);
    for (const f of opened) {
      expect(f.standing).toBe(1);
      expect(f.lying).toBe(0);
      const spine = f.green.x + (f.shift - 6.5) * f.size[0];
      expect(Math.abs(spine - 20)).toBeLessThan(0.6);
      expect(Math.abs(f.green.y - 20)).toBeLessThan(0.6);
      for (const p of [{ x: spine - 13 * f.size[0], y: f.green.y - 8.5 * f.size[1] }, { x: spine + 13 * f.size[0], y: f.green.y + 8.5 * f.size[1] }]) expect(apart(p, mid)).toBeLessThan(20);
    }
    // ...and a page turns while it's open, landing over the cover
    const turned = opened.filter((f) => f.page < -0.99);
    expect(turned.length).toBeGreaterThan(5);
    expect(turned.every((f) => f.pageOver)).toBe(true);
    // A leaf shows its back exactly when it's turned past edge on
    for (const f of frames) {
      if (Math.abs(f.cover) > 0.05) expect(f.coverInside).toBe(f.cover < 0 ? 1 : 0);
      if (Math.abs(f.page) > 0.05) expect(f.pageBack).toBe(f.page < 0 ? 1 : 0);
    }
    // Whenever it's lying down it's shut
    expect(frames.filter((f) => f.standing === 0).every((f) => f.cover === 1 && f.page === 1)).toBe(true);

    // The red and the blue come back from the sides they left by, and are in place before the
    // green one lands back on top of them
    const back = frames.filter((f) => f.t > opened.at(-1).t);
    const redLastOut = back.filter(redOut).at(-1);
    const blueLastOut = back.filter(blueOut).at(-1);
    expect(Math.sign(redLastOut.red.x - 20)).toBe(Math.sign(redGone.red.x - 20));
    expect(Math.sign(blueLastOut.blue.x - 20)).toBe(Math.sign(blueGone.blue.x - 20));
    const over = back.find((f) => f.lying === 1 && f.green.y < 14.5 - 3);   // lying again, held over its place
    const lands = back.find((f) => f.t > over.t && f.green.y >= 14.5 - 0.01);
    expect(lands).toBeTruthy();
    expect(Math.abs(lands.green.x - 19.5)).toBeLessThan(0.01);
    expect(apart(lands.red, { x: 20.5, y: 19.75 })).toBeLessThan(0.01);
    expect(apart(lands.blue, { x: 20, y: 25 })).toBeLessThan(0.01);
    // ...and it's clear of them as they come back: whichever is back in the circle, its bottom is
    // above that one's top
    for (const f of back.filter((g) => g.lying === 1 && g.t < lands.t)) {
      const bottom = f.green.y + 2.75 * f.size[1];
      if (!redOut(f)) expect(bottom).toBeLessThanOrEqual(f.red.y - 2.5 + 0.01);
      if (!blueOut(f)) expect(bottom).toBeLessThanOrEqual(f.blue.y - 2.75 + 0.01);
    }

    // It finishes, and everything is back as it was
    expect(apart(frames.at(-1).green, { x: 19.5, y: 14.5 })).toBeLessThan(0.01);
    await expect.poll(() => playing(page, 'books'), { timeout: 4000 }).toBe(false);
    await expect(books.locator('.hobby__book--top')).toHaveCSS('translate', 'none');
    await expect(books.locator('.hobby__book--middle')).toHaveCSS('translate', 'none');
    await expect(books.locator('.hobby__open')).toHaveCSS('opacity', '0');

    await pointAt(page, books);
    await expect.poll(() => playing(page, 'books')).toBe(true);
  });

  test('pointing at ✈️ flies it round the world, behind it on the far side, once through, then it plays again', async ({ page }) => {
    const travel = sticker(page, 'travel');
    await open(page);
    await expect(travel.locator('.hobby__globe')).toHaveCSS('opacity', '0');
    await expect(travel.locator('.hobby__plane')).toHaveCSS('offset-path', 'none');
    expect(await travel.evaluate((el) => getComputedStyle(el.querySelector('.hobby__scene')).clipPath)).toMatch(/^circle\(50%/);

    await pointAt(page, travel);
    await expect.poll(() => playing(page, 'travel')).toBe(true);

    // Stepped through. The plane's place is worked out from its route (in the scene's units, the
    // circle 40 across) and how far along it is; it faces along it, its nose up-right
    const { frames, turn, route, start, end } = await travel.evaluate((el) => {
      const plane = el.querySelector('.hobby__plane');
      const look = getComputedStyle(plane);
      const d = look.offsetPath.match(/path\("(.*)"\)/)[1];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
      document.body.append(svg);
      const total = path.getTotalLength();
      const at = (share) => { const p = path.getPointAtLength(total * share); return { x: p.x, y: p.y }; };
      const heading = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const land = el.querySelector('.hobby__land');
      const xy = (value) => (value === 'none' ? [0, 0] : value.split(' ').map(parseFloat).concat(0).slice(0, 2));
      const animations = el.getAnimations({ subtree: true });
      animations.forEach((a) => a.pause());
      const out = [];
      for (let t = 0; t <= 2400; t += 10) {
        animations.forEach((a) => { a.currentTime = t; });
        const p = getComputedStyle(plane);
        const globe = getComputedStyle(el.querySelector('.hobby__globe'));
        out.push({
          t,
          at: at(parseFloat(p.offsetDistance) / 100),
          z: Number(p.zIndex),
          size: Number(getComputedStyle(plane.firstElementChild).scale),
          globe: Number(globe.opacity),
          globeZ: Number(globe.zIndex),
          land: xy(getComputedStyle(land).translate)[0],
        });
      }
      animations.forEach((a) => { a.currentTime = 0; a.play(); });
      svg.remove();
      const turn = -Number(land.querySelectorAll('use')[1].getAttribute('x'));
      return { frames: out, turn, route: look.offsetRotate, start: { at: at(0), heading: heading(at(0), at(0.002)) }, end: { at: at(1), heading: heading(at(0.998), at(1)) } };
    });
    const mid = { x: 20, y: 20 };
    const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    // The route starts and ends in the middle, heading up-right, the way the emoji's nose points,
    // so turned to face along it the plane isn't turned at all there
    expect(route).toBe('auto 45deg');
    for (const ends of [start, end]) {
      expect(apart(ends.at, mid)).toBeLessThan(0.01);
      expect(Math.abs(ends.heading + 45)).toBeLessThan(2);
    }
    expect(frames[0].size).toBe(1);
    expect(frames.at(-1).size).toBe(1);

    // All the way round the world, clockwise
    let around = 0;
    const away = frames.filter((f) => apart(f.at, mid) > 4);
    for (let i = 1; i < away.length; i++) {
      let step = Math.atan2(away[i].at.y - 20, away[i].at.x - 20) - Math.atan2(away[i - 1].at.y - 20, away[i - 1].at.x - 20);
      step = ((step + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      around += (step * 180) / Math.PI;
    }
    expect(around).toBeGreaterThan(360);

    // On the orbit (an ellipse 29 × 12 round the middle, tipped up 18° to the right), over the
    // world it's in front of it on the near side (below the long middle line) and behind it on
    // the far side, where it's smaller
    const tip = (18 * Math.PI) / 180;
    const along = (f) => (f.at.x - 20) * Math.cos(tip) - (f.at.y - 20) * Math.sin(tip);
    const near = (f) => (f.at.x - 20) * Math.sin(tip) + (f.at.y - 20) * Math.cos(tip);
    const onOrbit = (f) => Math.abs(Math.hypot(along(f) / 14.5, near(f) / 6) - 1) < 0.02;
    expect(frames.filter(onOrbit).length).toBeGreaterThan(100);
    const over = frames.filter((f) => onOrbit(f) && f.globe === 1 && apart(f.at, mid) < 9 && Math.abs(near(f)) > 1.5);
    expect(over.some((f) => near(f) < 0)).toBe(true);
    expect(over.some((f) => near(f) > 0)).toBe(true);
    for (const f of over) expect(f.z > f.globeZ).toBe(near(f) > 0);
    const orbit = frames.filter(onOrbit);
    const farthest = orbit.reduce((a, b) => (near(b) < near(a) ? b : a));
    const nearest = orbit.reduce((a, b) => (near(b) > near(a) ? b : a));
    expect(farthest.size).toBeLessThan(nearest.size);

    // It stays inside the circle
    for (const f of frames) expect(apart(f.at, mid) + 10 * f.size).toBeLessThan(20.5);

    // The world shows while it goes round, and turns smoothly, west to east (its land moving
    // right), at one speed, once round: its map moves by as far as its two copies are apart, so
    // the side that faces us at the start faces us again at the end
    expect(frames[0].globe).toBe(0);
    expect(frames.at(-1).globe).toBe(0);
    expect(turn).toBeCloseTo(2 * Math.PI * 19.5, 1);
    const showing = frames.filter((f) => f.globe > 0);
    const steps = showing.slice(1).map((f, i) => f.land - showing[i].land);
    expect(Math.min(...steps)).toBeGreaterThan(0);
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThan(0.01);
    expect(showing[0].land).toBeLessThan(1);
    expect(turn - showing.at(-1).land).toBeLessThan(1);
    expect(await travel.evaluate((el) => el.querySelector('.hobby__land').parentElement.getAttribute('filter'))).toBe('url(#world-round)');   // bent onto the ball

    // It finishes, and everything is back as it was
    await expect.poll(() => playing(page, 'travel'), { timeout: 4000 }).toBe(false);
    await expect(travel.locator('.hobby__plane')).toHaveCSS('offset-path', 'none');
    await expect(travel.locator('.hobby__globe')).toHaveCSS('opacity', '0');
    await expect(travel.locator('.hobby__land')).toHaveCSS('translate', 'none');

    await pointAt(page, travel);
    await expect.poll(() => playing(page, 'travel')).toBe(true);
  });

  test('with reduced motion nothing plays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    for (const name of ALL) {
      const box = await sticker(page, name).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      expect(await playing(page, name)).toBe(false);
    }
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');
    await expect(page.locator('.hobby__queen')).toHaveCSS('opacity', '0');
    await expect(page.locator('.hobby__board')).toHaveCSS('opacity', '0');
    await expect(page.locator('.hobby__open')).toHaveCSS('opacity', '0');
    await expect(page.locator('.hobby__globe')).toHaveCSS('opacity', '0');
  });
});

test('on a phone a tap on any of the four plays it', { tag: '@phone' }, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone\'s check');
  await page.goto('about.html');
  for (const name of ALL) {
    await sticker(page, name).scrollIntoViewIfNeeded();
    await expect(sticker(page, name)).toBeInViewport();
    expect(await playing(page, name)).toBe(false);
    await sticker(page, name).tap();
    await expect.poll(() => playing(page, name)).toBe(true);
    await expect.poll(() => playing(page, name), { timeout: 4000 }).toBe(false);
  }
});
