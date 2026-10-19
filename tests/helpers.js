// Shared by the browser checks.
const fs = require('fs');
const path = require('path');

// The built site (`npm run build` puts it in dist/)
const dist = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(dist)) throw new Error('No dist/ folder: run `npm run build` first (or use `npm test`, which does)');

// Every page of the site: the .html files at the top of dist/ and in dist/projects/. Case studies
// still being written (published: false) aren't built, so they're never among them.
const pages = [
  ...fs.readdirSync(dist).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(dist, 'projects'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `projects/${f}`),
].sort();

// Everything that starts hidden and animates in: the heroes (.hero-in), the blur-in lines (.blur-in)
// and the older scroll fade-in (.reveal).
const ANIMATED = '.hero-in, .blur-in, .reveal';

// Scrolls down the page the way a person would, a bit at a time, until the bottom. Keeps going
// while the page grows (lazy images load as they come into view and make it taller).
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const doc = document.documentElement;
    let height = -1;
    for (let i = 0; i < 400 && (scrollY + innerHeight < doc.scrollHeight - 1 || height !== doc.scrollHeight); i++) {
      height = doc.scrollHeight;
      scrollBy(0, 250);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
}

// Collects script errors and console errors (which include files that failed to load).
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

module.exports = { dist, pages, ANIMATED, scrollThrough, collectErrors };
