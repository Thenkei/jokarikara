import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

const failRun = async (bridge: ReturnType<typeof makeBridge>) => {
  const state = await bridge.getState();
  await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
  await bridge.tap();
  await bridge.step(0.016);
};

test.describe("Daily Challenge", () => {
  test("runs Classic rules with a DAILY badge and records attempts", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".daily-btn")).toContainText("NOT PLAYED");

    await page.click(".daily-btn");
    await waitForBridge(page);
    await expect(page.locator(".daily-badge")).toBeVisible();

    const bridge = makeBridge(page);
    await bridge.pause();
    expect((await bridge.getState())?.mode).toBe("CLASSIC");
    await bridge.forceStack(0.98);
    await failRun(bridge);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.locator(".daily-result-label")).toContainText("DAILY");
    await expect(page.locator(".daily-summary-line")).toContainText("1 TRY");
    await expect(page.locator(".new-best-badge")).toBeVisible();

    // Daily runs stay out of the Classic leaderboard.
    const classic = await page.evaluate(() =>
      window.localStorage.getItem("shape-stack-high-scores-v3"),
    );
    expect(classic ?? "").not.toContain('"score":140');

    // Retry stays in Daily mode and increments attempts.
    await page.click(".retry-btn");
    await waitForBridge(page);
    await expect(page.locator(".daily-badge")).toBeVisible();
    await bridge.pause();
    await failRun(bridge);
    await expect(page.locator(".daily-summary-line")).toContainText("2 TRIES");

    await page.click(".gameover-screen .menu-btn");
    await expect(page.locator(".daily-btn")).toContainText("BEST 140");
  });

  test("uses the same seed for every Daily run of the day", async ({ page }) => {
    await page.goto("/");
    await page.click(".daily-btn");
    await waitForBridge(page);
    const first = await makeBridge(page).getState();
    await makeBridge(page).pause();
    await failRun(makeBridge(page));

    await page.click(".retry-btn");
    await waitForBridge(page);
    const second = await makeBridge(page).getState();
    expect(second?.themeId).toBe(first?.themeId);
    // Regular runs in E2E use a different fixed seed than the daily one.
    expect(first?.themeId).not.toMatch(/:424242:/);
  });

  test("share copies a result to the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      // Force the clipboard path even on platforms exposing Web Share.
      Object.defineProperty(navigator, "share", { value: undefined });
    });
    await page.goto("/");
    await page.click(".daily-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98);
    await failRun(bridge);

    await page.click(".share-btn");
    await expect(page.locator(".share-status")).toHaveText("Copied to clipboard");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/^Shape Stack Daily \d{4}-\d{2}-\d{2}\n140 pts · 1 stacks/);
    expect(copied).toContain("🟨");
  });
});

test.describe("Time Attack feedback", () => {
  test("shows +5s on a perfect stack and a critical timer under 10s", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click('button:has-text("TIME")');
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();

    await bridge.forceStack(0.98);
    await expect(page.locator(".time-bonus-pop")).toHaveText("+5s");

    await bridge.setTimeRemaining(8.5);
    await bridge.step(0.016);
    await expect(page.locator(".timer-badge")).toHaveClass(/critical/);
  });
});
