import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { preview, type PreviewServer } from "vite";

/**
 * Offline proof for the installed PWA (run with `npm run test:offline`).
 * Serves the real production build (no VITE_E2E, so no test bridge), lets the
 * service worker install, then kills the server AND emulates offline before
 * reloading: anything that renders afterwards came from Cache Storage.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DIST = join(ROOT, "dist");
const BASE = "/jokarikara/";

let server: PreviewServer | undefined;

const stopServer = async () => {
  const running = server;
  server = undefined;
  await running?.close();
};

test.beforeAll(async ({}, testInfo) => {
  if (!existsSync(join(DIST, "sw.js"))) {
    throw new Error("dist/sw.js is missing: build first (`npm run test:offline` does).");
  }
  const { port } = new URL(testInfo.project.use.baseURL!);
  server = await preview({
    root: ROOT,
    configFile: join(ROOT, "vite.config.ts"),
    logLevel: "warn",
    preview: { port: Number(port), strictPort: true, open: false },
  });
});

test.afterAll(stopServer);

/** Every file the build emitted except the worker, as URL paths. */
const expectedPrecache = () =>
  readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== "sw.js")
    .map((entry) => BASE + join(entry.parentPath, entry.name).slice(DIST.length + 1))
    .sort();

test("the installed game starts and plays with no network", async ({ page, context }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("./");
  await expect(page.locator(".start-btn")).toBeVisible();

  // GitHub Pages picks the type from the extension, as preview does.
  const sw = await page.request.get("sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);

  // Installed + activated, and clients.claim() took over this first page.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys[0]);
    const urls = (await cache.keys()).map((request) => new URL(request.url).pathname);
    return { keys, urls: urls.sort() };
  });
  expect(cached.keys).toEqual([expect.stringMatching(/^shape-stack-[0-9a-f]{12}$/)]);
  expect(cached.urls).toEqual(expectedPrecache());

  await stopServer();
  await context.setOffline(true);

  const response = await page.reload();
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.locator(".start-btn")).toBeVisible();

  // Keyboard START, as a player without a pointer would.
  await page.keyboard.press("Enter");
  await expect(page.locator(".start-screen")).toHaveCount(0);
  await expect(page.locator("canvas")).toBeVisible();

  // A brand-new tab (cold navigation, no page in memory) works offline too.
  const fresh = await context.newPage();
  await fresh.goto("./");
  await expect(fresh.locator(".start-btn")).toBeVisible();

  expect(pageErrors).toEqual([]);
});
