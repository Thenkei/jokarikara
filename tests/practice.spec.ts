import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

test.describe("Zen practice from a reached world", () => {
  test.beforeEach(async ({ page }) => {
    // Registered after the fixture's script (which clears storage), so this
    // seeds a player who has already reached world 9.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "shape-stack-achievements-v1",
        JSON.stringify({ unlocked: {}, lifetime: { bestWorld: 9 } }),
      );
    });
  });

  test("the picker only appears in Zen and is capped at the best world", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".practice-picker")).toHaveCount(0);

    await page.click('button:has-text("ZEN")');
    const label = page.locator(".practice-world");
    await expect(label).toHaveText("START AT WORLD 1");
    await expect(page.locator(".practice-prev")).toBeDisabled();

    for (let i = 0; i < 12; i += 1) {
      if (await page.locator(".practice-next").isDisabled()) break;
      await page.click(".practice-next");
    }
    await expect(label).toHaveText("START AT WORLD 9");
    await expect(page.locator(".practice-name")).toContainText("Reverse Stack");
    await expect(page.locator(".practice-next")).toBeDisabled();
  });

  test("a practice run starts in that world and stays off the leaderboard", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click('button:has-text("ZEN")');
    for (let i = 0; i < 8; i += 1) await page.click(".practice-next");
    await page.click(".start-btn");
    await waitForBridge(page);

    await expect(page.locator(".world-up-name")).toHaveText("Reverse Stack");
    const bridge = makeBridge(page);
    await bridge.pause();
    const state = await bridge.getState();
    expect(state?.world).toBe(9);
    expect(state?.stackCount).toBe(120);
    expect(state?.score).toBe(0);

    // Spend the 10 Zen lives on taps outside the arena.
    for (let i = 0; i < 10; i += 1) {
      const s = await bridge.getState();
      await bridge.setActiveSize((s?.lastSize ?? 1) * 6);
      await bridge.tap();
      await bridge.step(0.016);
    }

    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.locator(".practice-result-label")).toHaveText(
      "PRACTICE · FROM WORLD 9",
    );
    await expect(page.locator(".practice-summary")).toBeVisible();
    await expect(page.locator(".stat-stacks")).toHaveText("0");

    const stored = await page.evaluate(() => ({
      scores: window.localStorage.getItem("shape-stack-high-scores-v3"),
      record: JSON.parse(
        window.localStorage.getItem("shape-stack-achievements-v1") ?? "{}",
      ),
    }));
    expect(stored.scores ?? "").not.toContain('"ZEN":[{');
    expect(stored.record.lifetime.runsPlayed ?? 0).toBe(0);
    expect(stored.record.lifetime.bestWorld).toBe(9);
  });
});
