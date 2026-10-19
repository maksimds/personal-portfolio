// Checks the page transitions (see "Page transitions" in src/styles/styles.css): going from the home
// page to a case study and back, the project's thumbnail and the case study's logo move as one image,
// and arrive fully visible; other pages just crossfade; with reduced motion there's no transition.
const { test, expect } = require('@playwright/test');
const { collectErrors } = require('./helpers');

// On every page the test browser opens: once the new page's transition starts, note which parts of
// the page move on their own (the page as a whole is "root") and how visible the arriving logo is.
async function watchTransitions(page) {
  await page.addInitScript(() => {
    window.transition = new Promise((resolve) => {
      addEventListener('pagereveal', (e) => {
        if (!e.viewTransition) return resolve(null);
        e.viewTransition.ready.then(() => {
          const parts = new Set(document.documentElement.getAnimations({ subtree: true })
            .map((a) => a.effect && a.effect.pseudoElement).filter(Boolean));
          const moving = [...document.querySelectorAll('img')].find((img) => img.style.viewTransitionName);
          const line = moving && moving.closest('.reveal, .blur-in');
          resolve({ parts: [...parts].sort(), opacity: line ? getComputedStyle(line).opacity : null });
        }, () => resolve({ skipped: true }));
      });
    });
  });
}

async function go(page, link, url) {
  await Promise.all([page.waitForURL(url), page.locator(link).first().click()]);
  return page.evaluate(() => window.transition);
}

const LOGO = ['::view-transition-new(project-logo)', '::view-transition-old(project-logo)'];

test('the thumbnail grows into the case study logo, and back', async ({ page }) => {
  const errors = collectErrors(page);
  await watchTransitions(page);
  await page.goto('/');

  const there = await go(page, '.project__link[href="/projects/tap-case-study.html"]', '**/projects/tap-case-study.html');
  expect(there.parts).toEqual(expect.arrayContaining([...LOGO, '::view-transition-old(root)']));
  expect(there.opacity).toBe('1');

  const back = await go(page, '.case-back', /\/#work$/);
  expect(back.parts).toEqual(expect.arrayContaining(LOGO));
  expect(back.opacity).toBe('1');

  expect(errors).toEqual([]);
});

test('other pages crossfade, without a moving logo', async ({ page }) => {
  await watchTransitions(page);
  await page.goto('/');
  const about = await go(page, '.site-nav a[href="/about.html"]', '**/about.html');
  expect(about.parts).toContain('::view-transition-old(root)');
  expect(about.parts).not.toEqual(expect.arrayContaining(LOGO));
});

test('with reduced motion, there is no transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await watchTransitions(page);
  await page.goto('/');
  expect(await go(page, '.project__link[href="/projects/tap-case-study.html"]', '**/projects/tap-case-study.html')).toBeNull();
});
