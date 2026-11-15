import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { getMusicState, makeBridge, waitForBridge } from "./bridgeHelpers";
import {
  RESUME_COUNTDOWN_STEP_MS as STEP,
  RESUME_COUNTDOWN_TOTAL_MS as TOTAL,
} from "../src/gameplay/resumeCountdown";

/**
 * The resume countdown ("3 · 2 · 1" after RESUME) runs on wall-clock timers
 * and the real rAF loop. Playwright's clock is paused right after load, so
 * only `clock.runFor` moves time: no spec depends on how long a click takes
 * (WebKit in CI spends seconds per click), and every digit is observable.
 */
const T0 = new Date("2026-03-02T10:00:00Z");

const openPausedClock = async (page: Page) => {
  await page.clock.install({ time: T0 });
  await page.goto("/");
  await page.clock.pauseAt(new Date(T0.getTime() + 30_000));
};

const startRun = async (page: Page, mode?: "Time Attack") => {
  if (mode) await page.getByRole("radio", { name: `${mode} mode` }).click();
  await page.click(".start-btn");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  // A few real frames: the loop primes its clock and the shape grows a bit.
  await page.clock.runFor(200);
  return bridge;
};

const pauseOverlay = (page: Page) => page.locator(".pause-overlay");
const countdown = (page: Page) => page.getByTestId("resume-countdown");

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => value });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (value ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

test.describe("Resume countdown", () => {
  test("RESUME counts 3 · 2 · 1 on a frozen board, then play resumes @cross-browser", async ({
    page,
  }) => {
    await openPausedClock(page);
    const bridge = await startRun(page);

    await page.click(".pause-btn");
    await expect(pauseOverlay(page)).toBeVisible();
    const frozen = (await bridge.getState())?.activeSize;
    expect(frozen).toBeGreaterThan(0);

    await page.click(".pause-resume-btn");
    // The menu closes at once; the board stays frozen under the count.
    await expect(pauseOverlay(page)).toBeHidden();
    await expect(countdown(page)).toHaveText("3");
    expect(await bridge.isResumeCountdownRunning()).toBe(true);
    expect(await bridge.getState()).toMatchObject({ paused: true, resumeCountdown: 3 });
    await expect(page.locator(".sr-only[aria-live='polite']")).toHaveText("Resuming in 3");

    for (const digit of [2, 1]) {
      await page.clock.runFor(STEP);
      await expect(countdown(page)).toHaveText(String(digit));
      expect((await bridge.getState())?.activeSize).toBe(frozen);
    }
    // Announced once, not per digit.
    await expect(page.locator(".sr-only[aria-live='polite']")).toHaveText("Resuming in 3");

    await page.clock.runFor(STEP);
    await expect(countdown(page)).toBeHidden();
    expect(await bridge.getState()).toMatchObject({ paused: false, resumeCountdown: null });
    expect((await bridge.getState())?.activeSize).toBe(frozen);

    await page.clock.runFor(300);
    expect((await bridge.getState())?.activeSize).toBeGreaterThan(frozen!);
    expect((await bridge.getState())?.isGameOver).toBe(false);
  });

  test("taps during the count do nothing (no stack, no miss)", async ({ page }) => {
    await openPausedClock(page);
    const bridge = await startRun(page);

    await page.keyboard.press("Escape");
    await expect(pauseOverlay(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(countdown(page)).toHaveText("3");

    // A size where a tap would stack, then one where it would miss: both
    // ignored while counting (pointer on the board, Space, and the bridge).
    const lastSize = (await bridge.getState())?.lastSize ?? 1;
    for (const ratio of [0.95, 1.2]) {
      await bridge.setActiveSize(lastSize * ratio);
      const size = lastSize * ratio;
      const viewport = page.viewportSize()!;
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await page.keyboard.press("Space");
      await bridge.tap();
      expect(await bridge.getState()).toMatchObject({
        stackCount: 0,
        isGameOver: false,
        activeSize: size,
        resumeCountdown: 3,
      });
    }
    await expect(page.locator(".gameover-screen")).toBeHidden();

    // Back to a playable size: the run carries on after the count.
    await bridge.setActiveSize(lastSize * 0.5);
    await page.clock.runFor(TOTAL);
    await expect(countdown(page)).toBeHidden();
    expect(await bridge.getState()).toMatchObject({ paused: false, stackCount: 0 });
  });

  test("Escape during the count re-opens the pause menu", async ({ page }) => {
    await openPausedClock(page);
    const bridge = await startRun(page);

    await page.keyboard.press("p");
    await expect(pauseOverlay(page)).toBeVisible();
    const frozen = (await bridge.getState())?.activeSize;
    await page.click(".pause-resume-btn");
    await expect(countdown(page)).toHaveText("3");
    await page.clock.runFor(STEP);
    await expect(countdown(page)).toHaveText("2");

    await page.keyboard.press("Escape");
    await expect(pauseOverlay(page)).toBeVisible();
    await expect(countdown(page)).toBeHidden();
    expect(await bridge.isResumeCountdownRunning()).toBe(false);

    // Cancelled for good: time passes, nothing resumes or grows.
    await page.clock.runFor(TOTAL * 2);
    await expect(pauseOverlay(page)).toBeVisible();
    expect(await bridge.getState()).toMatchObject({ paused: true, activeSize: frozen });
  });

  test("tab hidden auto-pauses; back to visible stays paused; RESUME counts down", async ({
    page,
  }) => {
    await openPausedClock(page);
    const bridge = await startRun(page);
    await expect.poll(async () => (await getMusicState(page))?.playing).toBe(true);

    await setHidden(page, true);
    await expect(pauseOverlay(page)).toBeVisible();
    await setHidden(page, false);
    await page.clock.runFor(1000);
    // Never auto-resumes: the player picks RESUME.
    await expect(pauseOverlay(page)).toBeVisible();
    const frozen = (await bridge.getState())?.activeSize;

    await page.click(".pause-resume-btn");
    await expect(countdown(page)).toHaveText("3");
    // The soundtrack waits for "go" too.
    expect(await getMusicState(page)).toMatchObject({ paused: true, playing: false });

    await page.clock.runFor(TOTAL - 1);
    expect((await bridge.getState())?.activeSize).toBe(frozen);
    await page.clock.runFor(1);
    await expect(countdown(page)).toBeHidden();
    expect(await getMusicState(page)).toMatchObject({ paused: false, playing: true });
  });

  test("Time Attack: the timer stays frozen through the count", async ({ page }) => {
    await openPausedClock(page);
    const bridge = await startRun(page, "Time Attack");

    await page.click(".pause-btn");
    await page.click(".pause-resume-btn");
    await expect(countdown(page)).toHaveText("3");
    const before = (await bridge.getState())?.timeRemaining;
    await page.clock.runFor(TOTAL - 1);
    expect((await bridge.getState())?.timeRemaining).toBe(before);

    await page.clock.runFor(500);
    expect((await bridge.getState())?.timeRemaining).toBeLessThan(before!);
  });

  test("the bridge can skip the count", async ({ page }) => {
    await openPausedClock(page);
    const bridge = await startRun(page);
    await page.click(".pause-btn");
    await page.click(".pause-resume-btn");
    await expect(countdown(page)).toHaveText("3");
    await bridge.finishResumeCountdown();
    await expect(countdown(page)).toBeHidden();
    expect(await bridge.getState()).toMatchObject({ paused: false, resumeCountdown: null });
  });
});
