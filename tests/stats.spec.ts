import { test, expect } from "./fixtures";

/** Must match ACHIEVEMENTS_STORAGE_KEY in src/utils/storage.ts. */
const ACHIEVEMENTS_STORAGE_KEY = "shape-stack-achievements-v1";

/**
 * Daily dates far in the past: the streak is 0 whatever the wall clock says,
 * so the spec never depends on when (or in which timezone) it runs.
 */
const SEEDED_LIFETIME = {
  totalStacks: 1234,
  totalPerfects: 617,
  runsPlayed: 12,
  bossStacksCleared: 3,
  bestPerfectRun: 9,
  bestCombo: 18,
  bestZenStacks: 40,
  bestTimeAttackScore: 2450,
  dailyDates: ["2024-01-01", "2024-01-02", "2024-01-03"],
  bestWorld: 4,
};

test.describe("Lifetime stats", () => {
  test("hides the stats section on a first-ever profile", async ({ page }) => {
    await page.goto("/");
    await page.click(".achievements-btn");
    await expect(page.locator(".achievements-screen")).toBeVisible();
    await expect(page.locator(".achievement-item")).toHaveCount(14);
    await expect(page.locator(".lifetime-stats")).toHaveCount(0);
  });

  test("shows seeded lifetime stats in the achievements panel", async ({ page }) => {
    // Registered after the fixture's init script (which clears storage), so
    // the seed is re-applied after the clear on every navigation.
    await page.addInitScript(
      ({ key, lifetime }) => {
        localStorage.setItem(key, JSON.stringify({ unlocked: {}, lifetime }));
      },
      { key: ACHIEVEMENTS_STORAGE_KEY, lifetime: SEEDED_LIFETIME },
    );
    await page.goto("/");
    await page.click(".achievements-btn");

    const stats = page.getByRole("region", { name: "STATS" });
    await expect(stats).toBeVisible();
    await expect(stats.locator(".lifetime-stat")).toHaveCount(10);

    const value = (id: string) =>
      stats.locator(`.lifetime-stat[data-stat-id="${id}"] dd`);
    await expect(value("runs-played")).toHaveText("12");
    await expect(value("total-stacks")).toHaveText("1,234");
    await expect(value("perfect-rate")).toHaveText("50%");
    await expect(value("best-combo")).toHaveText("18");
    await expect(value("best-world")).toHaveText("4");
    await expect(value("best-time-attack")).toHaveText("2,450");
    await expect(value("daily-played")).toHaveText("3");
    await expect(value("daily-streak")).toHaveText("0");

    // Semantic pairing: each value is the <dd> of its labelled <dt>.
    await expect(
      stats.locator('.lifetime-stat[data-stat-id="perfect-rate"] dt'),
    ).toHaveText("Perfect rate");
  });

  test("opens at the top on a phone while BACK keeps keyboard focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(
      ({ key, lifetime }) => {
        localStorage.setItem(key, JSON.stringify({ unlocked: {}, lifetime }));
      },
      { key: ACHIEVEMENTS_STORAGE_KEY, lifetime: SEEDED_LIFETIME },
    );
    await page.goto("/");
    await page.click(".achievements-btn");

    await expect(page.locator(".achievements-back-btn")).toBeFocused();
    // The panel overflows a phone screen; focusing BACK must not scroll the
    // heading and stats out of view.
    await expect(page.locator(".achievements-heading")).toBeInViewport();
    await expect(page.locator(".lifetime-stats")).toBeInViewport();
  });
});
