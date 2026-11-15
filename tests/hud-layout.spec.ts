import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  ALL_WORLDS_REACHED,
  makeBridge,
  seedBestWorld,
  waitForBridge,
} from "./bridgeHelpers";

/**
 * Phone HUD regression: the score pill used to grow under the PAUSE button
 * (and hide the Time Attack timer) once a goal chip joined it. The HUD is
 * filled with its widest real content (5-digit score, W 10, a 5-digit BEST
 * goal, 60 s) and every piece is checked against PAUSE and the viewport.
 */

type Box = { x: number; y: number; width: number; height: number };

/** Stacks for world 10, level 5: (9 worlds x 5 levels + 4 levels) x 3. */
const STACKS_TO_W10_L5 = 147;

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const insideViewport = (box: Box, viewport: { width: number; height: number }) =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;

/** Registered after the fixture's localStorage.clear(), so it survives it. */
const seedBest = (page: Page, mode: "TIME_ATTACK" | "ZEN", score: number) =>
  page.addInitScript(
    ({ mode, score }) => {
      localStorage.setItem(
        "shape-stack-high-scores-v3",
        JSON.stringify({
          CLASSIC: [],
          ZEN: [],
          TIME_ATTACK: [],
          [mode]: [{ score, date: "1/1/2026" }],
        }),
      );
    },
    { mode, score },
  );

/** PERFECT stacks on a paused game, in one round trip. */
const stackMany = (page: Page, stacks: number) =>
  page.evaluate((count) => {
    for (let i = 0; i < count; i += 1) window.__GAME_TEST__?.forceStack(0.98);
  }, stacks);

const boxOf = async (page: Page, selector: string): Promise<Box> => {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no layout box`);
  return box;
};

/** Every HUD piece in the two always-visible rows, with its row's box. */
const hudPieces = (page: Page) =>
  page.evaluate(() => {
    const toBox = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return Array.from(document.querySelectorAll(".hud-primary, .hud-meta")).flatMap((row) => [
      { label: `${row.className}: ${row.textContent ?? ""}`, box: toBox(row), row: null },
      ...Array.from(row.children).map((piece) => ({
        label: `${piece.className}: ${piece.textContent ?? ""}`,
        box: toBox(piece),
        row: toBox(row),
      })),
    ]);
  });

/** Within its row (a chip pushed past the pill's edge is a hidden chip). */
const insideRow = (box: Box, row: Box) =>
  box.x >= row.x - 0.5 && box.x + box.width <= row.x + row.width + 0.5;

const expectHudClearOfPause = async (page: Page, viewport: { width: number; height: number }) => {
  const pause = await boxOf(page, ".pause-btn");
  expect(insideViewport(pause, viewport)).toBe(true);
  const pill = await boxOf(page, ".hud-primary");
  expect(intersects(pill, pause), "score pill overlaps PAUSE").toBe(false);
  for (const piece of await hudPieces(page)) {
    expect(insideViewport(piece.box, viewport), `${piece.label} is clipped`).toBe(true);
    expect(intersects(piece.box, pause), `${piece.label} overlaps PAUSE`).toBe(false);
    if (piece.row) expect(insideRow(piece.box, piece.row), `${piece.label} overflows`).toBe(true);
  }
};

const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
];

test.describe("HUD layout on phones", { tag: "@cross-browser" }, () => {
  test.beforeEach(({ browserName }) => {
    // WebKit in CI takes seconds per click.
    test.slow(browserName === "webkit");
  });

  for (const viewport of PHONES) {
    test(`Time Attack timer and goal stay clear of PAUSE at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await seedBest(page, "TIME_ATTACK", 99999);
      // Returning player: the timer keeps running past world 10's entry.
      await seedBestWorld(page, ALL_WORLDS_REACHED);
      await page.goto("/");
      await page.getByRole("radio", { name: "Time Attack mode" }).click();
      await page.click(".start-btn");
      await waitForBridge(page);
      const bridge = makeBridge(page);
      await bridge.pause();
      await stackMany(page, STACKS_TO_W10_L5);
      await bridge.setTimeRemaining(60);
      await bridge.step(0.001);

      // Widest real content: 5-digit score, a 5-digit goal, W 10, 60s.
      await expect(page.locator(".score")).toHaveText(/^\d{5}$/);
      await expect(page.getByTestId("pb-target")).toHaveText("BEST 99999");
      await expect(page.locator(".world-badge")).toHaveText("W 10");
      const timer = page.getByRole("timer");
      await expect(timer).toHaveText("60s");

      const timerBox = await boxOf(page, ".timer-badge");
      expect(insideViewport(timerBox, viewport), "timer is clipped").toBe(true);
      expect(intersects(timerBox, await boxOf(page, ".pause-btn")), "timer under PAUSE").toBe(
        false,
      );
      await expectHudClearOfPause(page, viewport);

      // Critical timer (red, pulsing) is still in the clear.
      await bridge.setTimeRemaining(9);
      await bridge.step(0.001);
      await expect(timer).toHaveClass(/critical/);
      await expectHudClearOfPause(page, viewport);
    });

    test(`Zen lives stay clear of PAUSE at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedBestWorld(page, ALL_WORLDS_REACHED);
      await page.goto("/");
      await page.getByRole("radio", { name: "Zen mode" }).click();
      await page.click(".start-btn");
      await waitForBridge(page);
      const bridge = makeBridge(page);
      await bridge.pause();
      await stackMany(page, STACKS_TO_W10_L5);

      await expect(page.locator(".score")).toHaveText(/^\d{5}$/);
      await expect(page.locator(".lives-badge")).toHaveText(/^LIVES \d+$/);
      const lives = await boxOf(page, ".lives-badge");
      expect(insideViewport(lives, viewport), "lives badge is clipped").toBe(true);
      expect(intersects(lives, await boxOf(page, ".pause-btn")), "lives under PAUSE").toBe(false);
      await expectHudClearOfPause(page, viewport);
    });
  }
});
