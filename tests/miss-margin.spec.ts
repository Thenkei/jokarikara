import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

/**
 * Miss margins: how far a missed tap was off, from the pure core
 * (`getMissMargin`) to the game over insight, the mid-run MISS pop and the
 * live region. Driven through the bridge (paused + stepped), keyboard only.
 */

/** Factor applied to the container size to force a deterministic overflow. */
const OVERSIZE = 1.08;

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
 * Grow the shape past its container and let one tiny frame detect it. Returns
 * the core's margin, read in the same task: a Classic game over unmounts the
 * canvas (and the bridge) right after.
 */
const forceOverflow = (page: Page) =>
  page.evaluate((oversize) => {
    const game = window.__GAME_TEST__;
    const lastSize = game?.getState().lastSize ?? 0;
    if (!game || lastSize <= 0) return undefined;
    game.setActiveSize(lastSize * oversize);
    // 1 ms: growth within the frame is negligible next to the overshoot.
    game.step(0.001);
    return game.getState().lastMissMargin;
  }, OVERSIZE);

/** Whole percent the UI must show for the core's margin, kept off .5 edges. */
const expectedPercent = (margin: Awaited<ReturnType<typeof forceOverflow>>) => {
  expect(margin?.kind).toBe("late");
  const fraction = margin && margin.kind === "late" ? margin.fraction : NaN;
  // At least the forced 8 % (polygon rotations can only lower the fit size).
  expect(fraction).toBeGreaterThan(0.07);
  const percent = fraction * 100;
  // Far from a rounding boundary, so the expectation is not a coin flip.
  expect(Math.abs(percent - Math.floor(percent) - 0.5)).toBeGreaterThan(0.05);
  return Math.round(percent);
};

test.describe("Miss margin", () => {
  test("the game over insight says how late the shape was", async ({ page }) => {
    await startRun(page);
    const percent = expectedPercent(await forceOverflow(page));

    const insight = page.locator(".end-insight");
    await expect(insight).toBeVisible();
    await expect(insight).toHaveClass(/danger-signal/);
    await expect(insight.locator(".end-insight-margin")).toHaveText(
      `Too late by ${percent} %`,
    );
    await expect(insight.locator(".end-insight-title")).toHaveText(
      "Too late: the shape crossed the edge.",
    );
    const live = page.locator(".sr-only[aria-live='polite']");
    await expect(live).toContainText(`Game over. Too late by ${percent} %`);
  });

  test("Zen shows the margin next to MISS and keeps going", async ({ page }) => {
    const bridge = await startRun(page, "ZEN");
    const lives = (await bridge.getState())?.zenLivesRemaining ?? 0;
    const percent = expectedPercent(await forceOverflow(page));

    expect((await bridge.getState())?.zenLivesRemaining).toBe(lives - 1);
    const pop = page.getByTestId("miss-pop");
    await expect(pop.locator(".miss-pop-title")).toHaveText("MISS");
    await expect(pop.locator(".miss-pop-margin")).toHaveText(`+${percent} %`);
    await expect(page.locator(".sr-only[aria-live='polite']")).toHaveText(
      `Miss. Too late by ${percent} %`,
    );
    await expect(page.locator(".gameover-screen")).toHaveCount(0);
  });

  test("a natural overflow is late by a hair", async ({ page }) => {
    const bridge = await startRun(page, "ZEN");
    const lives = (await bridge.getState())?.zenLivesRemaining ?? 0;
    // Real 60 Hz frames until the shape crosses the edge on its own (one
    // evaluate: thousands of round trips would be slow on loaded machines).
    await page.evaluate((startLives) => {
      const game = window.__GAME_TEST__;
      for (
        let frame = 0;
        game && frame < 3000 && game.getState().zenLivesRemaining === startLives;
        frame += 1
      ) {
        game.step(1 / 60);
      }
    }, lives);
    expect((await bridge.getState())?.zenLivesRemaining).toBe(lives - 1);
    const margin = (await bridge.getState())?.lastMissMargin;
    expect(margin?.kind).toBe("late");
    // One frame of growth is far below 1 % of the container.
    expect(margin && margin.kind === "late" ? margin.fraction : 1).toBeLessThan(0.01);
    await expect(page.getByTestId("miss-pop").locator(".miss-pop-margin")).toHaveText(
      "BY A HAIR",
    );
  });
});
