import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

test.describe("First-run hint", () => {
  test("guides a brand-new player until the first stack, without blocking taps", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    const hint = page.locator(".first-run-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("TAP WHEN IT FITS");

    // A real tap on top of the hint reaches the canvas (pointer-events: none).
    const box = await hint.boundingBox();
    if (!box) throw new Error("hint has no box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await bridge.getState())?.stackCount).toBe(1);
    await expect(hint).toHaveCount(0);
  });

  test("is not shown once a run has been played", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await expect(page.locator(".gameover-screen")).toBeVisible();

    await page.click(".retry-btn");
    await waitForBridge(page);
    await expect(page.locator(".first-run-hint")).toHaveCount(0);
  });
});
