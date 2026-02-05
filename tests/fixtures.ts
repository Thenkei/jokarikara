import { test as base, expect } from "@playwright/test";

type SeedState = { seed: number };

export const test = base.extend<{ seedState: SeedState }>({
  seedState: async ({}, use) => {
    await use({ seed: 123456789 });
  },
  page: async ({ page, seedState }, use) => {
    await page.addInitScript(({ seed }) => {
      (window as Window & { __GAME_TEST_AUTO_DIAG__?: boolean }).__GAME_TEST_AUTO_DIAG__ =
        false;
      const state = { seed };
      const nextRandom = () => {
        state.seed = (state.seed * 1664525 + 1013904223) % 4294967296;
        return state.seed / 4294967296;
      };

      const baseNow = 1700000000000;
      (window as Window & { __TEST_NOW__?: number }).__TEST_NOW__ = baseNow;
      const originalDateNow = Date.now;
      Date.now = () =>
        (window as Window & { __TEST_NOW__?: number }).__TEST_NOW__ ??
        originalDateNow();

      Math.random = nextRandom;
      localStorage.clear();
    }, seedState);

    await use(page);
  },
});

export { expect };
