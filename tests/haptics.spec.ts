import { test, expect } from "./fixtures";
import { waitForBridge } from "./bridgeHelpers";

test.describe("Haptics setting", () => {
  test.beforeEach(async ({ page }) => {
    // Count vibrations regardless of the engine's own support.
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      (window as unknown as { __VIBRATIONS__: unknown[] }).__VIBRATIONS__ = calls;
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value: (pattern: unknown) => {
          calls.push(pattern);
          return true;
        },
      });
    });
  });

  const vibrations = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () => (window as unknown as { __VIBRATIONS__: unknown[] }).__VIBRATIONS__.length,
    );

  test("turning haptics off persists and silences vibration", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator(".start-screen .haptics-toggle-btn");
    await expect(toggle).toHaveText("HAPTICS: ON");

    await toggle.click();
    await expect(toggle).toHaveText("HAPTICS: OFF");
    expect(
      await page.evaluate(() => localStorage.getItem("shape-stack-settings")),
    ).toContain('"haptics":false');

    await page.click(".start-btn");
    await waitForBridge(page);
    const before = await vibrations(page);
    await page.keyboard.press("Space"); // real tap path -> would vibrate
    await expect
      .poll(() => page.evaluate(() => window.__GAME_TEST__?.getState().stackCount))
      .toBe(1);
    expect(await vibrations(page)).toBe(before);
  });

  test("with haptics on, a stack vibrates", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const before = await vibrations(page);
    await page.keyboard.press("Space");
    await expect.poll(() => vibrations(page)).toBeGreaterThan(before);
  });
});
