import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";
import type { Page } from "@playwright/test";

/** Stack straight to the first stack of `world` (15 stacks per world). */
const reachWorld = async (page: Page, world: number) =>
  page.evaluate((target) => {
    const b = window.__GAME_TEST__!;
    b.pause();
    for (let i = 0; i < (target - 1) * 15; i += 1) b.forceStack(0.9);
    return b.getState();
  }, world);

const start = async (page: Page, mode: "CLASSIC" | "ZEN" = "CLASSIC") => {
  await page.goto("/");
  if (mode === "ZEN") await page.click('button:has-text("ZEN")');
  await page.click(".start-btn");
  await waitForBridge(page);
};

test.describe("Reverse Stack (world 9)", () => {
  test("introduces the rule and stacks outward", async ({ page }) => {
    await start(page);
    const state = await reachWorld(page, 9);
    expect(state.world).toBe(9);
    await expect(page.locator(".world-up-name")).toHaveText("Reverse Stack");
    await expect(page.locator(".world-up-tagline")).toContainText("Grow outward");

    const bridge = makeBridge(page);
    const last = state.lastSize ?? 1;
    // The seed is a circle; a shape 2% larger wraps it tightly.
    await bridge.forceStack(0.98);
    const after = await bridge.getState();
    expect(after?.stackCount).toBe(state.stackCount + 1);
    expect(after?.lastStackQuality).toBe("PERFECT");
    expect(after?.lastSize ?? 0).toBeGreaterThan(last);
  });

  test("crossing the arena ends a Classic run", async ({ page }) => {
    await start(page);
    const state = await reachWorld(page, 9);
    const bridge = makeBridge(page);
    await bridge.setActiveSize((state.lastSize ?? 1) * 6);
    await bridge.step(0.016);
    // The game over screen follows the end effects, played by real frames.
    await bridge.resume();
    await expect(page.locator(".gameover-screen")).toBeVisible();
  });

  test("a tap that cannot wrap the last shape yet is ignored in Zen", async ({
    page,
  }) => {
    await start(page, "ZEN");
    const state = await reachWorld(page, 9);
    const bridge = makeBridge(page);
    await bridge.setActiveSize((state.lastSize ?? 1) * 0.8);
    await bridge.tap();
    const after = await bridge.getState();
    expect(after?.zenLivesRemaining).toBe(state.zenLivesRemaining);
    expect(after?.stackCount).toBe(state.stackCount);
  });
});

test.describe("Heartbeat (world 10)", () => {
  test("introduces the beat rule", async ({ page }) => {
    await start(page);
    const state = await reachWorld(page, 10);
    expect(state.world).toBe(10);
    await expect(page.locator(".world-up-name")).toHaveText("Heartbeat");
    await expect(page.locator(".world-up-tagline")).toContainText("beat");
  });
});
