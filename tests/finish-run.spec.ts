import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";
import { FINISH_CONFIRM_GUARD_MS } from "../src/modes/finishRun";

/**
 * Zen FINISH RUN (pause menu). Driven by keyboard (`locator.press`), not
 * clicks: WebKit in CI spends seconds per click, and the confirm step is
 * time-boxed. The bridge's manual mode freezes the real loop so the growing
 * shape can never overflow (and end the run) while the menus are driven.
 */

const HIGH_SCORES_KEY = "shape-stack-high-scores-v3";
const ACHIEVEMENTS_KEY = "shape-stack-achievements-v1";

const startZen = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("radio", { name: "Zen mode" }).press("Enter");
  await expect(page.getByRole("radio", { name: "Zen mode" })).toBeChecked();
};

const startRunAndStack = async (page: Page, stacks: number) => {
  await page.locator(".start-btn").press("Enter");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  for (let i = 0; i < stacks; i += 1) await bridge.forceStack(0.98);
  return bridge;
};

/** Escape opens the pause menu; FINISH RUN twice (past the double-press guard). */
const finishFromPauseMenu = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(page.locator(".pause-overlay")).toBeVisible();
  const finish = page.locator(".pause-finish-btn");
  await expect(finish).toHaveText("FINISH RUN");
  await finish.press("Enter");
  await expect(finish).toHaveText("TAP AGAIN TO FINISH");
  await expect(page.locator(".gameover-screen")).toBeHidden();
  await page.waitForTimeout(FINISH_CONFIRM_GUARD_MS + 100);
  await finish.press("Enter");
  await expect(page.locator(".gameover-screen")).toBeVisible();
};

test.describe("Zen FINISH RUN", () => {
  test("ends the session as a calm game over and keeps the score", async ({ page }) => {
    await startZen(page);
    const bridge = await startRunAndStack(page, 3);
    const score = (await bridge.getState())?.score ?? 0;
    expect(score).toBeGreaterThan(0);

    await finishFromPauseMenu(page);

    await expect(page.locator(".gameover-title")).toHaveText("SESSION COMPLETE");
    await expect(page.locator(".score-display")).toHaveText(`Score: ${score}`);
    await expect(page.locator(".stat-stacks")).toHaveText("3");
    const insight = page.locator(".end-insight");
    await expect(insight.locator(".end-insight-title")).toHaveText("Session complete.");
    await expect(insight).not.toHaveClass(/danger-signal/);
    await expect(page.locator(".end-insight-margin")).toHaveCount(0);
    await expect(page.locator(".quality-breakdown")).toBeVisible();
    await expect(page.locator(".new-best-badge")).toBeVisible();
    await expect(page.locator(".leaderboard li").first()).toContainText(String(score));
    await expect(page.locator(".sr-only[aria-live='polite']")).toHaveText(
      `Session complete. Score ${score}`,
    );

    // Saved to the Zen top 5: the start screen shows it as the Zen best.
    await page.locator(".gameover-actions .menu-btn").press("Enter");
    await expect(page.getByTestId("best-ZEN")).toHaveText(`BEST ${score}`);
    const record = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
      ACHIEVEMENTS_KEY,
    );
    // Counted once (game over commit; MAIN MENU afterwards is a no-op).
    expect(record.lifetime.runsPlayed).toBe(1);
    expect(record.lifetime.totalStacks).toBe(3);
  });

  test("a practice run finishes without saving a score", async ({ page }) => {
    // Registered after the fixture's script (which clears storage).
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ unlocked: {}, lifetime: { bestWorld: 3 } }));
    }, ACHIEVEMENTS_KEY);
    await startZen(page);
    await page.locator(".practice-next").press("Enter");
    await expect(page.locator(".practice-world")).toHaveText("START AT WORLD 2");
    await startRunAndStack(page, 1);

    await finishFromPauseMenu(page);

    await expect(page.locator(".practice-result-label")).toHaveText(
      "PRACTICE · FROM WORLD 2",
    );
    await expect(page.locator(".practice-summary")).toBeVisible();
    await expect(page.locator(".end-insight-title")).toHaveText("Session complete.");

    await page.locator(".gameover-actions .menu-btn").press("Enter");
    await expect(page.getByTestId("best-ZEN")).toHaveText("BEST --");
    const scores = await page.evaluate((key) => localStorage.getItem(key), HIGH_SCORES_KEY);
    expect(scores ?? "").not.toContain('"ZEN":[{');
  });

  test("Classic has no FINISH RUN: MAIN MENU still abandons", async ({ page }) => {
    await page.goto("/");
    await startRunAndStack(page, 1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    await expect(page.locator(".pause-finish-btn")).toHaveCount(0);
    await page.locator(".pause-menu-btn").press("Enter");
    await expect(page.locator(".title")).toHaveText("SHAPE STACK");
    await expect(page.getByTestId("best-CLASSIC")).toHaveText("BEST --");
  });
});
