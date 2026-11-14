import { test, expect } from "./fixtures";
import { getMusicState, makeBridge, waitForBridge } from "./bridgeHelpers";
import { flipSetting, openSettings, settingSwitch, settingsDialog } from "./settingsHelpers";

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

  test("mute and music toggles in the pause menu silence the soundtrack", async ({
    page,
    browserName,
  }) => {
    // ~15 clicks through blurred overlays: software-rendered WebKit in CI
    // spends 2.5-5 s per click waiting for stable frames, past 30 s total.
    test.slow(browserName === "webkit", "slow overlay rendering on CI WebKit");
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    /** Pause menu -> settings sheet (the run stays paused underneath). */
    const openPauseSettings = async () => {
      await page.click(".pause-btn");
      await expect(page.locator(".pause-overlay")).toBeVisible();
      await openSettings(page);
    };
    /** First Escape closes only the sheet, the second one resumes. */
    const closeAndResume = async () => {
      await page.keyboard.press("Escape");
      await expect(settingsDialog(page)).toBeHidden();
      await expect(page.locator(".pause-overlay")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator(".pause-overlay")).toBeHidden();
    };

    const sound = settingSwitch(page, "Sound");
    await openPauseSettings();
    await flipSetting(page, "Sound");
    await expect(sound).toHaveAttribute("aria-checked", "false");
    await closeAndResume();
    expect((await getMusicState(page))?.playing).toBe(false);

    await openPauseSettings();
    await flipSetting(page, "Sound");
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await closeAndResume();
    expect((await getMusicState(page))?.playing).toBe(true);

    const music = settingSwitch(page, "Music");
    await openPauseSettings();
    await expect(music).toHaveAttribute("aria-checked", "true");
    await music.click();
    await expect(music).toHaveAttribute("aria-checked", "false");
    await closeAndResume();
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
    await openPauseSettings();
    await expect(music).toHaveAttribute("aria-checked", "false");
    await music.click();
    await expect(music).toHaveAttribute("aria-checked", "true");
    await closeAndResume();
    expect((await getMusicState(page))?.playing).toBe(true);
  });
});
