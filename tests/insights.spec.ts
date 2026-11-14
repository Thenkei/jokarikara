import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

test.describe("Game over insights", () => {
  test("explains an overflow and breaks down stack quality", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98); // PERFECT
    await bridge.forceStack(0.93); // GREAT
    await bridge.forceStack(0.5); // OK

    // Let the shape outgrow its container: an auto-fail, not a tap.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.locator(".end-insight-title")).toContainText("Too late");
    const legend = page.locator(".quality-breakdown-legend");
    await expect(legend).toContainText("PERFECT 1");
    await expect(legend).toContainText("GREAT 1");
    await expect(legend).toContainText("GOOD 0");
    await expect(legend).toContainText("OK 1");
  });

  test("explains a Time Attack run that ran out of time", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("TIME")');
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);

    await expect(page.locator(".end-insight-title")).toHaveText("Out of time.");
    // No stack was made: no breakdown to show.
    await expect(page.locator(".quality-breakdown")).toHaveCount(0);
  });
});
