// Checks the notes wall on the About page (src/components/about/Notes.astro, src/scripts/notes.ts):
// visitors' notes show as stickies, in plain text; posting one sends only a name and a message;
// the section says so when there are no notes, when they can't load and when a note doesn't go
// through; on the canvas it's a column to the left of "Who I am" that never moves the other blocks.
// Only the live site talks to the database, so most checks open the page as if it were on
// dmaksimoff.com (the built files in dist/ are handed to the browser for that address, as in
// analytics.spec.js), and the database itself is always faked: no check reads from or posts to
// the real one. Google's tag is stopped before it loads, so no test visit is ever counted.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { dist } = require('./helpers');

const api = fs.readFileSync(path.join(__dirname, '..', 'src/data/notes.ts'), 'utf8').match(/notesApi = '([^']*)'/)[1];
const toDatabase = (url) => url.href.startsWith(new URL(api).origin);
const LIVE = 'https://dmaksimoff.com/about.html';
const CORS = { 'access-control-allow-origin': '*' };

const note = (i, message, author_name = `Visitor ${i}`, color = 'yellow') => ({ id: `note-${i}`, author_name, message, color });
const TRICK = '<img src=x onerror="document.title=\'broken\'"> hi';
const SOME = [
  note(1, 'Love the board!', 'Alex', 'pink'),
  note(2, TRICK, 'Sam', 'teal'),
  note(3, 'Line one\nLine two', 'Priya', 'nonsense'),
];
// Twelve notes, the most the wall shows, at their tallest: every other one is 200 characters of
// words, and the rest are a hundred short lines each, which the wall cuts short. Each row of two
// has one of those, so every row is as tall as a row can be.
const WORDS = 'word '.repeat(40).trim();
const MANY = Array.from({ length: 12 }, (_, i) => note(i, i % 2 ? WORDS : 'a\n'.repeat(100).trim()));

// Opens About as if on dmaksimoff.com with a fake database. Returns what was asked of the database.
async function openLive(page, { notes = [], load = 200, post = 201 } = {}) {
  const calls = { loads: [], posts: [] };
  await page.route('https://dmaksimoff.com/**', (route) => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    return route.fulfill({ path: path.join(dist, file) });
  });
  await page.route(/^https:\/\/www\.(googletagmanager|google-analytics)\.com\//, (route) => route.fulfill({ body: '' }));
  await page.route(toDatabase, (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      calls.posts.push({ body: req.postDataJSON(), headers: req.headers() });
      return route.fulfill({ status: post, headers: CORS, body: '' });
    }
    calls.loads.push({ url: req.url(), headers: req.headers() });
    return route.fulfill({ status: load, headers: CORS, json: load === 200 ? notes : { message: 'unavailable' } });
  });
  await page.goto(LIVE);
  return calls;
}

const stickies = (page) => page.locator('.notes__list > li.sticky');
const status = (page) => page.locator('[data-notes-status]');

// Waits until the page's objects (and any notes) have finished dropping in, which moves them a few pixels
const droppedIn = (page) => page.waitForFunction(() => document.getAnimations()
  .every((a) => a.animationName !== 'drop-in' || a.playState === 'finished'));
// Waits until something has stopped moving, like the board gliding to whatever gets the keyboard's focus
async function still(locator) {
  let last = '';
  await expect.poll(async () => {
    const now = JSON.stringify(await locator.boundingBox());
    const same = now === last;
    last = now;
    return same;
  }, { intervals: [150] }).toBe(true);
}
// Pans the board, as a visitor would, until the top of the notes is in the middle of the screen
async function panToNotes(page) {
  const notes = page.locator('#notes');
  await droppedIn(page);
  const at = await notes.boundingBox();
  await page.mouse.move(720, 450);
  await page.mouse.wheel(at.x + at.width / 2 - 720, at.y + 150 - 450);
  await expect.poll(async () => Math.round((await notes.boundingBox()).x + at.width / 2)).toBe(720);
  await still(notes);
}

test.describe('the notes wall on a desktop', () => {
  test('shows the newest approved notes as stickies, their words as plain text', async ({ page }) => {
    const calls = await openLive(page, { notes: SOME });
    await expect(stickies(page)).toHaveCount(3);
    expect(calls.loads).toHaveLength(1);
    const asked = new URL(calls.loads[0].url);
    expect(asked.origin + asked.pathname).toBe(api);
    expect(Object.fromEntries(asked.searchParams)).toEqual({ select: 'id,author_name,message,color', order: 'created_at.desc', limit: '12' });
    expect(calls.loads[0].headers.apikey).toMatch(/^sb_publishable_/);

    await expect(stickies(page).nth(0).locator('.sticky__text')).toHaveText('Love the board!');
    await expect(stickies(page).nth(0).locator('.sticky__author')).toHaveText('Alex');
    await expect(stickies(page).nth(0)).toHaveClass(/\bsticky--pink\b/);
    // Markup in a note is just words: nothing is added to the page
    await expect(stickies(page).nth(1).locator('.sticky__text')).toHaveText(TRICK);
    await expect(page.locator('.notes__list img')).toHaveCount(0);
    await expect(page).toHaveTitle(/^About/);
    // A colour the stickies don't have becomes yellow; a line break stays a line break
    await expect(stickies(page).nth(2)).toHaveClass(/\bsticky--yellow\b/);
    expect(await stickies(page).nth(2).locator('.sticky__text p').evaluate((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(2, 0);
    await expect(page.locator('[data-notes-empty]')).toBeHidden();
  });

  test('on the canvas it\'s a column left of "Who I am", and the other blocks stay put however many notes there are', async ({ page, context }) => {
    const places = async (p) => (await droppedIn(p)) && p.evaluate(() => Object.fromEntries(['#who', '#do', '#believe', '.about-playlist', '.site-footer', '#notes'].map((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return [sel, { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right) }];
    })));
    await openLive(page, { notes: [] });
    await expect(page.locator('[data-notes-empty]')).toBeVisible();
    const empty = await places(page);

    const full = await context.newPage();
    await openLive(full, { notes: MANY });
    await expect(stickies(full)).toHaveCount(12);
    const many = await places(full);

    for (const sel of ['#who', '#do', '#believe', '.about-playlist', '.site-footer']) expect(many[sel], sel).toEqual(empty[sel]);
    // Level with "Who I am", 128px to its left (102.4px on screen at 80%)
    expect(many['#notes'].top).toBe(many['#who'].top);
    const gap = await full.evaluate(() => document.querySelector('#who').getBoundingClientRect().left - document.querySelector('#notes').getBoundingClientRect().right);
    expect(gap).toBeCloseTo(102.4, 1);
    // Even then they end on the board, clear of its edge (an object can't be moved closer than 96px)
    expect(await full.evaluate(() => {
      const layer = document.querySelector('.board__layer').getBoundingClientRect();
      return (layer.bottom - document.querySelector('#notes').getBoundingClientRect().bottom) / 0.8;
    })).toBeGreaterThan(96);
    // A note of 200 characters of words shows in full; only the padded one is cut short
    const cut = (i) => stickies(full).nth(i).locator('.sticky__text p').evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(await cut(1)).toBe(false);
    expect(await cut(0)).toBe(true);
  });

  test('posting a note sends only the name and the message, then thanks the visitor', async ({ page }) => {
    const calls = await openLive(page, { notes: SOME });
    await expect(stickies(page)).toHaveCount(3);
    await panToNotes(page);
    await page.locator('[data-notes-open]').click();
    await expect(page.locator('#note-message')).toBeFocused();
    await page.locator('#note-message').fill('  Hello from a test  ');
    await page.locator('#note-name').fill(' Tester ');
    await page.locator('.notes__post').click();

    await expect(status(page)).toHaveText('Thanks! Your note will show here once I’ve read it.');
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0].body).toEqual({ author_name: 'Tester', message: 'Hello from a test' });
    expect(calls.posts[0].headers.prefer).toBe('return=minimal');
    expect(calls.posts[0].headers.apikey).toMatch(/^sb_publishable_/);
    // The form closes and empties; the note waits for approval, so it isn't on the wall
    await expect(page.locator('[data-notes-form]')).toBeHidden();
    await expect(page.locator('[data-notes-open]')).toBeFocused();
    await expect(stickies(page)).toHaveCount(3);
    await page.locator('[data-notes-open]').click();
    await expect(page.locator('#note-message')).toHaveValue('');
  });

  test('a note that doesn\'t go through keeps what was written, and blank fields aren\'t sent', async ({ page }) => {
    const calls = await openLive(page, { post: 500 });
    await panToNotes(page);
    await page.locator('[data-notes-open]').click();
    // Only spaces and a line break: the browser's own check lets it through, the page doesn't
    await page.locator('#note-message').fill('  \n ');
    await page.locator('#note-name').fill('Tester');
    await page.locator('.notes__post').click();
    await expect(status(page)).toHaveText('Write a note first.');
    await expect(page.locator('#note-message')).toBeFocused();
    expect(calls.posts).toHaveLength(0);

    await page.locator('#note-message').fill('Hello');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(status(page)).toHaveText('Your note didn’t go through. Please try again.');
    expect(calls.posts).toHaveLength(1);
    await expect(page.locator('[data-notes-form]')).toBeVisible();
    await expect(page.locator('#note-message')).toHaveValue('Hello');
    await expect(page.locator('#note-name')).toHaveValue('Tester');
  });

  test('says so when there are no notes yet, and when they can\'t load', async ({ page, context }) => {
    await openLive(page, { notes: [] });
    await expect(page.locator('[data-notes-empty]')).toHaveText('No notes yet. Leave the first one!');
    await expect(stickies(page)).toHaveCount(0);

    const down = await context.newPage();
    await openLive(down, { load: 503 });
    await expect(down.locator('[data-notes-empty]')).toHaveText('The notes couldn’t load just now. Try again later.');
    // Writing one still works
    await expect(down.locator('[data-notes-open]')).toBeVisible();
  });

  test('typing in the form doesn\'t set off the shortcuts, and a press in it doesn\'t move the section', async ({ page }) => {
    await openLive(page, { notes: SOME });
    await panToNotes(page);
    await page.locator('[data-notes-open]').click();
    const field = page.locator('#note-message');
    await still(page.locator('#notes'));
    // H is the hand tool's shortcut and Space pans the board
    await field.pressSequentially('hi there');
    await expect(field).toHaveValue('hi there');
    expect(await page.evaluate(() => document.documentElement.matches('.tool-hand, .is-space'))).toBe(false);

    // Pressing in the field and moving selects text instead of picking up the section
    const before = await page.locator('#notes').boundingBox();
    const box = await field.boundingBox();
    await page.mouse.move(box.x + 4, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 40, { steps: 6 });
    await page.mouse.up();
    expect(await page.locator('#notes').boundingBox()).toEqual(before);
    await expect(page.locator('#notes')).not.toHaveClass(/\bis-dragged\b/);

    // Escape closes the form, keeping what was written
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-notes-form]')).toBeHidden();
    await expect(page.locator('[data-notes-open]')).toBeFocused();
    await page.locator('[data-notes-open]').click();
    await expect(field).toHaveValue('hi there');
  });

  test('"New note" grows into the form and shrinks back; at once with reduced motion', async ({ page }) => {
    await openLive(page, { notes: SOME });
    await panToNotes(page);
    const form = page.locator('[data-notes-form]');
    const button = page.locator('[data-notes-open]');
    // The heights the form's animation runs between, read as soon as it starts
    const animated = () => form.evaluate((el) => el.getAnimations().map((a) => {
      const frames = a.effect.getKeyframes();
      return { from: frames[0].height, to: frames.at(-1).height };
    }));
    const closed = await button.evaluate((el) => `${el.offsetHeight}px`);

    await button.click();
    const opening = await animated();
    expect(opening).toHaveLength(1);
    expect(opening[0].from).toBe(closed);
    await expect.poll(() => form.evaluate((el) => el.getAnimations().length)).toBe(0);
    const open = await form.evaluate((el) => `${el.offsetHeight}px`);
    expect(opening[0].to).toBe(open);

    await page.keyboard.press('Escape');
    expect(await animated()).toEqual([{ from: open, to: closed }]);
    await expect(form).toBeHidden();
    await expect(button).toBeFocused();

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button.click();
    await expect(form).toBeVisible();
    expect(await animated()).toEqual([]);
  });

  test('a click outside the notes section closes the form, keeping what was written; inside, it stays open', async ({ page }) => {
    await openLive(page, { notes: SOME });
    await panToNotes(page);
    const form = page.locator('[data-notes-form]');
    const button = page.locator('[data-notes-open]');
    await button.click();
    const field = page.locator('#note-message');
    await field.fill('Half a thought');
    await still(page.locator('#notes'));

    // Inside the section: a note, the intro line
    await stickies(page).nth(0).click();
    await page.locator('.notes__intro').click();
    await expect(form).toBeVisible();
    // Selecting text that runs out past the section's edge isn't a click outside
    const box = await field.boundingBox();
    const section = await page.locator('#notes').boundingBox();
    await page.mouse.move(box.x + 6, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(section.x - 60, box.y + 10, { steps: 6 });
    await page.mouse.up();
    await expect(form).toBeVisible();

    // Outside: the empty board beside the section
    await page.mouse.click(section.x - 100, section.y + 100);
    await expect(form).toBeHidden();
    await expect(button).toBeVisible();
    await expect(button).not.toBeFocused();
    await button.click();
    await expect(field).toHaveValue('Half a thought');
  });

  test('the "New note" button and the two fields show no blue ring when focused', async ({ page }) => {
    await openLive(page, { notes: SOME });
    await panToNotes(page);
    const ring = (locator) => locator.evaluate((el) => ({ focused: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineStyle }));
    await page.locator('[data-notes-open]').click();
    expect(await ring(page.locator('#note-message'))).toEqual({ focused: true, outline: 'none' });
    await page.keyboard.press('Tab');
    expect(await ring(page.locator('#note-name'))).toEqual({ focused: true, outline: 'none' });
    await expect(page.locator('#note-name')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    // Back from the keyboard, "New note" looks pointed at instead
    await page.keyboard.press('Escape');
    const button = page.locator('[data-notes-open]');
    await expect(button).toBeFocused();
    expect(await ring(button)).toEqual({ focused: true, outline: 'none' });
    await expect(button).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0.5)');
  });

  test('the section can be moved like the others, and the line from "Who I am" follows', async ({ page }) => {
    await openLive(page, { notes: SOME });
    const line = page.locator('[data-from="who"][data-to="notes"]');
    await expect(line).toHaveClass(/\bis-ready\b/);
    await expect(page.locator('[data-from="believe"][data-to="notes"]')).toBeHidden();
    await panToNotes(page);
    const before = await page.locator('#notes').boundingBox();
    const drawn = await line.locator('.connector__line').getAttribute('d');

    // On the intro text, not a button or the form
    await page.mouse.move(before.x + 40, before.y + 30);
    await page.mouse.down();
    await page.mouse.move(before.x + 80, before.y + 70, { steps: 6 });
    await page.mouse.up();
    const after = await page.locator('#notes').boundingBox();
    expect({ x: Math.round(after.x - before.x), y: Math.round(after.y - before.y) }).toEqual({ x: 40, y: 40 });
    await expect.poll(() => line.locator('.connector__line').getAttribute('d')).not.toBe(drawn);
  });
});

test.describe('the links to the notes: the toolbar\'s comment button and the home page\'s sticker', () => {
  // Where the CSS alone draws the board's layer, as it does before the script runs
  const drawnByCss = (page) => page.locator('.board__layer').evaluate((el) => {
    const set = el.style.transform;
    el.style.transform = '';
    const m = new DOMMatrix(getComputedStyle(el).transform);
    el.style.transform = set;
    return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
  });
  const layer = (page) => page.locator('.board__layer').evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
  });
  const notesTop = (page) => page.locator('#notes').evaluate((el) => Math.round(el.getBoundingClientRect().top));
  const button = (page) => page.locator('.toolbar [data-shortcut="c"]');

  test('is "Notes" (C), and from another page opens About on the notes, already drawn there', async ({ page }) => {
    await page.goto('index.html');
    await expect(button(page)).toHaveAttribute('aria-label', 'Notes');
    await expect(page.locator('#tip-notes')).toHaveText(/Notes\s*C/);
    await page.keyboard.press('c');
    await expect(page).toHaveURL(/\/about\.html#notes$/);
    await expect.poll(() => notesTop(page)).toBe(120);
    await expect(page.locator('#notes')).toBeInViewport();
    // The CSS draws the board on the notes before the script runs, so nothing jumps
    expect(await drawnByCss(page)).toEqual(await layer(page));
  });

  test('on the About page, glides the board to the notes', async ({ page }) => {
    await page.goto('about.html');
    await expect(page.locator('#about-title')).toBeInViewport();
    await expect(page.locator('#notes')).not.toBeInViewport({ ratio: 0.5 });
    await button(page).click();
    await expect(page).toHaveURL(/\/about\.html#notes$/);
    await expect.poll(() => notesTop(page)).toBe(120);
    await expect(page.locator('#notes .board-section__tab')).toBeInViewport();
  });

  test('the home page\'s "Leave me a note" sticker is on the first screen, left of the intro, and opens About on the notes', async ({ page }) => {
    await page.goto('index.html');
    const sticker = page.getByRole('link', { name: 'Leave me a note' });
    await expect(sticker).toHaveAttribute('href', '/about.html#notes');
    await expect(sticker).toBeInViewport({ ratio: 1 });
    // It hangs off the intro's left edge, and is part of the intro, so it moves with it
    await expect(page.locator('.intro .intro__hint')).toHaveCount(1);
    const [hint, intro] = await Promise.all([sticker.boundingBox(), page.locator('.intro').boundingBox()]);
    expect(hint.x + hint.width / 2).toBeLessThan(intro.x);
    expect(hint.x + hint.width).toBeGreaterThan(intro.x);

    await sticker.click();
    await expect(page).toHaveURL(/\/about\.html#notes$/);
    await expect.poll(() => notesTop(page)).toBe(120);
    expect(await drawnByCss(page)).toEqual(await layer(page));
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the toolbar button scrolls the About page to the notes', async ({ page }) => {
      await page.goto('about.html');
      await button(page).tap();
      await expect(page).toHaveURL(/\/about\.html#notes$/);
      await expect(page.locator('#notes .board-section__tab')).toBeInViewport();
    });

    test('the home page\'s sticker sits under the intro\'s stickies and leads to the notes', async ({ page }) => {
      await page.goto('index.html');
      const sticker = page.getByRole('link', { name: 'Leave me a note' });
      await sticker.scrollIntoViewIfNeeded();
      const [hint, last] = await Promise.all([sticker.boundingBox(), page.locator('.intro__notes .sticky').last().boundingBox()]);
      expect(hint.y).toBeGreaterThan(last.y + last.height);
      await sticker.tap();
      await expect(page).toHaveURL(/\/about\.html#notes$/);
      await expect(page.locator('#notes .board-section__tab')).toBeInViewport();
    });
  });
});

test('anywhere but dmaksimoff.com, nothing goes to the database', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => { if (toDatabase(new URL(r.url()))) asked.push(r.url()); });
  await page.goto('about.html');
  await expect(page.locator('[data-notes-empty]')).toHaveText('Notes show on dmaksimoff.com.');
  await page.locator('[data-notes-open]').click();
  await page.locator('#note-message').fill('Hello');
  await page.locator('#note-name').fill('Tester');
  await page.locator('.notes__post').click();
  await expect(status(page)).toHaveText('Notes can only be posted on dmaksimoff.com.');
  expect(asked).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the notes come after "What I believe in", one to a row, nothing wider than the screen', async ({ page }) => {
    await openLive(page, { notes: MANY });
    await expect(stickies(page)).toHaveCount(12);
    const order = await page.evaluate(() => [...document.querySelectorAll('main > section, main > div.widget')].map((el) => el.id || 'playlist'));
    expect(order).toEqual(['about', 'who', 'do', 'believe', 'notes', 'playlist']);
    const [first, second] = await Promise.all([stickies(page).nth(0).boundingBox(), stickies(page).nth(1).boundingBox()]);
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the section says it needs JavaScript, and shows no form', async ({ page }) => {
    await page.goto('about.html');
    await expect(page.locator('.notes__nojs')).toBeVisible();
    await expect(page.locator('[data-notes-open]')).toBeHidden();
    await expect(page.locator('[data-notes-form]')).toBeHidden();
  });
});
