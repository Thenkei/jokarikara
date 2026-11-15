import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { getMusicState, makeBridge, waitForBridge } from "./bridgeHelpers";

// Time Attack's last ten seconds tighten the soundtrack (src/audio/soundtrack.ts
// `getMusicTension`). The bed itself is inaudible to a test, so this asserts
// on the audio service's reconciled state through `__GAME_AUDIO__`: `tension`
// is the intent the engine follows (rebuilt with it after pause/mute).

type ModeName = "Classic mode" | "Zen mode" | "Time Attack mode";

/** Pick a mode and start by keyboard (WebKit in CI is slow per click). */
const startRun = async (page: Page, mode: ModeName) => {
  await page.goto("/");
  const radio = page.getByRole("radio", { name: mode });
  await radio.focus();
  await radio.press("Space");
  await expect(radio).toHaveAttribute("aria-checked", "true");
  await page.locator(".start-btn").press("Enter");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  return bridge;
};

/** Put the clock at `seconds` and let one frame report it (as the loop does). */
const clockAt = async (bridge: ReturnType<typeof makeBridge>, seconds: number) => {
  await bridge.setTimeRemaining(seconds);
  await bridge.step(1 / 60);
};

const tension = async (page: Page) => (await getMusicState(page))?.tension;

test.describe("Time Attack music tension", () => {
  test("tightens over the last ten seconds and eases out after a bonus", async ({
    page,
  }) => {
    const bridge = await startRun(page, "Time Attack mode");
    await expect
      .poll(() => getMusicState(page))
      .toMatchObject({ active: true, intensity: 0, tension: 0 });

    await clockAt(bridge, 15);
    expect(await tension(page)).toBe(0);

    // One step per displayed second: 8 -> 0.3, 3 -> 0.8.
    await clockAt(bridge, 8);
    expect(await tension(page)).toBeCloseTo(0.3, 9);
    await clockAt(bridge, 3);
    expect(await tension(page)).toBeCloseTo(0.8, 9);
    // The streak is untouched: the forced bass pulse is the engine's business.
    expect((await getMusicState(page))?.intensity).toBe(0);

    // Pausing keeps the intent; the rebuilt bed comes back tense.
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    expect(await getMusicState(page)).toMatchObject({ paused: true, tension: 0.8 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeHidden();
    await bridge.finishResumeCountdown();
    await bridge.pause();
    expect(await getMusicState(page)).toMatchObject({ paused: false, tension: 0.8 });

    // Real PERFECT bonuses (+5 s each): still tense at 8, calm again at 13.
    await bridge.forceStack(0.98);
    expect((await bridge.getState())?.lastStackQuality).toBe("PERFECT");
    await bridge.step(1 / 60);
    expect(await tension(page)).toBeCloseTo(0.3, 9);
    await bridge.forceStack(0.98);
    await bridge.step(1 / 60);
    expect((await bridge.getState())?.timeRemaining).toBeGreaterThan(12);
    expect(await tension(page)).toBe(0);

    // And down again; the run's end releases it with the music.
    await clockAt(bridge, 1);
    expect(await tension(page)).toBe(1);
    await clockAt(bridge, 0.01);
    await bridge.step(0.05);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    expect(await getMusicState(page)).toMatchObject({ active: false, tension: 0 });
  });

  for (const mode of ["Classic mode", "Zen mode"] as const) {
    test(`${mode}: the music never tenses, whatever the clock says`, async ({
      page,
    }) => {
      const bridge = await startRun(page, mode);
      await expect.poll(() => getMusicState(page)).toMatchObject({ active: true });
      for (const seconds of [15, 8, 3, 1]) {
        await clockAt(bridge, seconds);
        expect(await tension(page)).toBe(0);
      }
      await bridge.step(0.5);
      expect(await tension(page)).toBe(0);
    });
  }
});
