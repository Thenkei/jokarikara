import { test, expect } from "./fixtures";
import {
  ALL_WORLDS_REACHED,
  makeBridge,
  seedBestWorld,
  waitForBridge,
} from "./bridgeHelpers";
import {
  PHONES,
  STACKS_TO_W10_L5,
  boxOf,
  expectHudClearOfPause,
  insideViewport,
  intersects,
  seedBest,
  stackMany,
} from "./layoutHelpers";

/**
 * Phone HUD regression: the score pill used to grow under the PAUSE button
 * (and hide the Time Attack timer) once a goal chip joined it. The HUD is
 * filled with its widest real content (5-digit score, W 10, a 5-digit BEST
 * goal, 60 s) and every piece is checked against PAUSE and the viewport.
 */

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
