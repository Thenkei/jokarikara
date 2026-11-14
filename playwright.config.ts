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
 * Test-selection strategy (see README "Test"):
 * - Chromium runs every spec.
 * - Other engines/devices only run specs tagged `@cross-browser` (canvas
 *   rendering, responsive layout). Gameplay specs drive deterministic JS state
 *   through the test bridge, so replaying them on 5 engines proves nothing new.
 * - `E2E_FULL=1` restores the full matrix (CI on main, manual runs).
 */
const FULL_MATRIX = process.env.E2E_FULL === "1";
const crossBrowserOnly = FULL_MATRIX ? {} : { grep: /@cross-browser/ };

/**
 * Visual baselines are generated on macOS (`*-darwin.png`). Font/AA rendering
 * differs on Linux runners, so snapshot assertions are skipped off-macOS in CI
 * instead of failing on missing/mismatched baselines.
 */
const IGNORE_SNAPSHOTS = !!process.env.CI && process.platform !== "darwin";

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* One retry on CI: enough to absorb infra noise without hiding real flakes. */
  retries: process.env.CI ? 1 : 0,
  /* GitHub runners have 4 vCPUs; tests are independent (fresh page + storage). */
  workers: process.env.CI ? 2 : undefined,
  ignoreSnapshots: IGNORE_SNAPSHOTS,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
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
      ...crossBrowserOnly,
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      ...crossBrowserOnly,
      use: { ...devices["Desktop Safari"] },
    },

    /* Test against mobile viewports. */
    {
      name: "Mobile Chrome",
      ...crossBrowserOnly,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      ...crossBrowserOnly,
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
