// Browser checks for the site: `npm run test:browser` (on GitHub, see .github/workflows/checks.yml).
// The tests themselves are in tests/.
const { defineConfig } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },           // a busy machine can draw the animations slowly; a real failure still fails
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,       // one retry on GitHub, so a hiccup on their machine doesn't fail a run
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // On your Mac the checks use your own Google Chrome, so there's nothing to download.
    // On GitHub they use Playwright's Chromium, which the workflow installs.
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  // Serves the site the way GitHub Pages does: the files as they are, no build step.
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore',                    // the server logs every request; keep the output to the results
  },

  // The animation checks run at four screen sizes; the link check only needs one.
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tall screen', testMatch: 'animations.spec.js', use: { viewport: { width: 1080, height: 1920 } } },
    { name: 'tablet', testMatch: 'animations.spec.js', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'phone', testMatch: 'animations.spec.js', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
