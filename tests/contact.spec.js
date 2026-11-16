// Checks the Contact page (src/pages/contact.astro, src/scripts/contact.ts): on a desktop it's a
// canvas that opens on "Let’s talk" and the form, with a line between them; sending the form posts
// only the name, the email address and the message, and thanks the visitor; it says so when a
// message doesn't go through, when the database is pausing the visitor and when a field is blank;
// the pills and menus lead to it; and on a phone and without JavaScript it's an ordinary page.
// Only the live site talks to the database, so the sending checks open the page as if it were on
// dmaksimoff.com (the built files in dist/ are handed to the browser for that address, as in
// notes.spec.js), and the database itself is always faked: no check ever posts to the real one.
// Google's tag is stopped before it loads, so no test visit is ever counted.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { dist } = require('./helpers');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const api = read('src/data/contact.ts').match(/messagesApi = '([^']*)'/)[1];
const email = read('src/data/site.ts').match(/email: '([^']*)'/)[1];
const toDatabase = (url) => url.href.startsWith(new URL(api).origin);
const LIVE = 'https://dmaksimoff.com/contact.html';
const CORS = { 'access-control-allow-origin': '*' };
const THANKS = (to) => `Thanks! I got your message and will write back to ${to} as soon as I can.`;

// Opens the Contact page as if on dmaksimoff.com with a fake database, and returns what was sent
// to it. `post` is the status the database answers with, `posted` what it says back, and `hold`
// a promise the answer waits for (to catch the form while it's sending).
async function openLive(page, { post = 201, posted, hold } = {}) {
  const calls = { posts: [], other: [] };
  await page.route('https://dmaksimoff.com/**', (route) => {
    const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
    return route.fulfill({ path: path.join(dist, file) });
  });
  await page.route(/^https:\/\/www\.(googletagmanager|google-analytics)\.com\//, (route) => route.fulfill({ body: '' }));
  await page.route(toDatabase, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') {
      calls.other.push(req.url());
      return route.fulfill({ status: 404, headers: CORS, body: '' });
    }
    calls.posts.push({ url: req.url(), body: req.postDataJSON(), headers: req.headers() });
    if (hold) await hold;
    return route.fulfill({ status: post, headers: CORS, ...(posted ? { json: posted } : { body: '' }) });
  });
  await page.goto(LIVE);
  await expect(page.locator('#contact-title')).toBeInViewport();
  return calls;
}

const status = (page) => page.locator('[data-contact-status]');
const send = (page) => page.locator('.contact-form__button');
async function fill(page, { name = 'Alex Doe', from = 'alex@example.com', message = 'Hi Denis, let’s talk about a role.' } = {}) {
  await page.locator('#contact-name').fill(name);
  await page.locator('#contact-email').fill(from);
  await page.locator('#contact-message').fill(message);
}

// Where the board's layer is drawn: its offset on screen and its zoom; and where the CSS alone
// draws it (as it does before the script runs)
const layer = (page) => page.locator('.board__layer').evaluate((el) => {
  const m = new DOMMatrix(getComputedStyle(el).transform);
  return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
});
const drawnByCss = (page) => page.locator('.board__layer').evaluate((el) => {
  const set = el.style.transform;
  el.style.transform = '';
  const m = new DOMMatrix(getComputedStyle(el).transform);
  el.style.transform = set;
  return { x: Math.round(m.e), y: Math.round(m.f), zoom: Math.round(m.a * 100) / 100 };
});
const isCanvas = (page) => page.evaluate(() => document.documentElement.classList.contains('is-canvas'));
// Waits until the page's objects have finished dropping in, which moves them a few pixels
const droppedIn = (page) => page.waitForFunction(() => document.getAnimations()
  .every((a) => a.animationName !== 'drop-in' || a.playState === 'finished'));

test.describe('the Contact page on a desktop', () => {
  test('is a canvas that opens on "Let’s talk" and the form at 90%, with a line from one to the other', async ({ page }) => {
    await page.goto('contact.html');
    await expect(page).toHaveTitle('Contact — Denis Maksimov');
    await expect(page.locator('h1')).toHaveText('Let’s talk');
    await expect(page.locator('.contact-intro__text')).toContainText('Fill out the form below');
    await expect(page.locator('.contact-intro__text')).toContainText('I promise to reach out as soon as I can.');
    expect(await isCanvas(page)).toBe(true);
    await expect(page.locator('[data-zoom-value]')).toHaveText('90%');
    expect((await layer(page)).zoom).toBe(0.9);
    // The CSS draws the board where the script keeps it, so nothing jumps as the page opens
    expect(await drawnByCss(page)).toEqual(await layer(page));
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);

    // Both sections, tabs and all, are on the first screen, clear of the pills and the toolbar
    await droppedIn(page);
    const pills = await page.locator('.chrome--top').boundingBox();
    const toolbar = await page.locator('.toolbar').boundingBox();
    const tab = await page.locator('#contact .board-section__tab').boundingBox();
    const form = await page.locator('#message').boundingBox();
    expect(tab.y).toBeGreaterThan(pills.y + pills.height);
    expect(form.y + form.height).toBeLessThan(toolbar.y);
    // (0.99: at 90% an edge can land a hair past a whole pixel)
    for (const sel of ['#contact', '#message', '.contact-form__button']) await expect(page.locator(sel)).toBeInViewport({ ratio: 0.99 });
    await expect(page.locator('#message-title')).toHaveText('Send a message');

    // Only these two sections, one over the other, joined by a line that's drawn
    await expect(page.locator('main > .board-section')).toHaveCount(2);
    const intro = await page.locator('#contact').boundingBox();
    expect(form.y).toBeGreaterThan(intro.y + intro.height);
    const line = page.locator('[data-connector][data-from="contact"][data-to="message"]');
    await expect(line).toHaveCount(1);
    await expect(line.locator('.connector__line')).toHaveAttribute('d', /\S/);
    // It's shown, and runs down the gap between the two (a straight line down has no width, which
    // Playwright would call hidden, so its length is measured instead)
    await expect(line.locator('.connector__line')).toHaveCSS('visibility', 'visible');
    const drawn = await line.locator('.connector__line').evaluate((el) => el.getBoundingClientRect());
    expect(drawn.height).toBeGreaterThan(40);
    expect(drawn.top).toBeGreaterThanOrEqual(Math.floor(intro.y + intro.height));
    expect(drawn.bottom).toBeLessThanOrEqual(Math.ceil(form.y));
  });

  test('the fields have labels, the browser checks them, and the email must look like one', async ({ page }) => {
    const calls = await openLive(page);
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('autocomplete', 'name');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('type', 'email');
    await expect(page.getByLabel('Message', { exact: true })).toHaveJSProperty('tagName', 'TEXTAREA');
    for (const id of ['#contact-name', '#contact-email', '#contact-message']) await expect(page.locator(id)).toHaveAttribute('required', '');

    // Empty, nothing is sent: the browser stops it and points at the first field
    await send(page).click();
    await expect(page.locator('#contact-name')).toBeFocused();
    await fill(page, { from: 'not an email' });
    await send(page).click();
    await expect(page.locator('#contact-email')).toBeFocused();
    expect(await page.locator('#contact-email').evaluate((el) => el.validity.typeMismatch)).toBe(true);
    // The field the browser turned away gets a red edge
    await expect(page.locator('#contact-email')).toHaveCSS('border-top-color', 'rgb(209, 36, 47)');
    expect(calls.posts).toHaveLength(0);
    await expect(status(page)).toHaveText('');
  });

  test('sending posts only the name, the email and the message, then thanks the visitor and empties the form', async ({ page }) => {
    const calls = await openLive(page);
    await fill(page, { name: '  Alex Doe ', from: 'alex@example.com', message: '  Hi Denis!\nLet’s talk.  ' });
    await send(page).click();

    await expect(status(page)).toHaveText(THANKS('alex@example.com'));
    expect(calls.posts).toHaveLength(1);
    expect(calls.posts[0].url).toBe(api);
    expect(calls.posts[0].body).toEqual({ name: 'Alex Doe', email: 'alex@example.com', message: 'Hi Denis!\nLet’s talk.' });
    expect(calls.posts[0].headers.prefer).toBe('return=minimal');
    expect(calls.posts[0].headers.apikey).toMatch(/^sb_publishable_/);
    expect(calls.posts[0].headers['x-notes-visitor']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Nothing is ever read from the messages table
    expect(calls.other).toEqual([]);
    for (const id of ['#contact-name', '#contact-email', '#contact-message']) await expect(page.locator(id)).toHaveValue('');
    await expect(send(page)).toHaveText('Send message');
  });

  test('while sending, the button says so and a second press sends nothing more', async ({ page }) => {
    let answer;
    const calls = await openLive(page, { hold: new Promise((r) => { answer = r; }) });
    await fill(page);
    await send(page).click();
    await expect(send(page)).toHaveText('Sending…');
    await expect(send(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#contact-message')).toHaveJSProperty('readOnly', true);
    // Playwright won't press a button marked aria-disabled by itself, so this one is forced
    await send(page).click({ force: true });
    await page.keyboard.press('ControlOrMeta+Enter');
    answer();
    await expect(status(page)).toHaveText(THANKS('alex@example.com'));
    expect(calls.posts).toHaveLength(1);
    await expect(page.locator('#contact-message')).toHaveJSProperty('readOnly', false);
  });

  test('⌘ or Ctrl + Enter sends from any field', async ({ page }) => {
    const calls = await openLive(page);
    await fill(page);
    await page.locator('#contact-message').focus();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(status(page)).toHaveText(THANKS('alex@example.com'));
    expect(calls.posts).toHaveLength(1);
  });

  test('blank fields aren\'t sent, and a message that doesn\'t go through keeps what was written and offers the email', async ({ page }) => {
    const calls = await openLive(page, { post: 500 });
    // Only spaces and a line break: the browser's own check lets them through, the page doesn't
    await fill(page, { name: '   ' });
    await send(page).click();
    await expect(status(page)).toHaveText('Add your name, then send your message.');
    await expect(page.locator('#contact-name')).toBeFocused();
    await fill(page, { message: ' \n ' });
    await send(page).click();
    await expect(status(page)).toHaveText('Write a message first.');
    await expect(page.locator('#contact-message')).toBeFocused();
    expect(calls.posts).toHaveLength(0);

    await fill(page);
    await send(page).click();
    await expect(status(page)).toHaveText(`Your message didn’t go through. Please try again, or email me at ${email}.`);
    await expect(status(page).locator('a')).toHaveAttribute('href', `mailto:${email}`);
    expect(calls.posts).toHaveLength(1);
    await expect(page.locator('#contact-name')).toHaveValue('Alex Doe');
    await expect(page.locator('#contact-message')).toHaveValue('Hi Denis, let’s talk about a role.');
    await expect(send(page)).toHaveText('Send message');
  });

  test('past the limit of 3 messages, it says how long the pause has left, and keeps what was written', async ({ page, context }) => {
    // What the database says back (supabase/messages.sql): 2501 seconds left is 42 minutes
    await openLive(page, { post: 429, posted: { code: 'PT429', message: 'Too many notes', details: '2501', hint: 'browser' } });
    await fill(page);
    await send(page).click();
    await expect(status(page)).toHaveText('That’s the limit of 3 messages for now. You can send another in 42 minutes.');
    await expect(page.locator('#contact-message')).toHaveValue('Hi Denis, let’s talk about a role.');

    const network = await context.newPage();
    await openLive(network, { post: 429, posted: { code: 'PT429', message: 'Too many notes', details: '600', hint: 'network' } });
    await fill(network);
    await send(network).click();
    await expect(status(network)).toHaveText('Lots of messages have come from your network in the last hour. You can send another in 10 minutes.');
  });

  test('a message goes with the same browser ID as the notes', async ({ page }) => {
    const calls = await openLive(page);
    await fill(page);
    await send(page).click();
    await expect(status(page)).toHaveText(THANKS('alex@example.com'));
    // The ID the notes wall keeps in this browser (src/scripts/database.ts)
    expect(calls.posts[0].headers['x-notes-visitor']).toBe(await page.evaluate(() => localStorage.getItem('notes-visitor')));
  });

  test('typing in the form doesn\'t set off the shortcuts or pan the board, and a press in it doesn\'t move the section', async ({ page }) => {
    await openLive(page);
    await droppedIn(page);
    const before = await layer(page);
    // A is About's shortcut, H the hand tool's, and the arrow keys pan the board
    const field = page.locator('#contact-message');
    await field.click();
    await field.pressSequentially('aha');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    await expect(field).toHaveValue('aha');
    await expect(page).toHaveURL(LIVE);
    expect(await page.evaluate(() => document.documentElement.matches('.tool-hand, .is-space'))).toBe(false);
    expect(await layer(page)).toEqual(before);

    // Pressing in the field and moving selects text instead of picking up the section
    const section = await page.locator('#message').boundingBox();
    const box = await field.boundingBox();
    await page.mouse.move(box.x + 6, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 40, { steps: 6 });
    await page.mouse.up();
    expect(await page.locator('#message').boundingBox()).toEqual(section);
  });

  test('the two sections can be moved, and the line between them follows', async ({ page }) => {
    await page.goto('contact.html');
    await droppedIn(page);
    const line = page.locator('[data-connector][data-from="contact"] .connector__line');
    await expect(line).toHaveAttribute('d', /\S/);
    const drawn = await line.getAttribute('d');
    const before = await page.locator('#contact').boundingBox();
    await page.mouse.move(before.x + 40, before.y + 20);
    await page.mouse.down();
    await page.mouse.move(before.x + 200, before.y + 60, { steps: 6 });
    await page.mouse.up();
    const after = await page.locator('#contact').boundingBox();
    expect(Math.round(after.x - before.x)).toBe(160);
    expect(Math.round(after.y - before.y)).toBe(40);
    await expect.poll(() => line.getAttribute('d')).not.toBe(drawn);
  });

  test('anywhere but dmaksimoff.com, nothing goes to the database', async ({ page }) => {
    const asked = [];
    page.on('request', (r) => { if (toDatabase(new URL(r.url()))) asked.push(r.url()); });
    await page.goto('contact.html');
    await fill(page);
    await send(page).click();
    await expect(status(page)).toHaveText('Messages can only be sent on dmaksimoff.com.');
    expect(asked).toEqual([]);
  });
});

test.describe('the way to the Contact page', () => {
  test('the violet Contact button opens it, and is marked as the page you\'re on there', async ({ page }) => {
    await page.goto('about.html');
    const button = page.locator('.collab-pill .button-primary');
    await expect(button).toHaveText('Contact');
    await expect(button).not.toHaveAttribute('aria-current');
    await button.click();
    await expect(page).toHaveURL(/\/contact\.html$/);
    await expect(page.locator('.collab-pill .button-primary')).toHaveAttribute('aria-current', 'page');
  });

  test('the page switcher and the DM menu list it', async ({ page }) => {
    await page.goto('contact.html');
    await expect(page.locator('.page-switch--desktop .page-switch__name')).toHaveText('Contact');
    await page.locator('.page-switch--desktop').click();
    await expect(page.locator('#page-menu [aria-current="page"]')).toHaveText('Contact');
    await expect(page.locator('#page-menu a').nth(2)).toHaveAttribute('href', '/contact.html');
    await page.keyboard.press('Escape');
    await page.locator('.file-pill__mark').click();
    await expect(page.locator('#file-menu a[href="/contact.html"]')).toHaveText('Contact');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('it\'s an ordinary page: "Let’s talk" over the form, the fields one under another, nothing wider than the screen', async ({ page }) => {
    await page.goto('contact.html');
    expect(await isCanvas(page)).toBe(false);
    await expect(page.locator('.zoom')).toBeHidden();
    await expect(page.locator('#contact-title')).toBeInViewport();
    const [name, from] = await Promise.all([page.locator('#contact-name').boundingBox(), page.locator('#contact-email').boundingBox()]);
    expect(from.y).toBeGreaterThan(name.y + name.height);
    // 16px, so the phone doesn't zoom in on a field when it's tapped
    await expect(page.locator('#contact-email')).toHaveCSS('font-size', '16px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('the Contact button in the top bar and the phone menu lead to it', async ({ page }) => {
    await page.goto('index.html');
    await page.locator('.collab-pill .button-primary').tap();
    await expect(page).toHaveURL(/\/contact\.html$/);
    await page.locator('.menu-toggle').tap();
    await expect(page.locator('#mobile-menu a[href="/contact.html"]')).toHaveAttribute('aria-current', 'page');
    // The case studies are still listed apart from the main links
    await expect(page.locator('#mobile-menu ul').first().locator('a')).toHaveText(['Home', 'Work', 'About', 'Contact']);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the form, which can\'t send, is hidden, and the email address shows instead', async ({ page }) => {
    await page.goto('contact.html');
    await expect(page.locator('#contact-title')).toBeVisible();
    await expect(page.locator('.contact-form')).toBeHidden();
    await expect(page.locator('.contact-message__nojs a')).toHaveAttribute('href', `mailto:${email}`);
    await expect(page.locator('.contact-message__nojs')).toBeVisible();
  });
});
