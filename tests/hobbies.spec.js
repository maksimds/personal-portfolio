// Checks the hobby stickers on the About page's "Who I am" (src/scripts/hobbies.ts). Pointed at,
// the 🎾 one plays its scene once through, all inside the sticker's circle: a racket
// (src/components/about/HobbyTennis.astro) plays a forehand and hits the ball out through the
// circle's edge, and the ball drops back in. Pointing at it again
// plays it again; on a touch screen a tap plays it; with reduced motion nothing plays.
const { test, expect } = require('@playwright/test');

const tennis = (page) => page.locator('.hobby--tennis');
const playing = (page) => tennis(page).evaluate((el) => el.classList.contains('is-playing'));

// The About page is a canvas on a desktop: the board is panned down until the sticker is on screen
async function open(page) {
  await page.goto('about.html');
  await expect(page.locator('.about-hobbies')).toBeVisible();
  await page.mouse.move(700, 300);
  for (let i = 0; i < 10 && !(await tennis(page).evaluate((el) => el.getBoundingClientRect().bottom < innerHeight - 120)); i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
  }
  await expect(tennis(page)).toBeInViewport();
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

  test('with reduced motion nothing plays', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const box = await tennis(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    expect(await playing(page)).toBe(false);
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');
  });
});

test('on a phone a tap on 🎾 plays it', { tag: '@phone' }, async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the phone\'s check');
  await page.goto('about.html');
  await tennis(page).scrollIntoViewIfNeeded();
  await expect(tennis(page)).toBeInViewport();
  expect(await playing(page)).toBe(false);
  await tennis(page).tap();
  await expect.poll(() => playing(page)).toBe(true);
  await expect.poll(() => playing(page), { timeout: 4000 }).toBe(false);
});
