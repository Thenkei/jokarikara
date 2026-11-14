import { test, expect } from "./fixtures";
import { getAudioContextState, makeBridge, waitForBridge } from "./bridgeHelpers";

/**
 * Idle suspension (src/audio/idle.ts): once nothing is audible the audio
 * context is suspended (no convolver/compressor work on the game over
 * screen), and the next sound resumes it. State changes are logged from the
 * page itself, so a slow click (CI WebKit) cannot make the test miss the
 * short "running" window before the context goes back to sleep.
 */
test.describe("Audio idle suspension", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const log: string[] = [];
      (window as Window & { __AUDIO_STATES__?: string[] }).__AUDIO_STATES__ = log;
      const Ctor = window.AudioContext;
      if (!Ctor) return;
      const watched = new WeakSet<BaseAudioContext>();
      for (const name of ["resume", "suspend"] as const) {
        const original = Ctor.prototype[name];
        Ctor.prototype[name] = function (this: AudioContext) {
          if (!watched.has(this)) {
            watched.add(this);
            this.addEventListener("statechange", () => log.push(this.state));
          }
          return original.call(this);
        };
      }
    });
  });

  const stateLog = (page: import("@playwright/test").Page) =>
    page.evaluate(
      () => (window as Window & { __AUDIO_STATES__?: string[] }).__AUDIO_STATES__?.slice() ?? [],
    );

  test("sleeps on the game over screen and wakes for the next menu sound", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await expect.poll(() => getAudioContextState(page)).toBe("running");

    // Miss: the run ends (fail sound, music fades out).
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await expect(page.locator(".gameover-screen")).toBeVisible();

    // Fail sound + reverb tail + grace (~5 s), then the context sleeps.
    await expect
      .poll(() => getAudioContextState(page), { timeout: 15_000 })
      .toBe("suspended");
    const before = (await stateLog(page)).length;

    // A menu click plays its UI sound: the context resumes first.
    await page.click(".gameover-screen .menu-btn");
    await expect(page.locator(".start-screen")).toBeVisible();
    await expect
      .poll(async () => (await stateLog(page)).slice(before), { timeout: 10_000 })
      .toContain("running");
  });
});
