// Checks that no placeholder from the case study template (src/content/projects/_template.mdx) is left
// on a page: no [YOUR …] text on the page and no YOUR_… in a link, image or alt text. Case studies
// still being written (published: false) aren't built, so this only sees finished ones. Only what
// visitors can see counts, so notes in {/* comments */} may still mention placeholders.
const { test, expect } = require('@playwright/test');
const { pages } = require('./helpers');

for (const url of pages) {
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
