import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

const PERFECT_RATIO = 0.98;

const failRun = async (bridge: ReturnType<typeof makeBridge>) => {
  const state = await bridge.getState();
  await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
  await bridge.tap();
  await bridge.step(0.016);
};

test.describe("Achievements", () => {
  test("shows a live, non-blocking toast and lists the unlock after the run", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".achievements-btn")).toHaveText("ACHIEVEMENTS 0/13");

    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    await bridge.forceStack(PERFECT_RATIO);
    const toast = page.locator(".achievement-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText("ACHIEVEMENT · First Stack");
    await expect(page.locator(".achievement-toast-region")).toHaveCSS(
      "pointer-events",
      "none",
    );

    // A real tap on the toast's position reaches the canvas underneath.
    const box = await toast.boundingBox();
    expect(box).not.toBeNull();
    const before = (await bridge.getState())?.stackCount ?? 0;
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect
      .poll(async () => {
        const state = await bridge.getState();
        return (state?.stackCount ?? 0) > before || state?.isGameOver === true;
      })
      .toBe(true);

    if (!(await bridge.getState())?.isGameOver) await failRun(bridge);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.locator(".run-achievements")).toContainText("First Stack");

    await page.click(".gameover-screen .menu-btn");
    await expect(page.locator(".achievements-btn")).toHaveText("ACHIEVEMENTS 1/13");
  });

  test("panel reflects live unlocks, including Perfect Alignment", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    // 10 PERFECT in a row; stack 5 is a boss shape.
    for (let i = 0; i < 10; i += 1) {
      await bridge.forceStack(PERFECT_RATIO);
    }
    expect((await bridge.getState())?.perfectCount).toBe(10);

    // Leave mid-run: the run still counts towards lifetime stats.
    await page.click(".pause-btn");
    await page.click(".pause-menu-btn");

    await expect(page.locator(".achievements-btn")).toHaveText("ACHIEVEMENTS 3/13");
    await page.click(".achievements-btn");

    const panel = page.locator(".achievements-screen");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".achievements-count")).toHaveText("3 / 13 UNLOCKED");
    await expect(panel.locator(".achievement-item")).toHaveCount(13);
    await expect(panel.locator(".achievement-item.unlocked")).toHaveCount(3);
    for (const id of ["first-stack", "giant-slayer", "perfect-alignment"]) {
      await expect(
        panel.locator(`.achievement-item[data-achievement-id="${id}"]`),
      ).toHaveClass(/unlocked/);
    }
    await expect(
      panel.locator('[data-achievement-id="architect"] .achievement-progress'),
    ).toHaveText("10/1000");

    await page.keyboard.press("Escape");
    await expect(page.locator(".title")).toHaveText("SHAPE STACK");
    await page.click(".achievements-btn");
    await page.click(".achievements-back-btn");
    await expect(page.locator(".start-btn")).toBeVisible();
  });

  test("unlock toasts never cover RETRY on a small game over screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    // Several unlocks (First Stack, Giant Slayer, Perfect Alignment...) queue
    // toasts that are still showing when the run ends.
    for (let i = 0; i < 12; i += 1) await bridge.forceStack(PERFECT_RATIO);
    await failRun(bridge);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.locator(".run-achievements li").first()).toBeVisible();
    await expect(page.locator(".achievement-toast")).toBeVisible();

    const retry = page.locator(".retry-btn");
    await expect(retry).toBeInViewport({ ratio: 1 });
    const hit = await retry.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return top === button || button.contains(top);
    });
    expect(hit).toBe(true);
  });
});
