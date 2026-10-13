// Checks that no placeholder from the case study template is left on a finished page: no [YOUR …] text
// on the page and no YOUR_… in a link, image or alt text. Draft pages (see helpers.js) are left out.
// Only what visitors can see counts, so notes in HTML comments may still mention placeholders.
const { test, expect } = require('@playwright/test');
const { pages, drafts } = require('./helpers');

for (const url of pages.filter((p) => !drafts.includes(p))) {
  test(`${url}: no placeholders left`, async ({ page }) => {
    await page.goto(url);
    const found = await page.evaluate(() => {
      const text = (document.body.innerText.match(/\[YOUR[^\]]*\]/g) || []);
      const attrs = [...document.querySelectorAll('[href], [src], [alt]')]
        .flatMap((el) => ['href', 'src', 'alt'].map((a) => el.getAttribute(a)))
        .filter((v) => v && v.includes('YOUR'));
      return [...text, ...attrs];
    });
    expect(found, 'placeholders still on the page').toEqual([]);
  });
}
