import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

test.describe("World atlas", () => {
  test.beforeEach(async ({ page }) => {
    // Registered after the fixture's script (which clears storage), so this
    // seeds a player who has reached world 4.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "shape-stack-achievements-v1",
        JSON.stringify({ unlocked: {}, lifetime: { bestWorld: 4 } }),
      );
    });
  });

  test("lists reached worlds and keeps the others locked", async ({ page }) => {
    await page.goto("/");
    const entry = page.locator(".worlds-btn");
    await expect(entry).toHaveText("WORLDS 4/10");
    await expect(entry).toHaveAccessibleName("Worlds: 4 of 10 discovered");
    await entry.click();

    const atlas = page.getByRole("region", { name: "WORLDS" });
    await expect(atlas).toBeVisible();
    await expect(atlas.locator(".world-atlas-count")).toHaveText("4 / 10 DISCOVERED");
    await expect(atlas.getByRole("listitem")).toHaveCount(10);

    const wave = atlas.locator('.world-card[data-world="4"]');
    await expect(wave.locator(".world-card-name")).toHaveText("Wave");
    await expect(wave.locator(".world-card-howto")).not.toBeEmpty();

    const locked = atlas.locator('.world-card[data-world="5"]');
    await expect(locked).toHaveClass(/locked/);
    await expect(locked.locator(".world-card-name")).toHaveText("???");
    await expect(locked).toContainText("Reach world 5 to reveal");
    await expect(locked.getByRole("heading")).toHaveAccessibleName(/WORLD 5\s*, locked/);
    await expect(atlas).not.toContainText("Color Shift");
    await expect(locked.getByRole("button")).toHaveCount(0);
  });

  test("PRACTICE starts a Zen run in that world", async ({ page }) => {
    await page.goto("/");
    await page.locator(".worlds-btn").click();
    await page.getByRole("button", { name: "Practice world 4, Wave" }).click();

    await waitForBridge(page);
    await expect(page.locator(".world-up-name")).toHaveText("Wave");
    const bridge = makeBridge(page);
    await bridge.pause();
    const state = await bridge.getState();
    expect(state?.mode).toBe("ZEN");
    expect(state?.world).toBe(4);
    expect(state?.score).toBe(0);
  });

  test("opens and closes from the keyboard, returning focus to its entry", async ({
    page,
  }) => {
    await page.goto("/");
    const entry = page.locator(".worlds-btn");
    await entry.focus();
    await page.keyboard.press("Enter");

    const back = page.locator(".world-atlas-back-btn");
    await expect(back).toBeFocused();
    // Focusing BACK must not scroll the heading away on small screens.
    await expect(page.locator("#world-atlas-heading")).toBeInViewport();

    await page.keyboard.press("Escape");
    await expect(page.locator(".world-atlas-screen")).toHaveCount(0);
    await expect(page.locator(".start-btn")).toBeVisible();
    await expect(entry).toBeFocused();

    // BACK also closes it and hands focus back.
    await page.keyboard.press("Enter");
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(entry).toBeFocused();
  });
});
