import { test, expect } from "./fixtures";
import { getMusicState, makeBridge, waitForBridge } from "./bridgeHelpers";

// The soundtrack itself is inaudible to a test, so these assert on the audio
// service's reconciled state: `playing` means oscillators and scheduler are
// live, anything else means the graph has been torn down.

test.describe("Dynamic soundtrack", () => {
  test("follows the streak and stops on game over", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => getMusicState(page)).toMatchObject({ active: false });

    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    await expect
      .poll(() => getMusicState(page))
      .toMatchObject({ active: true, playing: true, intensity: 0, world: 1 });

    for (let i = 0; i < 3; i += 1) await bridge.forceStack(0.95);
    expect(await getMusicState(page)).toMatchObject({ intensity: 1, playing: true });

    for (let i = 0; i < 3; i += 1) await bridge.forceStack(0.95);
    expect((await getMusicState(page))?.intensity).toBe(2);

    // Miss: the run ends, music is released immediately.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await expect(page.locator(".gameover-screen")).toBeVisible();
    expect(await getMusicState(page)).toMatchObject({ active: false, playing: false });

    // A new run starts back on the drone.
    await page.click(".retry-btn");
    await waitForBridge(page);
    await expect
      .poll(() => getMusicState(page))
      .toMatchObject({ active: true, playing: true, intensity: 0 });
  });

  test("pauses with the overlay and on focus loss", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    await expect.poll(async () => (await getMusicState(page))?.playing).toBe(true);

    await page.click(".pause-btn");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    expect(await getMusicState(page)).toMatchObject({ paused: true, playing: false });

    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeHidden();
    expect(await getMusicState(page)).toMatchObject({ paused: false, playing: true });

    // Auto-pause (tab hidden / window blur) pauses the music too.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator(".pause-overlay")).toBeVisible();
    expect(await getMusicState(page)).toMatchObject({ paused: true, playing: false });

    await page.click(".pause-menu-btn");
    await expect(page.locator(".start-screen")).toBeVisible();
    expect(await getMusicState(page)).toMatchObject({ active: false, playing: false });
  });

  test("mute and music toggles silence the soundtrack mid-run", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.95); // reveals the secondary HUD

    const mute = page.locator(".mute-toggle-btn");
    await mute.click();
    await expect(mute).toHaveText("SOUND: OFF");
    expect((await getMusicState(page))?.playing).toBe(false);
    await mute.click();
    await expect(mute).toHaveText("SOUND: ON");
    expect((await getMusicState(page))?.playing).toBe(true);

    const music = page.locator(".music-toggle-btn");
    await expect(music).toHaveText("MUSIC: ON");
    await music.click();
    await expect(music).toHaveText("MUSIC: OFF");
    expect(await getMusicState(page)).toMatchObject({ enabled: false, playing: false });
    expect(
      await page.evaluate(() => window.localStorage.getItem("shape-stack-settings")),
    ).toContain('"music":false');

    // Preference survives a new run.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await page.click(".retry-btn");
    await waitForBridge(page);
    expect(await getMusicState(page)).toMatchObject({ active: true, playing: false });
    await makeBridge(page).pause();
    await makeBridge(page).forceStack(0.95);
    await expect(page.locator(".music-toggle-btn")).toHaveText("MUSIC: OFF");
    await page.locator(".music-toggle-btn").click();
    expect((await getMusicState(page))?.playing).toBe(true);
  });
});
