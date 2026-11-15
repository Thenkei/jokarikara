import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { getEndSoundCalls, makeBridge, waitForBridge } from "./bridgeHelpers";

/**
 * Time Attack's clock running out is the mode's normal ending: the time-up
 * cue (never the fail buzz), a level-up haptic, "Time! Score N" for screen
 * readers and a TIME! game over. Sounds are asserted on the calls recorded at
 * the audio service (`__GAME_AUDIO__`), never on audible output: Firefox in
 * the CI container never starts audio. (Under E2E the game over follows at
 * once, so the in-run TIME! banner is covered by `src/App.timeUp.test.tsx`.)
 */

/** Same patterns as `src/utils/haptics.ts`. */
const LEVEL_UP_PATTERN = [10, 25, 10, 25, 20];
const FAIL_PATTERN = [40, 40, 90];
/** PERFECT stack points (src/gameplay/config.ts). */
const PERFECT_POINTS = 140;

const recordVibrations = (page: Page) =>
  page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as { __VIBRATIONS__: unknown[] }).__VIBRATIONS__ = calls;
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (pattern: unknown) => {
        calls.push(pattern);
        return true;
      },
    });
  });

const vibrations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __VIBRATIONS__: unknown[] }).__VIBRATIONS__);

const liveRegion = (page: Page) => page.locator(".sr-only[aria-live='polite']");

/** Keyboard only: WebKit in CI is slow per click. */
const startRun = async (page: Page, mode: "Classic" | "Time Attack") => {
  await page.goto("/");
  if (mode === "Time Attack") {
    // The mode picker is a radio group: End selects the last mode.
    await page.getByRole("radio", { name: "Classic mode" }).press("End");
    await expect(page.getByRole("radio", { name: "Time Attack mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  }
  await page.getByRole("button", { name: "START" }).press("Enter");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  return bridge;
};

test.describe("Time Attack time-up ending", () => {
  test.beforeEach(async ({ page }) => {
    await recordVibrations(page);
  });

  test("the clock reaching 0 plays the time-up cue, not the fail sound", async ({ page }) => {
    const bridge = await startRun(page, "Time Attack");
    await bridge.setTimeRemaining(0.05);
    await bridge.step(0.1);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    expect(await getEndSoundCalls(page)).toEqual([{ sound: "timeUp", world: 1, medal: null }]);
    expect(await vibrations(page)).toEqual([LEVEL_UP_PATTERN]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TIME!");
    await expect(page.locator(".end-insight-title")).toHaveText("Out of time.");
    // The clock is Time Attack's normal ending: calm card, not danger.
    await expect(page.locator(".end-insight")).toHaveClass(/end-insight--calm/);
    await expect(page.locator(".end-insight")).not.toHaveClass(/danger-signal/);
    await expect(liveRegion(page)).toHaveText("Time! Score 0");
  });

  test("a medal run resolves on its medal", async ({ page }) => {
    const bridge = await startRun(page, "Time Attack");
    for (let i = 0; i < 8; i += 1) await bridge.forceStack(0.98); // 1120: Bronze
    await expect.poll(async () => (await bridge.getState())?.score).toBe(8 * PERFECT_POINTS);
    await bridge.setTimeRemaining(0.05);
    await bridge.step(0.1);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    expect(await getEndSoundCalls(page)).toEqual([
      { sound: "timeUp", world: 1, medal: "BRONZE" },
    ]);
    await expect(page.getByTestId("gameover-medal").locator(".gameover-medal-title")).toHaveText(
      "BRONZE MEDAL",
    );
    await expect(liveRegion(page)).toHaveText(`Time! Score ${8 * PERFECT_POINTS}. Bronze medal`);
  });

  test("a miss whose penalty drains the clock ends on time too", async ({ page }) => {
    const bridge = await startRun(page, "Time Attack");
    await bridge.setTimeRemaining(3);
    // An untapped overflow: −5 s brings the clock to 0.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    expect(await getEndSoundCalls(page)).toEqual([{ sound: "timeUp", world: 1, medal: null }]);
    expect(await vibrations(page)).toEqual([LEVEL_UP_PATTERN]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TIME!");
    await expect(page.locator(".end-insight-title")).toHaveText("Out of time.");
  });

  test("a Classic miss still ends on the fail sound", async ({ page }) => {
    const bridge = await startRun(page, "Classic");
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    expect(await getEndSoundCalls(page)).toEqual([{ sound: "fail" }]);
    expect(await vibrations(page)).toEqual([FAIL_PATTERN]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("GAME OVER");
  });
});
