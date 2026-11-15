import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

/** Same pattern as `src/utils/haptics.ts` ("medal"). */
const MEDAL_PATTERN = [16, 32, 16, 32, 16];
/** PERFECT stack points (src/gameplay/config.ts). */
const PERFECT_POINTS = 140;

/** Registered after the fixture's localStorage.clear(), so it survives it. */
const seedTimeAttackBest = (page: Page, score: number) =>
  page.addInitScript((value: number) => {
    localStorage.setItem(
      "shape-stack-high-scores-v3",
      JSON.stringify({
        CLASSIC: [],
        ZEN: [],
        TIME_ATTACK: [{ score: value, date: "1/1/2026" }],
      }),
    );
  }, score);

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

const medalVibrationCount = (page: Page) =>
  page.evaluate(
    (pattern) =>
      (window as unknown as { __VIBRATIONS__: unknown[] }).__VIBRATIONS__.filter(
        (p) => JSON.stringify(p) === JSON.stringify(pattern),
      ).length,
    MEDAL_PATTERN,
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

/** PERFECT stacks on a paused game until the score reaches `target`. */
const stackTo = async (bridge: ReturnType<typeof makeBridge>, target: number) => {
  for (let i = 0; i < 40; i += 1) {
    const score = (await bridge.getState())?.score ?? 0;
    if (score >= target) return score;
    await bridge.forceStack(0.98);
  }
  throw new Error(`score never reached ${target}`);
};

test.describe("Time Attack medals", () => {
  test.beforeEach(({ browserName }) => {
    // WebKit in CI takes seconds per click; these flows click a few times.
    test.slow(browserName === "webkit");
  });

  test("HUD target moves on at Bronze, game over shows the medal and the next goal", async ({
    page,
  }) => {
    await recordVibrations(page);
    await seedTimeAttackBest(page, 700);
    await page.goto("/");
    // 700 is below Bronze: no medal next to the TIME best yet.
    const timeBest = page.getByTestId("best-TIME_ATTACK");
    await expect(timeBest).toHaveText("BEST 700");
    await expect(timeBest.locator("svg")).toHaveCount(0);

    await page.getByRole("radio", { name: "Time Attack mode" }).click();
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await watchAnnouncements(page);

    const target = page.getByTestId("medal-target");
    const pbTarget = page.getByTestId("pb-target");
    const banner = page.getByTestId("medal-banner");
    // One goal at a time, the nearer first: the best (700) before Bronze.
    await expect(pbTarget).toHaveText("BEST 700");
    await expect(target).toHaveCount(0);

    // Best beaten: the medal ladder takes over. Just below Bronze: chasing it.
    await stackTo(bridge, 1000 - PERFECT_POINTS);
    await expect(pbTarget).toHaveCount(0);
    await expect(target).toHaveText("BRONZE 1000");
    await expect(banner).toHaveCount(0);
    expect(await medalVibrationCount(page)).toBe(0);

    const score = await stackTo(bridge, 1000);
    expect(score).toBeLessThan(1500);
    await expect(target).toHaveText("SILVER 1500");
    await expect(banner).toContainText("BRONZE MEDAL");
    await expect(banner).toContainText("NEXT SILVER 1500");
    await expect
      .poll(async () => (await announced(page)).join(" | "))
      .toContain("Bronze medal. Next: Silver at 1500");
    await expect.poll(() => medalVibrationCount(page)).toBe(1);

    // One more stack: the moment does not repeat.
    await bridge.forceStack(0.98);
    await expect
      .poll(async () => (await bridge.getState())?.score)
      .toBe(score + PERFECT_POINTS);
    await expect(banner).toHaveCount(1);
    expect(await medalVibrationCount(page)).toBe(1);
    expect((await announced(page)).filter((m) => m.includes("Bronze medal"))).toHaveLength(1);

    // End the run on the clock.
    const finalScore = score + PERFECT_POINTS;
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    const medal = page.getByTestId("gameover-medal");
    await expect(medal.locator(".gameover-medal-title")).toHaveText("BRONZE MEDAL");
    await expect(medal.locator(".gameover-medal-next")).toContainText("Silver at 1500");
    await expect(medal.locator(".gameover-medal-next")).toContainText(
      `${1500 - finalScore} to go`,
    );
    await expect(medal.locator("svg.medal-glyph--bronze")).toHaveCount(1);

    // The new best now carries its medal on the start screen.
    await page.click(".gameover-actions .menu-btn");
    await expect(timeBest).toContainText(`BEST ${finalScore}`);
    await expect(timeBest).toContainText("Bronze medal");
    await expect(timeBest.locator("svg.medal-glyph--bronze")).toHaveCount(1);
  });

  test("a run below Bronze ends with no medal and the Bronze target", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Time Attack mode" }).click();
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98);
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    const medal = page.getByTestId("gameover-medal");
    await expect(medal.locator(".gameover-medal-title")).toHaveText("NO MEDAL");
    await expect(medal.locator(".gameover-medal-next")).toContainText("Bronze at 1000");
    await expect(medal.locator(".gameover-medal-next")).toContainText(
      `${1000 - PERFECT_POINTS} to go`,
    );
  });

  test("Classic runs have no medal goals", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await expect(page.locator(".hud-primary")).toBeVisible();
    await expect(page.getByTestId("medal-target")).toHaveCount(0);

    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.getByTestId("gameover-medal")).toHaveCount(0);
  });
});
