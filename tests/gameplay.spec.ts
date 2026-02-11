import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

const stackOnce = async (
  bridge: ReturnType<typeof makeBridge>,
  sizeRatio: number = 0.6,
) => {
  let ok = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    ok = (await bridge.forceStack(sizeRatio)) ?? false;
    if (ok) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!ok) {
    throw new Error("Test bridge missing during forceStack.");
  }
};

const requireState = (
  state: Awaited<ReturnType<ReturnType<typeof makeBridge>["getState"]>>,
) => {
  if (!state) {
    throw new Error("Test bridge missing during getState.");
  }
  return state;
};

test.describe("Gameplay Deterministic", () => {
  test("classic: stacking increments score", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();
    await stackOnce(bridge);

    const state = requireState(await bridge.getState());
    expect(state.score).toBe(1);
    expect(state.level).toBe(1);
    expect(state.styleScore).toBeGreaterThan(0);
    expect(state.streak).toBe(1);
  });

  test("classic: level up after 3 stacks", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    for (let i = 0; i < 3; i += 1) {
      await stackOnce(bridge);
    }

    const state = requireState(await bridge.getState());
    expect(state.score).toBe(3);
    expect(state.level).toBe(2);
    expect(state.world).toBe(1);
  });

  test("classic: world up after 15 stacks", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    for (let i = 0; i < 15; i += 1) {
      await stackOnce(bridge);
    }

    const state = requireState(await bridge.getState());
    expect(state.score).toBe(15);
    expect(state.world).toBe(2);
    expect(state.level).toBe(1);
  });

  test("classic: oversized tap triggers game over", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    const state = requireState(await bridge.getState());
    await bridge.setActiveSize((state.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await bridge.step(0.016);

    await expect(page.locator(".gameover-screen")).toBeVisible();
  });

  test("time attack: timer reaching zero ends game", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("TIME")');
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);

    await expect(page.locator(".gameover-screen")).toBeVisible();
  });

  test("zen: miss resets size without game over", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("ZEN")');
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    const state = requireState(await bridge.getState());
    expect(state.zenLivesRemaining).toBe(10);
    await bridge.setActiveSize((state.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await bridge.step(0.016);

    const nextState = requireState(await bridge.getState());
    expect(nextState.isGameOver).toBe(false);
    expect(nextState.zenLivesRemaining).toBe(9);
    expect(nextState.activeSize ?? 0).toBeLessThan((state.lastSize ?? 1) * 0.1);
  });

  test("zen: early tap does not consume lives", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("ZEN")');
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    const state = requireState(await bridge.getState());
    expect(state.zenLivesRemaining).toBe(10);
    await bridge.setActiveSize((state.lastSize ?? 1) * 0.1);
    await bridge.tap();
    await bridge.step(0.016);

    const nextState = requireState(await bridge.getState());
    expect(nextState.isGameOver).toBe(false);
    expect(nextState.score).toBe(0);
    expect(nextState.zenLivesRemaining).toBe(10);
  });

  test("zen: run ends after 10 misses", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("ZEN")');
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    for (let lives = 10; lives > 0; lives -= 1) {
      const state = requireState(await bridge.getState());
      expect(state.zenLivesRemaining).toBe(lives);
      await bridge.setActiveSize((state.lastSize ?? 1) * 1.2);
      await bridge.tap();
      await bridge.step(0.016);
    }

    await expect(page.locator(".gameover-screen")).toBeVisible();
  });

  test("classic: style streak increases with consecutive stacks", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);

    const bridge = makeBridge(page);
    await bridge.pause();

    await stackOnce(bridge, 0.95);
    await stackOnce(bridge, 0.97);

    const state = requireState(await bridge.getState());
    expect(state.score).toBe(2);
    expect(state.streak).toBe(2);
    expect(state.styleScore).toBeGreaterThan(0);
    expect(state.lastStackQuality).not.toBeNull();
  });

  test("reduced fx toggle persists between runs", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);

    const fxToggle = page.locator(".fx-toggle-btn");
    await expect(fxToggle).toHaveText("FX: FULL");
    await fxToggle.click();
    await expect(fxToggle).toHaveText("FX: LOW");

    const stored = await page.evaluate(() =>
      window.localStorage.getItem("shape-stack-settings"),
    );
    expect(stored).toContain('"reducedFx":true');

    const bridge = makeBridge(page);
    await bridge.pause();
    const state = requireState(await bridge.getState());
    await bridge.setActiveSize((state.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await bridge.step(0.016);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    await page.click(".retry-btn");
    await waitForBridge(page);
    await expect(page.locator(".fx-toggle-btn")).toHaveText("FX: LOW");
  });
});
