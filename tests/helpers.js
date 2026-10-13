// Shared by the browser checks.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Every page of the site: the .html files at the top level and in projects/. The project template
// is left out: it's gitignored, so it only exists on your Mac and a local run would differ from GitHub's.
const pages = [
  ...fs.readdirSync(root).filter((f) => f.endsWith('.html')),
  ...fs.readdirSync(path.join(root, 'projects'))
    .filter((f) => f.endsWith('.html') && f !== 'project-template.html')
    .map((f) => `projects/${f}`),
].sort();

// Case studies still being written, which nothing on the site links to yet. Their [YOUR …] placeholders
// and YOUR_LINK_URL links are expected for now. When one is finished, take it off this list, and the
// checks will make sure no placeholder is left on it.
const drafts = ['projects/turblend-case-study.html'];

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

module.exports = { pages, drafts, ANIMATED, scrollThrough, collectErrors };
