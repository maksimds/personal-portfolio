// Checks that every link and file on the site points at something that exists: other pages, sections
// within pages (#work and the like), images, the stylesheet and the script. Links to other websites
// (LinkedIn, Google Drive, Figma, Google Fonts) aren't checked: those sites often turn automated
// visitors away, which would fail the check when nothing is wrong.
const { test, expect } = require('@playwright/test');
const { pages } = require('./helpers');

for (const url of pages) {
  test(`${url}: every link and file on the site exists`, async ({ page, request, baseURL }) => {
    await page.goto(url);

    const refs = await page.evaluate(() => {
      const all = (sel, attr) => [...document.querySelectorAll(sel)].map((el) => el.getAttribute(attr));
      const srcsets = all('[srcset]', 'srcset').flatMap((s) => s.split(',').map((c) => c.trim().split(/\s+/)[0]));
      return [...all('[href]', 'href'), ...all('[src]', 'src'), ...srcsets];
    });

    const site = new URL(baseURL).origin;
    const broken = [];
    const fetched = new Map();   // each file is fetched once, even when many links point at it

    for (const ref of new Set(refs)) {
      const target = new URL(ref, page.url());
      if (target.origin !== site) continue;    // mailto:, other websites

      const file = target.origin + target.pathname;
      if (!fetched.has(file)) {
        const res = await request.get(file);
        fetched.set(file, { ok: res.ok(), status: res.status(), text: res.ok() ? await res.text() : '' });
      }
      const { ok, status, text } = fetched.get(file);
      if (!ok) { broken.push(`${ref} (${status})`); continue; }

      // A link to a section must find an element with that id on the page it points to
      const id = decodeURIComponent(target.hash.slice(1));
      if (id && !text.includes(`id="${id}"`)) broken.push(`${ref} (no id="${id}" on that page)`);
    }

    expect(broken, 'links or files that point at nothing').toEqual([]);
  });
}
