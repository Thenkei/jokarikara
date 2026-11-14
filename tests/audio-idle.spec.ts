import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { getAudioContextState, makeBridge, waitForBridge } from "./bridgeHelpers";

/**
 * Idle suspension (src/audio/idle.ts): once nothing is audible the audio
 * context is suspended (no convolver/compressor work on the game over
 * screen), and the next sound resumes it.
 *
 * Two layers of evidence, logged from the page itself so a slow click (CI
 * WebKit) cannot miss a short window:
 * - the service's own `suspend()` / `resume()` calls, which hold in every
 *   environment;
 * - the context's real state transitions, which are only meaningful where
 *   the engine can actually run. In the Linux CI container, Firefox's
 *   context never leaves "suspended" even after the trusted START click
 *   (no audio output there; it read "suspended" 260 ms after the click,
 *   long before any idle grace could elapse). The pre-existing gesture
 *   resume() behaves the same there, so it is an environment limit, not a
 *   player-facing one: a real click on a machine with audio output starts
 *   the context (verified locally on Chromium, Firefox and WebKit).
 */
type AudioLog = { calls: string[]; states: string[] };

const readLog = (page: Page) =>
  page.evaluate(() => {
    const log = (window as Window & { __AUDIO_LOG__?: AudioLog }).__AUDIO_LOG__;
    return { calls: log?.calls.slice() ?? [], states: log?.states.slice() ?? [] };
  });

test.describe("Audio idle suspension", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const log: AudioLog = { calls: [], states: [] };
      (window as Window & { __AUDIO_LOG__?: AudioLog }).__AUDIO_LOG__ = log;
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      const watched = new WeakSet<BaseAudioContext>();
      for (const name of ["resume", "suspend"] as const) {
        const original = Ctor.prototype[name];
        Ctor.prototype[name] = function (this: AudioContext) {
          log.calls.push(name);
          if (!watched.has(this)) {
            watched.add(this);
            this.addEventListener("statechange", () => log.states.push(this.state));
          }
          return original.call(this);
        };
      }
    });
  });

  test("sleeps on the game over screen and wakes for the next menu sound", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    // The trusted START click created the context (running at once, or
    // resumed by the service when the browser created it suspended).
    await expect.poll(() => getAudioContextState(page)).not.toBeNull();
    const live = await page
      .waitForFunction(() => window.__GAME_AUDIO__?.getContextState() === "running", null, {
        timeout: 5_000,
      })
      .then(
        () => true,
        () => false,
      );
    test.info().annotations.push({
      type: "audio-output",
      description: live
        ? "context running: state transitions asserted"
        : "context never started in this environment: service calls asserted only",
    });
    if (!live) expect((await readLog(page)).calls).toContain("resume");

    // A run in progress keeps the context awake: past the START sounds'
    // tail + grace (~4.2 s) it would otherwise have been suspended.
    await page.waitForTimeout(5_000);
    expect((await readLog(page)).calls).not.toContain("suspend");

    // Miss: the run ends (fail sound, music fades out).
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await expect(page.locator(".gameover-screen")).toBeVisible();

    if (live) {
      // Fail sound + reverb tail + grace (~5 s), then the context sleeps.
      await expect
        .poll(() => getAudioContextState(page), { timeout: 15_000 })
        .toBe("suspended");
      expect((await readLog(page)).calls.filter((c) => c === "suspend")).toHaveLength(1);
    }
    const before = await readLog(page);

    // A menu click plays its UI sound: the service resumes the context first.
    await page.click(".gameover-screen .menu-btn");
    await expect(page.locator(".start-screen")).toBeVisible();
    await expect
      .poll(async () => (await readLog(page)).calls.slice(before.calls.length))
      .toContain("resume");
    if (live) {
      await expect
        .poll(async () => (await readLog(page)).states.slice(before.states.length), {
          timeout: 10_000,
        })
        .toContain("running");
    }
  });
});
