import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/** `npm run perf`: Chromium-only benchmarks in tests/perf (not part of CI). */
export default defineConfig({
  ...base,
  testDir: "./tests/perf",
  testMatch: /.*\.perf\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
