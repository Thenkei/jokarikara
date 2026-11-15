import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";
import type { GameTestBridgeState } from "../src/utils/testBridge";

/**
 * Miss margins: how far a miss was off, from the pure core (`getMissMargin`)
 * to the game over insight, the mid-run MISS pop and the live region. Driven
 * through the bridge (paused + stepped), keyboard only.
 *
 * - Untapped overflow: time since PERFECT opened ("Late by 0.4 s").
 * - A tap that does not fit: size overshoot vs the largest fit ("+8 %").
 */

type Margin = GameTestBridgeState["lastMissMargin"];

/** Factor applied to the container size for a tap that cannot fit. */
const OVERSIZE = 1.08;
/** Start just below the PERFECT band (97 %) so the run crosses it. */
const BELOW_BAND = 0.95;

const startRun = async (page: Page, mode?: "ZEN") => {
  await page.goto("/");
  if (mode) await page.locator(`.mode-btn:has-text("${mode}")`).press("Enter");
  await page.locator(".start-btn").press("Enter");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  return bridge;
};

/**
 * Let the shape grow on its own at 60 Hz until it crosses the edge (one
 * evaluate: thousands of round trips would be slow). Returns the core's
 * margin read in the same task: a Classic game over unmounts the canvas (and
 * the bridge) right after.
 */
const growUntilOverflow = (page: Page) =>
  page.evaluate((belowBand) => {
    const game = window.__GAME_TEST__;
    const start = game?.getState();
    if (!game || !start?.lastSize) return undefined;
    game.setActiveSize(start.lastSize * belowBand);
    const missed = () => {
      const now = game.getState();
      return now.isGameOver || now.zenLivesRemaining !== start.zenLivesRemaining;
    };
    for (let frame = 0; frame < 3000 && !missed(); frame += 1) game.step(1 / 60);
    return game.getState().lastMissMargin;
  }, BELOW_BAND);

/** A tap while the shape is past the edge (a corner out). */
const tapOversized = (page: Page) =>
  page.evaluate((oversize) => {
    const game = window.__GAME_TEST__;
    const lastSize = game?.getState().lastSize ?? 0;
    if (!game || lastSize <= 0) return undefined;
    game.setActiveSize(lastSize * oversize);
    game.tap();
    return game.getState().lastMissMargin;
  }, OVERSIZE);

/** Tenths the UI must show for a time margin, kept off rounding edges. */
const expectedTenths = (margin: Margin | undefined) => {
  expect(margin?.kind).toBe("lateTime");
  const seconds = margin?.kind === "lateTime" ? margin.seconds : NaN;
  expect(seconds).toBeGreaterThan(0.05);
  const tenths = seconds * 10;
  expect(Math.abs(tenths - Math.floor(tenths) - 0.5)).toBeGreaterThan(0.02);
  const rounded = Math.max(1, Math.round(tenths));
  return `${Math.floor(rounded / 10)}.${rounded % 10}`;
};

/** Whole percent the UI must show for a size margin, kept off .5 edges. */
const expectedPercent = (margin: Margin | undefined) => {
  expect(margin?.kind).toBe("late");
  const fraction = margin?.kind === "late" ? margin.fraction : NaN;
  // At least the forced 8 % (polygon rotations can only lower the fit size).
  expect(fraction).toBeGreaterThan(0.07);
  const percent = fraction * 100;
  expect(Math.abs(percent - Math.floor(percent) - 0.5)).toBeGreaterThan(0.05);
  return Math.round(percent);
};

const liveRegion = (page: Page) => page.locator(".sr-only[aria-live='polite']");

test.describe("Miss margin", () => {
  test("an untapped overflow says how long PERFECT was open", async ({ page }) => {
    await startRun(page);
    const seconds = expectedTenths(await growUntilOverflow(page));

    const insight = page.locator(".end-insight");
    await expect(insight).toBeVisible();
    await expect(insight).toHaveClass(/danger-signal/);
    await expect(insight.locator(".end-insight-margin")).toHaveText(`Late by ${seconds} s`);
    await expect(insight.locator(".end-insight-hint")).toHaveText(
      `PERFECT opened ${seconds} s before the edge.`,
    );
    // No repeated "Too late:" under a margin headline.
    await expect(insight.locator(".end-insight-title")).toHaveText(
      "The shape crossed the edge.",
    );
    await expect(liveRegion(page)).toContainText(`Game over. Late by ${seconds} s`);
  });

  test("a tap with the shape past the edge says how far, in %", async ({ page }) => {
    await startRun(page);
    const percent = expectedPercent(await tapOversized(page));

    const insight = page.locator(".end-insight");
    await expect(insight.locator(".end-insight-margin")).toHaveText(
      `Too late by ${percent} %`,
    );
    await expect(insight.locator(".end-insight-hint")).toHaveCount(0);
    await expect(insight.locator(".end-insight-title")).toHaveText("That tap didn't fit.");
  });

  test("Zen shows LATE next to MISS for an overflow and keeps going", async ({ page }) => {
    const bridge = await startRun(page, "ZEN");
    const lives = (await bridge.getState())?.zenLivesRemaining ?? 0;
    const seconds = expectedTenths(await growUntilOverflow(page));

    expect((await bridge.getState())?.zenLivesRemaining).toBe(lives - 1);
    const pop = page.getByTestId("miss-pop");
    await expect(pop.locator(".miss-pop-title")).toHaveText("MISS");
    await expect(pop.locator(".miss-pop-margin")).toHaveText(`LATE ${seconds} s`);
    await expect(liveRegion(page)).toHaveText(`Miss. Late by ${seconds} s`);
    await expect(page.locator(".gameover-screen")).toHaveCount(0);
  });

  test("Zen shows the size overshoot for a tap that does not fit", async ({ page }) => {
    await startRun(page, "ZEN");
    const percent = expectedPercent(await tapOversized(page));

    await expect(page.getByTestId("miss-pop").locator(".miss-pop-margin")).toHaveText(
      `+${percent} %`,
    );
    await expect(liveRegion(page)).toHaveText(`Miss. Too late by ${percent} %`);
  });
});
