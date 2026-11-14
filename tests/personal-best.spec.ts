import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

/** Same pattern as `src/utils/haptics.ts` ("record"). */
const RECORD_PATTERN = [14, 40, 14, 40, 70];

type Seed = {
  scores?: Partial<Record<"CLASSIC" | "ZEN" | "TIME_ATTACK", number>>;
  /** Today's Daily best (attempts = 1). */
  dailyBest?: number;
};

/** Registered after the fixture's localStorage.clear(), so it survives it. */
const seedRecords = (page: Page, seed: Seed) =>
  page.addInitScript((value: Seed) => {
    const list = (score?: number) =>
      score === undefined ? [] : [{ score, date: "1/1/2026" }];
    localStorage.setItem(
      "shape-stack-high-scores-v3",
      JSON.stringify({
        CLASSIC: list(value.scores?.CLASSIC),
        ZEN: list(value.scores?.ZEN),
        TIME_ATTACK: list(value.scores?.TIME_ATTACK),
      }),
    );
    if (value.dailyBest !== undefined) {
      // Same local-date key as src/modes/daily.ts (the fixture fakes
      // Date.now only; `new Date()` is the real day, like the app's).
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      localStorage.setItem(
        "shape-stack-daily-v1",
        JSON.stringify({ [key]: { best: value.dailyBest, attempts: 1 } }),
      );
    }
  }, seed);

/** Counts vibration calls, whatever the engine supports. */
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

const recordVibrationCount = (page: Page) =>
  page.evaluate(
    (pattern) =>
      (window as unknown as { __VIBRATIONS__: unknown[] }).__VIBRATIONS__.filter(
        (p) => JSON.stringify(p) === JSON.stringify(pattern),
      ).length,
    RECORD_PATTERN,
  );

/** Keeps every message the polite live region shows, in order. */
const watchAnnouncements = (page: Page) =>
  page.evaluate(() => {
    const live = document.querySelector(".sr-only[aria-live='polite']")!;
    const seen: string[] = [];
    (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__ = seen;
    new MutationObserver(() => {
      const text = live.textContent ?? "";
      if (text) seen.push(text);
    }).observe(live, { childList: true, subtree: true, characterData: true });
  });

const announced = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__);

/** PERFECT stacks (paused game) until the score beats `best`. */
const stackPast = async (bridge: ReturnType<typeof makeBridge>, best: number) => {
  for (let i = 0; i < 20; i += 1) {
    const state = await bridge.getState();
    if ((state?.score ?? 0) > best) return state!.score;
    await bridge.forceStack(0.98);
  }
  throw new Error(`score never passed ${best}`);
};

test.describe("Personal best moment", () => {
  test.beforeEach(({ browserName }) => {
    // WebKit in CI takes seconds per click; the flows below click a few times.
    test.slow(browserName === "webkit");
  });

  test("Classic: shows the best as a target, then celebrates passing it once", async ({
    page,
  }) => {
    await recordVibrations(page);
    await seedRecords(page, { scores: { CLASSIC: 200 } });
    await page.goto("/");
    await expect(page.getByTestId("best-CLASSIC")).toHaveText("BEST 200");

    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await watchAnnouncements(page);

    const target = page.getByTestId("pb-target");
    const banner = page.getByTestId("record-banner");
    const pill = page.locator(".hud-primary");
    await expect(target).toHaveText("BEST 200");
    await expect(banner).toHaveCount(0);
    await expect(pill).not.toHaveClass(/is-record/);

    // Tying is not beating: still chasing.
    await bridge.forceStack(0.98);
    const first = (await bridge.getState())?.score ?? 0;
    expect(first).toBeLessThanOrEqual(200);
    await expect(target).toBeVisible();

    await stackPast(bridge, 200);
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("NEW BEST");
    await expect(banner).toContainText("PAST 200");
    await expect(target).toHaveCount(0);
    await expect(pill).toHaveClass(/is-record/);
    await expect
      .poll(async () => (await announced(page)).join(" | "))
      .toContain("New personal best. Previous best 200 beaten");
    await expect.poll(() => recordVibrationCount(page)).toBe(1);

    // Keep stacking: the moment never repeats, the accent stays.
    for (let i = 0; i < 4; i += 1) await bridge.forceStack(0.98);
    await expect.poll(async () => (await bridge.getState())?.stackCount).toBeGreaterThan(4);
    await expect(banner).toHaveCount(1);
    await expect(target).toHaveCount(0);
    await expect(pill).toHaveClass(/is-record/);
    const messages = await announced(page);
    expect(messages.filter((m) => m.includes("personal best"))).toHaveLength(1);
    expect(await recordVibrationCount(page)).toBe(1);
  });

  test("first run of a mode: no target and no celebration", async ({ page }) => {
    await recordVibrations(page);
    await page.goto("/");
    await expect(page.getByTestId("best-CLASSIC")).toHaveText("BEST --");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await watchAnnouncements(page);

    for (let i = 0; i < 5; i += 1) await bridge.forceStack(0.98);
    await expect.poll(async () => (await bridge.getState())?.stackCount).toBe(5);
    await expect(page.getByTestId("pb-target")).toHaveCount(0);
    await expect(page.getByTestId("record-banner")).toHaveCount(0);
    await expect(page.locator(".hud-primary")).not.toHaveClass(/is-record/);
    expect((await announced(page)).some((m) => m.includes("best"))).toBe(false);
    expect(await recordVibrationCount(page)).toBe(0);
  });

  test("Daily races today's Daily best, not the Classic leaderboard", async ({
    page,
  }) => {
    await seedRecords(page, { scores: { CLASSIC: 5000 }, dailyBest: 100 });
    await page.goto("/");
    await expect(page.locator(".daily-btn")).toContainText("BEST 100");

    await page.click(".daily-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await expect(page.getByTestId("pb-target")).toHaveText("BEST 100");

    await stackPast(bridge, 100);
    const banner = page.getByTestId("record-banner");
    await expect(banner).toContainText("NEW DAILY BEST");
    await expect(banner).toContainText("PAST 100");
    await expect(page.getByTestId("pb-target")).toHaveCount(0);
  });

  test("Time Attack races its own best; Zen has no race", async ({ page }) => {
    await seedRecords(page, { scores: { CLASSIC: 50, ZEN: 300, TIME_ATTACK: 700 } });
    await page.goto("/");

    await page.getByRole("radio", { name: "Time Attack mode" }).click();
    await page.click(".start-btn");
    await waitForBridge(page);
    await makeBridge(page).pause();
    await expect(page.getByTestId("pb-target")).toHaveText("BEST 700");

    await page.click(".pause-btn");
    await page.click(".pause-menu-btn");
    await page.getByRole("radio", { name: "Zen mode" }).click();
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await expect(page.getByTestId("pb-target")).toHaveCount(0);
    // Even beating the stored Zen best stays quiet.
    await stackPast(bridge, 300);
    await expect(page.getByTestId("pb-target")).toHaveCount(0);
    await expect(page.getByTestId("record-banner")).toHaveCount(0);
  });
});
