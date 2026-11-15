import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

/**
 * Pinch zoom stays allowed by the viewport (WCAG 1.4.4), but not during live
 * play: a two-finger touch on the HUD used to zoom the page mid-run. The
 * whole game screen opts out of browser gestures while a run is live and
 * opts back in while paused.
 */
const touchAction = (page: import("@playwright/test").Page) =>
  page.locator(".game-screen").evaluate((el) => getComputedStyle(el).touchAction);

test.describe("Browser touch gestures", { tag: "@cross-browser" }, () => {
  test("are off during live play and back while paused", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".game-container")).not.toHaveCSS("touch-action", "none");
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    await makeBridge(page).pause();

    expect(await touchAction(page)).toBe("none");

    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    expect(await touchAction(page)).not.toBe("none");
  });
});
