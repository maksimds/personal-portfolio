// Checks the notes wall on the About page (src/components/about/Notes.astro, src/scripts/notes.ts):
// visitors' notes show as stickies, in plain text; posting one sends only a name and a message;
// the section says so when there are no notes, when they can't load, when a note doesn't go
// through and when the database is pausing the visitor after 3 notes; on the canvas it's a column to the left of "Who I am" that never moves the other blocks,
// and past two rows its notes scroll inside it, the next row's tops peeking in at its bottom edge,
// with a scrollbar of its own that shows on hover, and a grip in its corner that resizes it.
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
// `posted` is what the database says back to a post, if anything.
async function openLive(page, { notes = [], load = 200, post = 201, posted } = {}) {
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
      return route.fulfill({ status: post, headers: CORS, ...(posted ? { json: posted } : { body: '' }) });
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

  test('past the limit of 3 notes, it says how long the pause has left, and keeps what was written', async ({ page, context }) => {
    // What the database says back (supabase/notes-limit.sql): 2501 seconds left is 42 minutes
    const calls = await openLive(page, { post: 429, posted: { code: 'PT429', message: 'Too many notes', details: '2501', hint: null } });
    await panToNotes(page);
    await page.locator('[data-notes-open]').click();
    await page.locator('#note-message').fill('One more');
    await page.locator('#note-name').fill('Tester');
    await page.locator('.notes__post').click();
    await expect(status(page)).toHaveText('That’s the limit of 3 notes for now. You can post another in 42 minutes.');
    expect(calls.posts).toHaveLength(1);
    await expect(page.locator('[data-notes-form]')).toBeVisible();
    await expect(page.locator('#note-message')).toHaveValue('One more');
    await expect(page.locator('.notes__post')).toHaveText('Post');

    // Under a minute left reads as 1 minute; with no time given, the whole hour
    for (const [details, text] of [['30', '1 minute'], [undefined, '60 minutes']]) {
      const other = await context.newPage();
      await openLive(other, { post: 429, posted: { code: 'PT429', message: 'Too many notes', details } });
      await panToNotes(other);
      await other.locator('[data-notes-open]').click();
      await other.locator('#note-message').fill('One more');
      await other.locator('#note-name').fill('Tester');
      await other.keyboard.press('ControlOrMeta+Enter');
      await expect(status(other)).toHaveText(`That’s the limit of 3 notes for now. You can post another in ${text}.`);
    }
  });

  test('past the limit for the whole network, it says so instead', async ({ page }) => {
    await openLive(page, { post: 429, posted: { code: 'PT429', message: 'Too many notes', details: '600', hint: 'network' } });
    await panToNotes(page);
    await page.locator('[data-notes-open]').click();
    await page.locator('#note-message').fill('One more');
    await page.locator('#note-name').fill('Tester');
    await page.locator('.notes__post').click();
    await expect(status(page)).toHaveText('Lots of notes have come from your network in the last hour. You can post another in 10 minutes.');
    await expect(page.locator('#note-message')).toHaveValue('One more');
  });

  test('each browser sends its own random ID with a note, the same one every time', async ({ page, browser }) => {
    // Posts one note on a page, and returns the ID it was sent with
    const sendNote = async (p, calls) => {
      await panToNotes(p);
      await p.locator('[data-notes-open]').click();
      await p.locator('#note-message').fill('Hello');
      await p.locator('#note-name').fill('Tester');
      await p.locator('.notes__post').click();
      await expect(status(p)).toHaveText('Thanks! Your note will show here once I’ve read it.');
      return calls.posts.at(-1).headers['x-notes-visitor'];
    };
    const first = await sendNote(page, await openLive(page));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // The same browser, on another visit: the same ID
    const again = await page.context().newPage();
    expect(await sendNote(again, await openLive(again))).toBe(first);
    // Another browser (a friend on the same Wi-Fi): another ID
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const friend = await other.newPage();
    expect(await sendNote(friend, await openLive(friend))).not.toBe(first);
    await other.close();
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

  test('past two rows the notes scroll inside the section, the next row\'s tops peeking in at its bottom edge', async ({ page, context }) => {
    const list = page.locator('.notes__list');
    // Six notes: two rows show in full, the third only its top 40px, at the section's bottom edge
    await openLive(page, { notes: MANY.slice(0, 6).map((n, i) => ({ ...n, message: `Note ${i}` })) });
    await expect(stickies(page)).toHaveCount(6);
    await panToNotes(page);
    await expect(page.locator('.notes__view')).toHaveClass(/\bnotes__view--scroll\b/);
    const shown = await page.evaluate(() => {
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.board__layer')).transform).a;
      const box = (el) => el.getBoundingClientRect();
      const l = document.querySelector('.notes__list');
      const items = [...l.children].map((el) => box(el));
      return { zoom, list: box(l), section: box(document.querySelector('#notes')), items, scrolls: l.scrollHeight > l.clientHeight, tab: l.getAttribute('tabindex') };
    });
    expect(shown.scrolls).toBe(true);
    expect(shown.tab).toBe('0');
    // (each note has a slight tilt, so its box is a little bigger than it is)
    for (const item of shown.items.slice(0, 4)) expect(item.bottom).toBeLessThan(shown.list.bottom);
    for (const item of shown.items.slice(4)) expect((shown.list.bottom - item.top) / shown.zoom).toBeCloseTo(40, -1);
    expect(Math.abs(shown.section.bottom - shown.list.bottom) / shown.zoom).toBeLessThan(3);

    // The wheel over them scrolls them, not the board, down to the end and no further...
    const board = await page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform);
    const box = await list.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 100);
    await expect.poll(() => list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1)).toBe(true);
    expect(await page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform)).toBe(board);
    // ...where the last row has the section's padding under it
    const end = await page.evaluate(() => {
      const l = document.querySelector('.notes__list');
      return (l.getBoundingClientRect().bottom - l.lastElementChild.getBoundingClientRect().bottom) / new DOMMatrix(getComputedStyle(document.querySelector('.board__layer')).transform).a;
    });
    expect(end).toBeGreaterThan(24);
    // Once the wheel has rested, it pans the board again
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, 100);
    await expect.poll(() => page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform)).not.toBe(board);

    // Tabbed to, the keys scroll it, not the board
    await list.evaluate((el) => { el.scrollTop = 0; });
    await list.focus();
    const before = await page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform)).toBe(before);

    // Four notes (two rows) fit: nothing to scroll, nothing to tab to
    const few = await context.newPage();
    await openLive(few, { notes: SOME.concat(note(4, 'Hi')) });
    await expect(stickies(few)).toHaveCount(4);
    await expect(few.locator('.notes__view')).not.toHaveClass(/\bnotes__view--scroll\b/);
    await expect(few.locator('.notes__bar')).toBeHidden();
    await expect(few.locator('.notes__list')).not.toHaveAttribute('tabindex');
  });

  test('however many notes there are, the section is no taller than two rows and a peek', async ({ page }) => {
    await openLive(page, { notes: MANY });
    await expect(stickies(page)).toHaveCount(12);
    await droppedIn(page);
    const { list, rows } = await page.evaluate(() => {
      const l = document.querySelector('.notes__list');
      const items = [...l.children];
      return { list: l.clientHeight, rows: items[4].offsetTop };
    });
    expect(list).toBe(rows + 40);
  });

  test('the notes have a scrollbar of their own that shows while the pointer is over them, and works', async ({ page }) => {
    const list = page.locator('.notes__list');
    const bar = page.locator('.notes__bar');
    const thumb = page.locator('.notes__thumb');
    const scrolled = () => list.evaluate((el) => el.scrollTop);
    const transform = () => page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform);
    await openLive(page, { notes: MANY.map((n, i) => ({ ...n, message: `Note ${i}` })) });
    await expect(stickies(page)).toHaveCount(12);
    await panToNotes(page);

    // Not seen until the pointer is over the notes; the browser's own is hidden
    await page.mouse.move(5, 450);
    await expect(bar).toHaveCSS('opacity', '0');
    expect(await list.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe('none');
    const box = await list.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(bar).toHaveCSS('opacity', '1');
    // The thumb is as long, against its track, as the part of the list that shows
    const sizes = await page.evaluate(() => {
      const l = document.querySelector('.notes__list');
      return { thumb: document.querySelector('.notes__thumb').offsetHeight, track: document.querySelector('.notes__bar').clientHeight, shown: l.clientHeight / l.scrollHeight };
    });
    expect(sizes.thumb / sizes.track).toBeCloseTo(sizes.shown, 2);

    // Dragging the thumb down scrolls the notes, and doesn't pick the section up or pan the board
    const board = await transform();
    const notes = await page.locator('#notes').boundingBox();
    const t = await thumb.boundingBox();
    await page.mouse.move(t.x + t.width / 2, t.y + 10);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2, t.y + 90, { steps: 6 });
    await page.mouse.up();
    expect(await scrolled()).toBeGreaterThan(100);
    expect(await page.locator('#notes').boundingBox()).toEqual(notes);
    expect(await transform()).toBe(board);
    // The thumb follows: further down its track as the notes go further
    const moved = await thumb.boundingBox();
    expect(moved.y).toBeGreaterThan(t.y + 40);

    // Pressing the track near its top jumps back there
    const track = await bar.boundingBox();
    await page.mouse.click(track.x + track.width / 2, track.y + 4);
    await expect.poll(scrolled).toBeLessThan(5);

    // The wheel over it scrolls the notes, not the board
    await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(scrolled).toBeGreaterThan(100);
    expect(await transform()).toBe(board);
  });

  test('its bottom-right corner has a grip that makes it wider and taller, more columns as it widens', async ({ page }) => {
    const notes = page.locator('#notes');
    const grip = page.locator('.notes__resize');
    const list = page.locator('.notes__list');
    const zoom = 0.8;
    await openLive(page, { notes: MANY.map((n, i) => ({ ...n, message: `Note ${i}` })) });
    await expect(stickies(page)).toHaveCount(12);
    await panToNotes(page);
    const columns = () => list.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    const size = () => page.evaluate(() => ({ width: document.querySelector('#notes').offsetWidth, shown: document.querySelector('.notes__list').clientHeight, all: document.querySelector('.notes__list').scrollHeight }));

    // The grip sits in the corner, in front of the notes; pointed at, the system's resize pointer
    // shows instead of the "Me" arrow
    const before = await notes.boundingBox();
    const g = await grip.boundingBox();
    expect(before.x + before.width - (g.x + g.width)).toBeLessThan(8);
    expect(before.y + before.height - (g.y + g.height)).toBeLessThan(8);
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await expect(grip).toHaveCSS('cursor', 'nwse-resize');
    await expect(page.locator('[data-user-cursor]')).toBeHidden();
    const start = await size();
    expect(start.width).toBe(592);
    expect(await columns()).toBe(2);

    // Pulled right and down: wider (a third column from 864px) and taller, its top-left corner
    // where it was, and outlined while it's pulled
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + 300 * zoom, g.y + g.height / 2 + 100 * zoom, { steps: 8 });
    await expect(notes).toHaveClass(/\bis-resizing\b/);
    await expect(notes).toHaveCSS('outline-style', 'solid');
    await page.mouse.up();
    await expect(notes).not.toHaveClass(/\bis-resizing\b/);
    const wider = await size();
    expect(wider.width).toBe(892);
    expect(await columns()).toBe(3);
    const after = await notes.boundingBox();
    expect({ x: Math.round(after.x), y: Math.round(after.y) }).toEqual({ x: Math.round(before.x), y: Math.round(before.y) });
    expect(wider.shown).toBeGreaterThan(start.shown + 99);

    // Pulled further than the notes need, it stops where all of them show, and at four columns
    const g2 = await grip.boundingBox();
    await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
    await page.mouse.down();
    await page.mouse.move(g2.x + 900, g2.y + 900, { steps: 8 });
    await page.mouse.up();
    const most = await size();
    expect(most.width).toBe(1136);
    expect(await columns()).toBe(4);
    expect(most.shown).toBe(most.all);
    await expect(page.locator('.notes__bar')).toBeHidden();   // nothing left to scroll

    // ...and pushed back past where it started, it stops at its starting size
    const g3 = await grip.boundingBox();
    await page.mouse.move(g3.x + g3.width / 2, g3.y + g3.height / 2);
    await page.mouse.down();
    await page.mouse.move(g3.x - 1500, g3.y - 1500, { steps: 8 });
    await page.mouse.up();
    const least = await size();
    expect(least.width).toBe(592);
    expect(least.shown).toBe(start.shown);

    // A reload starts it afresh
    await page.mouse.move(g3.x - 300, g3.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.reload();
    await expect(stickies(page)).toHaveCount(12);
    expect((await size()).width).toBe(592);
  });

  test('with the hand tool, pressing the grip pans the board instead', async ({ page }) => {
    await openLive(page, { notes: MANY.map((n, i) => ({ ...n, message: `Note ${i}` })) });
    await expect(stickies(page)).toHaveCount(12);
    await panToNotes(page);
    await page.keyboard.press('h');
    const board = await page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform);
    const g = await page.locator('.notes__resize').boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + 100, g.y + 60, { steps: 6 });
    await page.mouse.up();
    expect(await page.locator('#notes').evaluate((el) => el.offsetWidth)).toBe(592);
    expect(await page.locator('.board__layer').evaluate((el) => getComputedStyle(el).transform)).not.toBe(board);
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
