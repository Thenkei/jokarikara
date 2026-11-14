import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

// These tests run against the real rAF loop (no bridge manual stepping) so
// they exercise the player-facing pause, not the test-only `bridge.pause()`.

test.describe("Pause and keyboard", () => {
  test("pause freezes growth and ignores taps; resume restores play", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);

    await page.click(".pause-btn");
    await expect(page.locator(".pause-overlay")).toBeVisible();

    const frozen = await bridge.getState();
    expect(frozen?.paused).toBe(true);

    await page.waitForTimeout(400);
    const later = await bridge.getState();
    expect(later?.activeSize).toBe(frozen?.activeSize);

    // Taps must not stack while paused. (Keyboard Space is not tested here:
    // focus sits on RESUME, so Space would activate that button instead.)
    await bridge.tap();
    expect((await bridge.getState())?.stackCount).toBe(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeHidden();
    expect((await bridge.getState())?.paused).toBe(false);
    await expect(page.locator(".gameover-screen")).toBeHidden();
  });

  test("time attack timer does not run while paused", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("TIME")');
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);

    await page.keyboard.press("p");
    await expect(page.locator(".pause-overlay")).toBeVisible();

    const before = (await bridge.getState())?.timeRemaining;
    await page.waitForTimeout(600);
    expect((await bridge.getState())?.timeRemaining).toBe(before);
  });

  test("pause menu: restart starts a fresh run, main menu leaves", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);

    // Freeze the real rAF loop first: on slow runners the growing shape can
    // reach the container (auto-fail -> game over) before the next click
    // lands. Keyboard taps call handleTap directly, so Space still stacks.
    await bridge.pause();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await bridge.getState())?.stackCount).toBe(1);

    await page.click(".pause-btn");
    await page.click(".pause-restart-btn");
    await expect(page.locator(".pause-overlay")).toBeHidden();
    // Restart remounts the canvas and reinstalls the bridge in real-time mode.
    await waitForBridge(page);
    await bridge.pause();
    await expect.poll(async () => (await bridge.getState())?.stackCount).toBe(0);

    await page.click(".pause-btn");
    await page.click(".pause-menu-btn");
    await expect(page.locator(".title")).toHaveText("SHAPE STACK");
  });

  test("Enter starts a run from the start screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".start-btn")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".score")).toBeVisible();
  });
});
