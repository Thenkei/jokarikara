import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { clearCueCalls, getCueCalls, makeBridge, waitForBridge } from "./bridgeHelpers";
import {
  closeSettings,
  flipSetting,
  openSettings,
  settingSwitch,
} from "./settingsHelpers";

/**
 * Timing cue: the ticks are inaudible to a test, so these assert on the calls
 * the audio service receives (recorded by the E2E audio bridge) while the
 * active shape is walked towards the PERFECT band with the bridge's manual
 * stepping (deterministic, no wall-clock waits).
 */

const seedSettings = (page: Page, settings: Record<string, unknown>) =>
  // Registered after the fixture's own init script (which clears storage).
  page.addInitScript((value) => {
    localStorage.setItem("shape-stack-settings", JSON.stringify(value));
  }, settings);

/** Start a run, freeze the loop and forget any cue played so far. */
const startPaused = async (page: Page) => {
  await page.click(".start-btn");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  await clearCueCalls(page);
  return bridge;
};

/**
 * Grow the active shape from `from` to `to` (× the container) over `seconds`
 * of game time in 50 ms steps, inside one evaluate to keep it fast.
 */
const walk = (page: Page, from: number, to: number, seconds: number) =>
  page.evaluate(
    ({ from, to, seconds }) => {
      const bridge = window.__GAME_TEST__!;
      const last = bridge.getState().lastSize ?? 1;
      const dt = 0.05;
      const frames = Math.round(seconds / dt);
      for (let i = 0; i <= frames; i += 1) {
        bridge.setActiveSize(last * (from + ((to - from) * i) / frames));
        bridge.step(dt);
      }
    },
    { from, to, seconds },
  );

test.describe("Timing cue setting", () => {
  test("is off by default and toggles from the start screen", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    const toggle = settingSwitch(page, "Timing cue");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await clearCueCalls(page);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(
      await page.evaluate(() => localStorage.getItem("shape-stack-settings")),
    ).toContain('"timingCue":true');
    // Turning it on previews the PERFECT tick.
    expect(await getCueCalls(page)).toEqual([
      expect.objectContaining({ inWindow: true }),
    ]);
    await closeSettings(page);
  });

  test("with the setting on, ticks speed up and land on the PERFECT tick", async ({
    page,
  }) => {
    await seedSettings(page, { timingCue: true });
    await page.goto("/");
    await openSettings(page);
    await expect(settingSwitch(page, "Timing cue")).toHaveAttribute("aria-checked", "true");
    await closeSettings(page);
    const bridge = await startPaused(page);

    // Far from the band: silent.
    await walk(page, 0.2, 0.4, 0.5);
    expect(await getCueCalls(page)).toEqual([]);

    // Approach: several soft ticks, pitch never falling, none "in window".
    await walk(page, 0.6, 0.95, 3);
    const approach = await getCueCalls(page);
    expect(approach.length).toBeGreaterThan(5);
    expect(approach.every((call) => !call.inWindow)).toBe(true);
    const steps = approach.map((call) => call.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps.at(-1)!).toBeGreaterThan(steps[0]);

    // Inside the PERFECT band: the bright tick, within a frame or two (the
    // last approach tick may have just sounded; ticks keep a minimum gap).
    await clearCueCalls(page);
    await walk(page, 0.98, 0.98, 0.1);
    const inBand = await getCueCalls(page);
    expect(inBand.length).toBeGreaterThanOrEqual(1);
    expect(inBand.every((call) => call.inWindow)).toBe(true);

    // Overflow (a tap would miss): the shape is replaced, the cue goes quiet
    // until the next one is back in range.
    await clearCueCalls(page);
    await bridge.setActiveSize(((await bridge.getState())?.lastSize ?? 1) * 1.2);
    await bridge.step(0.05);
    expect(await getCueCalls(page)).toEqual([]);
  });

  test("stays silent while paused and when muted", async ({ page }) => {
    await seedSettings(page, { timingCue: true });
    await page.goto("/");
    const bridge = await startPaused(page);

    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    // Park the shape well inside the approach, then let the real rAF loop
    // run behind the pause overlay: nothing advances, nothing ticks.
    await page.evaluate(() => {
      const game = window.__GAME_TEST__!;
      game.setActiveSize((game.getState().lastSize ?? 1) * 0.9);
    });
    const parked = (await bridge.getState())?.activeSize;
    await bridge.resume();
    await page.waitForTimeout(300); // absence check: real frames must elapse
    expect((await bridge.getState())?.activeSize).toBe(parked);
    expect(await getCueCalls(page)).toEqual([]);

    const resumeStepping = async () => {
      await closeSettings(page);
      await page.keyboard.press("Escape");
      await expect(page.locator(".pause-overlay")).toBeHidden();
      await bridge.pause();
      await bridge.finishResumeCountdown();
      await clearCueCalls(page);
    };

    // Muted from the pause menu's settings: the approach stays silent.
    const sound = settingSwitch(page, "Sound");
    await openSettings(page);
    await flipSetting(page, "Sound");
    await expect(sound).toHaveAttribute("aria-checked", "false");
    await resumeStepping();
    await walk(page, 0.6, 0.95, 2);
    expect(await getCueCalls(page)).toEqual([]);
    expect((await bridge.getState())?.isGameOver).toBe(false);

    // Control: the very same approach ticks once sound is back.
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    await openSettings(page);
    await flipSetting(page, "Sound");
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await resumeStepping();
    await walk(page, 0.6, 0.95, 2);
    expect((await getCueCalls(page)).length).toBeGreaterThan(3);
  });

  test("with the setting off, no tick is ever played", async ({ page }) => {
    await page.goto("/");
    const bridge = await startPaused(page);
    await walk(page, 0.6, 0.95, 3);
    await walk(page, 0.98, 0.98, 0.1);
    expect(await getCueCalls(page)).toEqual([]);
    // Same walk as the "on" test, still in the same live run.
    expect((await bridge.getState())?.isGameOver).toBe(false);
  });
});
