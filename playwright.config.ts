import { defineConfig, devices } from "@playwright/test";

/**
 * Dedicated E2E port, deliberately outside Vite's default dev (5173+) and
 * preview (4173+) ranges, so the suite never collides with — or silently
 * reuses — a regular `npm run dev` server (which lacks VITE_E2E=true) or
 * another Vite project running on the machine. Override with E2E_PORT.
 */
const E2E_PORT = Number(process.env.E2E_PORT ?? 6173);
if (!Number.isInteger(E2E_PORT) || E2E_PORT <= 0 || E2E_PORT > 65535) {
  throw new Error(`Invalid E2E_PORT: "${process.env.E2E_PORT}"`);
}
const BASE_URL = `http://localhost:${E2E_PORT}/jokarikara/`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports. */
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // --strictPort: fail fast if the port is taken, instead of Vite silently
    // moving to the next port while Playwright polls the original one until timeout.
    command: `VITE_E2E=true npm run dev -- --port ${E2E_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
