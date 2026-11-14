import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

/** Must match ACHIEVEMENTS_STORAGE_KEY / DAILY_STORAGE_KEY in src/utils/storage.ts. */
const ACHIEVEMENTS_STORAGE_KEY = "shape-stack-achievements-v1";
const DAILY_STORAGE_KEY = "shape-stack-daily-v1";

/**
 * Time is driven by Playwright's clock in a fixed zone, so local midnight and
 * every date key are deterministic wherever the suite runs. Instants carry an
 * explicit offset (Node parses them, the browser renders them in Paris).
 */
test.use({ timezoneId: "Europe/Paris", locale: "en-US" });

const at = (local: string) => new Date(`${local}+01:00`);

interface Seed {
  dailyDates: string[];
  /** Daily records by date key (`shape-stack-daily-v1`). */
  daily?: Record<string, { best: number; attempts: number }>;
}

/** Registered after the fixture's init script, which clears localStorage. */
const seed = (page: Page, value: Seed) =>
  page.addInitScript(
    ({ value, achievementsKey, dailyKey }) => {
      localStorage.setItem(
        achievementsKey,
        JSON.stringify({
          unlocked: {},
          lifetime: {
            totalStacks: 40,
            totalPerfects: 10,
            runsPlayed: value.dailyDates.length,
            bestWorld: 1,
            dailyDates: value.dailyDates,
          },
        }),
      );
      if (value.daily) localStorage.setItem(dailyKey, JSON.stringify(value.daily));
    },
    { value, achievementsKey: ACHIEVEMENTS_STORAGE_KEY, dailyKey: DAILY_STORAGE_KEY },
  );

/**
 * Loads the start screen at `start`, then freezes the clock at `pauseAt`:
 * from there only `clock.runFor` moves time (no wall-clock windows).
 */
const openAt = async (page: Page, start: string, pauseAt: string) => {
  await page.clock.install({ time: at(start) });
  await page.goto("/");
  await page.clock.pauseAt(at(pauseAt));
};

test.describe("Daily streak and countdown", () => {
  test("asks to keep a streak that today has not extended yet", async ({ page }) => {
    await seed(page, { dailyDates: ["2026-11-12", "2026-11-13", "2026-11-14"] });
    await openAt(page, "2026-11-15T10:00:00", "2026-11-15T10:00:10");

    const button = page.locator(".daily-btn");
    await expect(button).toContainText("Nov 15 · NOT PLAYED");
    await expect(button.locator(".streak-chip")).toHaveText("KEEP YOUR 3-DAY STREAK");
    await expect(button.locator(".streak-chip")).toHaveClass(/streak-chip--at-risk/);
    await expect(button.locator(".streak-flame")).toBeVisible();
    // No countdown before today's challenge is played.
    await expect(button.locator(".daily-next")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name:
          "Daily challenge for Nov 15. Same shapes for everyone today. " +
          "Not played yet. 3-day streak, play today to keep it.",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("shows no streak for a single day", async ({ page }) => {
    await seed(page, { dailyDates: ["2026-11-14"] });
    await openAt(page, "2026-11-15T10:00:00", "2026-11-15T10:00:10");
    await expect(page.locator(".daily-btn")).toContainText("NOT PLAYED");
    await expect(page.locator(".streak-chip")).toHaveCount(0);
  });

  test("counts down to the next challenge once today is played", async ({ page }) => {
    await seed(page, {
      dailyDates: ["2026-11-13", "2026-11-14", "2026-11-15"],
      daily: { "2026-11-15": { best: 140, attempts: 2 } },
    });
    await openAt(page, "2026-11-15T16:47:30", "2026-11-15T16:47:40");

    const button = page.locator(".daily-btn");
    await expect(button).toContainText("Nov 15 · BEST 140 · 2 TRIES");
    await expect(button.locator(".streak-chip")).toHaveText("3-DAY STREAK");
    await expect(button.locator(".streak-chip")).toHaveClass(/streak-chip--kept/);
    await expect(button.locator(".daily-next")).toHaveText("NEXT CHALLENGE IN 7h 12m");
    await expect(button).toHaveAccessibleName(
      "Daily challenge for Nov 15. Same shapes for everyone today. Best 140, 2 tries. " +
        "3-day streak. Next challenge in 7 hours 12 minutes.",
    );

    // One tick per minute.
    await page.clock.runFor(60_000);
    await expect(button.locator(".daily-next")).toHaveText("NEXT CHALLENGE IN 7h 11m");
  });

  test("flips to the new day's challenge at midnight without a reload", async ({ page }) => {
    await seed(page, {
      dailyDates: ["2026-11-13", "2026-11-14", "2026-11-15"],
      daily: { "2026-11-15": { best: 140, attempts: 1 } },
    });
    await openAt(page, "2026-11-15T23:58:30", "2026-11-15T23:58:40");

    const button = page.locator(".daily-btn");
    await expect(button.locator(".daily-next")).toHaveText("NEXT CHALLENGE IN 1m");
    await page.clock.runFor(60_000);
    await expect(button.locator(".daily-next")).toHaveText("NEXT CHALLENGE IN <1m");

    await page.clock.runFor(60_000);
    await expect(button).toContainText("Nov 16 · NOT PLAYED");
    await expect(button.locator(".daily-next")).toHaveCount(0);
    // Yesterday counts until today ends: the streak is now at risk.
    await expect(button.locator(".streak-chip")).toHaveText("KEEP YOUR 3-DAY STREAK");
  });

  test("shows the kept streak and the countdown on the game over card", async ({
    page,
  }) => {
    await seed(page, { dailyDates: ["2026-11-13", "2026-11-14"] });
    // Time keeps flowing during the run (the game loop needs frames), so the
    // card's minute depends on how long the run took (slow CI engines too).
    await page.clock.install({ time: at("2026-11-15T16:47:30") });
    await page.goto("/");
    await expect(page.locator(".streak-chip")).toHaveText("KEEP YOUR 2-DAY STREAK");

    await page.click(".daily-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.tap();
    await bridge.step(0.016);

    const card = page.locator(".gameover-screen .daily-summary");
    await expect(card).toBeVisible();
    await expect(card.locator(".streak-chip")).toHaveText("3-DAY STREAK");
    await expect(card.locator(".daily-next")).toContainText(
      /^NEXT CHALLENGE IN 7h (1[0-2]|[0-9])m/,
    );

    // Frozen from here: back on the menu, the button reads the paused clock.
    await page.clock.pauseAt(at("2026-11-15T17:00:00"));
    await page.click(".gameover-screen .menu-btn");
    await expect(page.locator(".daily-btn")).toContainText("Nov 15 · BEST 0 · 1 TRY");
    await expect(page.locator(".daily-btn .daily-next")).toHaveText(
      "NEXT CHALLENGE IN 7h 0m",
    );
    await expect(page.locator(".daily-btn .streak-chip")).toHaveText("3-DAY STREAK");
  });
});
