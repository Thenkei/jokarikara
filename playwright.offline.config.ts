import { defineConfig, devices } from "@playwright/test";

/**
 * `npm run test:offline`: proves the service worker serves the production
 * build with no network at all (tests/offline). Chromium only: the spec
 * checks our caching logic, not engine differences.
 *
 * No `webServer`: the spec starts `vite preview` on `dist/` itself so it can
 * shut the server down mid-test; a closed port is a stronger proof than
 * network emulation alone. Own port, away from the dev E2E server (6173).
 */
const OFFLINE_PORT = Number(process.env.OFFLINE_PORT ?? 6771);
if (!Number.isInteger(OFFLINE_PORT) || OFFLINE_PORT <= 0 || OFFLINE_PORT > 65535) {
  throw new Error(`Invalid OFFLINE_PORT: "${process.env.OFFLINE_PORT}"`);
}

export default defineConfig({
  testDir: "./tests/offline",
  testMatch: /.*\.offline\.ts$/,
  fullyParallel: false,
  // One preview server per run, owned by the spec.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${OFFLINE_PORT}/jokarikara/`,
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
