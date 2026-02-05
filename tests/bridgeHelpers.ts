import type { Page } from "@playwright/test";
import type { GameTestBridgeState } from "../src/utils/testBridge";

export const waitForBridge = async (page: Page) => {
  await page.waitForFunction(() => !!window.__GAME_TEST__);
};

export const makeBridge = (page: Page) => ({
  getState: () =>
    page.evaluate(
      () => window.__GAME_TEST__?.getState() as GameTestBridgeState | undefined,
    ),
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
