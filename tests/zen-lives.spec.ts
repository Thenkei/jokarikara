import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

/** Zen lives come back after a clean run (src/modes/zenLives.ts). */
const REGEN_STACKS = 10;

test.describe("Zen life regeneration", { tag: "@cross-browser" }, () => {
  test("a clean run after a miss earns the life back, with a pop and an announcement", async ({
    page,
  }) => {
    await page.goto("/");
    const zen = page.getByRole("radio", { name: "Zen mode" });
    await zen.press("Enter");
    await expect(page.locator(".mode-description")).toHaveText(
      `10 lives, +1 every ${REGEN_STACKS} clean stacks. Undo anytime.`,
    );
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    const lives = page.locator(".lives-badge");

    // One miss: the shape outgrows its container.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);
    await expect(lives).toHaveText("LIVES 9");

    for (let i = 0; i < REGEN_STACKS - 1; i += 1) await bridge.forceStack(0.98);
    await expect(lives).toHaveText("LIVES 9");
    await expect(page.getByTestId("life-regain-pop")).toHaveCount(0);

    await bridge.forceStack(0.98);
    await expect(lives).toHaveText("LIVES 10");
    await expect(page.getByTestId("life-regain-pop")).toHaveText("+1 LIFE");
    await expect(page.locator(".sr-only[aria-live='polite']")).toContainText(
      "Life regained. 10 lives",
    );
  });
});
