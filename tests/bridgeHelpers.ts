import type { Page } from "@playwright/test";
import type { CueCall, GameTestBridgeState } from "../src/utils/testBridge";
import type { MusicState } from "../src/audio/types";

export const waitForBridge = async (page: Page) => {
  await page.waitForFunction(() => !!window.__GAME_TEST__);
};

/** Soundtrack state; readable on every screen (installed by <App/>). */
export const getMusicState = (page: Page) =>
  page.evaluate(() => window.__GAME_AUDIO__?.getMusicState() as MusicState | undefined);

/** AudioContext state (`null` before audio is first used; installed by <App/>). */
export const getAudioContextState = (page: Page) =>
  page.evaluate(() => window.__GAME_AUDIO__?.getContextState() ?? null);

/** Timing cue calls recorded at the audio service (installed by <App/>). */
export const getCueCalls = (page: Page) =>
  page.evaluate(() => (window.__GAME_AUDIO__?.getCueCalls() ?? []) as CueCall[]);

export const clearCueCalls = (page: Page) =>
  page.evaluate(() => window.__GAME_AUDIO__?.clearCueCalls());

export const makeBridge = (page: Page) => ({
  getState: () =>
    page.evaluate(
      () => window.__GAME_TEST__?.getState() as GameTestBridgeState | undefined,
    ),
  isFractureActive: () =>
    page.evaluate(() => {
      const state = window.__GAME_TEST__?.getState();
      return state?.fractureActive ?? false;
    }),
  willFractureMissOnTap: () =>
    page.evaluate(() => {
      const state = window.__GAME_TEST__?.getState();
      return state?.fractureWillMissOnTap ?? false;
    }),
  tap: () => page.evaluate(() => window.__GAME_TEST__?.tap()),
  pause: () => page.evaluate(() => window.__GAME_TEST__?.pause()),
  resume: () => page.evaluate(() => window.__GAME_TEST__?.resume()),
  setActiveSize: (size: number) =>
    page.evaluate((value) => window.__GAME_TEST__?.setActiveSize(value), size),
  setTimeRemaining: (time: number) =>
    page.evaluate((value) => window.__GAME_TEST__?.setTimeRemaining(value), time),
  forceStack: (sizeRatio: number) =>
    page.evaluate((value) => {
      if (!window.__GAME_TEST__) return false;
      window.__GAME_TEST__.forceStack(value);
      return true;
    }, sizeRatio),
  step: (dt: number) =>
    page.evaluate((value) => window.__GAME_TEST__?.step(value), dt),
  showDiagnostics: () => page.evaluate(() => window.__GAME_TEST__?.showDiagnostics()),
  hideDiagnostics: () => page.evaluate(() => window.__GAME_TEST__?.hideDiagnostics()),
});
