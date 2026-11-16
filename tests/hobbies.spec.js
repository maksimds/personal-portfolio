// Checks the hobby stickers on the About page's "Who I am" (src/scripts/hobbies.ts). Pointed at,
// the 🎾 one plays its scene once through: a racket (src/components/about/HobbyTennis.astro)
// swings in and hits the ball out of the sticker, and the ball drops back in. Pointing at it again
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
  test('pointing at 🎾 plays the hit once through, then it plays again', async ({ page }) => {
    await open(page);
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');
    const box = await tennis(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => playing(page)).toBe(true);

    // Stepped through: the racket shows, the ball flies out of the sticker and comes back
    const seen = await tennis(page).evaluate((el) => {
      const ball = el.querySelector('.hobby__ball');
      const racket = el.querySelector('.hobby__racket');
      const animations = el.getAnimations({ subtree: true });
      animations.forEach((a) => a.pause());
      const home = el.getBoundingClientRect();
      const frames = [];
      for (let t = 0; t <= 1500; t += 25) {
        animations.forEach((a) => { a.currentTime = t; });
        const b = ball.getBoundingClientRect();
        frames.push({
          t,
          racket: Number(getComputedStyle(racket).opacity),
          away: Math.hypot(b.left + b.width / 2 - (home.left + home.width / 2), b.top + b.height / 2 - (home.top + home.height / 2)),
          ball: Number(getComputedStyle(ball).opacity),
        });
      }
      animations.forEach((a) => { a.currentTime = 0; a.play(); });
      return frames;
    });
    expect(Math.max(...seen.map((f) => f.racket))).toBe(1);
    const out = seen.filter((f) => f.away > box.width && f.ball > 0.9);   // out past the sticker
    expect(out.length).toBeGreaterThan(2);
    expect(seen.find((f) => f.racket === 1).t).toBeLessThan(out[0].t);   // the racket comes first
    expect(seen.at(-1)).toMatchObject({ racket: 0, ball: 1 });
    expect(seen.at(-1).away).toBeLessThan(1);

    // It finishes, and everything is back as it was
    await expect.poll(() => playing(page), { timeout: 4000 }).toBe(false);
    await expect(page.locator('.hobby__ball')).toHaveCSS('translate', 'none');
    await expect(page.locator('.hobby__racket')).toHaveCSS('opacity', '0');

    // Away and back again: it plays again
    await page.mouse.move(box.x - 200, box.y - 200);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
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
