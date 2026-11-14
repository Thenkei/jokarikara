import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

const GAME_URL = "https://thenkei.github.io/jokarikara/";

test.describe("Share any run", () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      // Force the clipboard path even on platforms exposing Web Share.
      Object.defineProperty(navigator, "share", { value: undefined });
    });
  });

  test("copies a Classic result with score, bar and URL", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98); // PERFECT
    await bridge.forceStack(0.93); // GREAT

    // Let the shape outgrow its container: the run ends without a tap.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    const score = (await page.locator(".score-display").textContent())?.match(/\d+/)?.[0];
    expect(score).toBeTruthy();

    // Keyboard reachable, with an accessible name.
    const share = page.getByRole("button", { name: "SHARE RESULT" });
    await share.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".share-status")).toHaveText("Copied to clipboard");

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const lines = copied.split("\n");
    expect(lines[0]).toBe("Shape Stack · Classic");
    expect(lines[1]).toMatch(new RegExp(`^${score} pts · 2 stacks · W1 L1`));
    expect(lines[2]).toBe("🟨🟩");
    expect(lines[3]).toBe(GAME_URL);
    expect(copied).not.toMatch(/undefined|NaN/);
  });

  test("copies a Time Attack result with no stacks", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("TIME")');
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    await page.click(".share-btn");
    await expect(page.locator(".share-status")).toHaveText("Copied to clipboard");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`Shape Stack · Time Attack\n0 pts · 0 stacks · W1 L1\n${GAME_URL}`);
  });
});
