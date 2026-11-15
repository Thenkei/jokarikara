import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

test.describe("Accessibility", () => {
  test("mode picker is a keyboard radio group", async ({ page }) => {
    await page.goto("/");
    const group = page.getByRole("radiogroup", { name: "Game mode" });
    const classic = group.getByRole("radio", { name: "Classic mode" });
    const zen = group.getByRole("radio", { name: "Zen mode" });
    const time = group.getByRole("radio", { name: "Time Attack mode" });

    await expect(classic).toHaveAttribute("aria-checked", "true");
    // Roving tabindex: only the selected radio is a tab stop.
    await expect(classic).toHaveAttribute("tabindex", "0");
    await expect(zen).toHaveAttribute("tabindex", "-1");

    await classic.focus();
    await page.keyboard.press("ArrowRight");
    await expect(zen).toHaveAttribute("aria-checked", "true");
    await expect(zen).toBeFocused();
    await expect(page.locator(".mode-description")).toContainText("lives");

    await page.keyboard.press("End");
    await expect(time).toBeFocused();
    await page.keyboard.press("ArrowRight"); // wraps around
    await expect(classic).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(time).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Home");
    await expect(classic).toBeFocused();
  });

  test("announces progression and the end of a run to screen readers", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    await expect(page.getByRole("img", { name: /Game board/ })).toBeVisible();

    const live = page.locator(".sr-only[aria-live='polite']");
    const bridge = makeBridge(page);
    await bridge.pause();
    for (let i = 0; i < 3; i += 1) await bridge.forceStack(0.9);
    await expect(live).toHaveText("Level 2");

    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);
    await expect(live).toContainText("Game over");
    await expect(live).toContainText("Score");
  });

  const loseClassicRun = async (page: import("@playwright/test").Page) => {
    await page.goto("/");
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98);
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);
    await expect(page.locator(".gameover-screen")).toBeVisible();
  };

  test("game over cards are a tab stop only when they scroll", async ({ page }) => {
    const body = page.getByRole("region", { name: "Run summary" });

    // Desktop: everything fits, so the summary is no dead stop before RETRY.
    await page.setViewportSize({ width: 1280, height: 900 });
    await loseClassicRun(page);
    await expect(body).not.toHaveAttribute("tabindex");

    // Small phone: the cards scroll, and the keyboard needs a stop to scroll them.
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(body).toHaveAttribute("tabindex", "0");
    await body.focus();
    await page.keyboard.press("End");
    await expect
      .poll(() => body.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    // Back to desktop: the stop goes away again.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(body).not.toHaveAttribute("tabindex");
  });
});
