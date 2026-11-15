import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, seedBestWorld, waitForBridge } from "./bridgeHelpers";
import { openSettings } from "./settingsHelpers";
import { FINISH_CONFIRM_GUARD_MS } from "../src/modes/finishRun";
import { expectNoViolations } from "./axeHelpers";

/**
 * Rule-based accessibility audit (axe-core, WCAG 2.1 A + AA) of every screen.
 * `a11y.spec.ts` keeps the behavioural checks (keyboard, announcements); this
 * spec catches the static ones: contrast against the rendered background,
 * names, roles, aria-* misuse, focusable content under aria-hidden.
 *
 * Menus are driven by the keyboard (`locator.press`), not clicks: same
 * handlers, no per-click actionability wait (seconds on WebKit in CI). Runs
 * are frozen with the bridge's manual mode, so nothing moves under a scan.
 */

const ACHIEVEMENTS_KEY = "shape-stack-achievements-v1";
const HIGH_SCORES_KEY = "shape-stack-high-scores-v3";
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
];

/** Daily dates far in the past: the stats never depend on today's date. */
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

const seedLifetime = (page: Page, lifetime: Record<string, unknown>) =>
  page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify({ unlocked: {}, lifetime: value }));
    },
    { key: ACHIEVEMENTS_KEY, value: lifetime },
  );

const pickMode = async (page: Page, name: "Zen" | "Time Attack") => {
  const radio = page.getByRole("radio", { name: `${name} mode` });
  await radio.press("Enter");
  await expect(radio).toBeChecked();
};

/** START from the keyboard, then freeze the loop (bridge manual mode). */
const startFrozenRun = async (page: Page) => {
  await page.locator(".start-btn").press("Enter");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  await expect(page.locator(".hud-primary")).toBeVisible();
  return bridge;
};

/** Outgrow the previous shape: a Classic/Daily run ends on a miss. */
const missOut = async (bridge: ReturnType<typeof makeBridge>) => {
  const state = await bridge.getState();
  await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
  await bridge.step(0.016);
};

const enterMono = async (page: Page) => {
  await expect(page.locator(".start-btn")).toBeVisible();
  // Focus the page, not a control: the sequence is a document key handler.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  for (const key of KONAMI) await page.keyboard.press(key);
  await expect(page.locator(".game-container")).toHaveAttribute("data-theme", "mono");
};

test.describe("axe audit (WCAG 2.1 A/AA)", () => {
  // 15 screens × two axe passes: heavy on loaded CI runners (Mobile Chrome
  // went past 30 s), so give each scenario the slow-test budget.
  test.slow();

  test("start screen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".start-btn")).toBeVisible();
    await expectNoViolations(page);
  });

  test("start screen, Zen with the practice picker", async ({ page }) => {
    await seedBestWorld(page, 3);
    await page.goto("/");
    await pickMode(page, "Zen");
    await expect(page.locator(".practice-picker")).toBeVisible();
    await expectNoViolations(page);
  });

  test("settings sheet", async ({ page }) => {
    await page.goto("/");
    await openSettings(page);
    await expectNoViolations(page);
  });

  test("achievements panel with lifetime stats", async ({ page }) => {
    await seedLifetime(page, SEEDED_LIFETIME);
    await page.goto("/");
    await page.locator(".achievements-btn").press("Enter");
    await expect(page.getByRole("region", { name: "STATS" })).toBeVisible();
    await expectNoViolations(page);
    // axe skips text scrolled out of the panel: scan the bottom (locked) too.
    await page.locator(".achievement-item").last().scrollIntoViewIfNeeded();
    await expectNoViolations(page);
  });

  test("world atlas", async ({ page }) => {
    await seedBestWorld(page, 5);
    await page.goto("/");
    await page.locator(".worlds-btn").press("Enter");
    await expect(page.getByRole("region", { name: "WORLDS" })).toBeVisible();
    await expectNoViolations(page);
    // axe skips text scrolled out of the panel: scan the locked worlds too.
    await page.locator('.world-card[data-world="10"]').scrollIntoViewIfNeeded();
    await expectNoViolations(page);
  });

  test("in-game HUD, Classic", async ({ page }) => {
    await page.goto("/");
    const bridge = await startFrozenRun(page);
    await bridge.forceStack(0.98);
    await expectNoViolations(page);
  });

  test("in-game HUD, Time Attack", async ({ page }) => {
    await page.goto("/");
    await pickMode(page, "Time Attack");
    const bridge = await startFrozenRun(page);
    await bridge.forceStack(0.98);
    // The timer reports on a tick (only when the shown second changes).
    await bridge.setTimeRemaining(42);
    await bridge.step(0.001);
    await expect(page.getByRole("timer")).toHaveText("42s");
    await expectNoViolations(page);
  });

  test("pause menu, Zen (with FINISH RUN)", async ({ page }) => {
    await page.goto("/");
    await pickMode(page, "Zen");
    await startFrozenRun(page);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-finish-btn")).toHaveText("FINISH RUN");
    await expectNoViolations(page);
  });

  test("resume countdown digit", async ({ page }) => {
    // Playwright's clock: the 3 · 2 · 1 timers only move when told to.
    await page.clock.install({ time: new Date("2026-03-02T10:00:00Z") });
    await page.goto("/");
    await page.clock.pauseAt(new Date("2026-03-02T10:00:30Z"));
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    await page.clock.runFor(200);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    await page.locator(".pause-resume-btn").press("Enter");
    await expect(page.getByTestId("resume-countdown")).toHaveText("3");
    await expectNoViolations(page, { pumpPausedClock: true });
    // Both scans ran while a digit was on screen (the pump budget is shorter
    // than the whole countdown).
    await expect(page.getByTestId("resume-countdown")).toHaveText(/^[321]$/);
  });

  test("world first-visit overlay", async ({ page }) => {
    await seedBestWorld(page, 1);
    await page.goto("/");
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    await page.evaluate(() => window.__GAME_TEST__!.setWorldIntroMaxHold(10 * 60_000));
    const bridge = makeBridge(page);
    await bridge.pause();
    for (let i = 0; i < 15; i += 1) await bridge.forceStack(0.9);
    await expect(page.getByTestId("world-up-howto")).toBeVisible();
    expect((await bridge.getState())?.worldIntro).toBe(2);
    await expectNoViolations(page);
  });

  test("game over, Classic miss", async ({ page }) => {
    await page.goto("/");
    const bridge = await startFrozenRun(page);
    await bridge.forceStack(0.98);
    await missOut(bridge);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expect(page.locator(".end-insight")).toBeVisible();
    await expectNoViolations(page);
  });

  test("game over, Time Attack medal", async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(
        key,
        JSON.stringify({ CLASSIC: [], ZEN: [], TIME_ATTACK: [{ score: 700, date: "1/1/2026" }] }),
      );
    }, HIGH_SCORES_KEY);
    await page.goto("/");
    await pickMode(page, "Time Attack");
    const bridge = await startFrozenRun(page);
    for (let i = 0; i < 8; i += 1) await bridge.forceStack(0.98);
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);
    await expect(page.locator(".gameover-medal-title")).toHaveText("BRONZE MEDAL");
    await expectNoViolations(page);
  });

  test("game over, Zen FINISH RUN", async ({ page }) => {
    await page.goto("/");
    await pickMode(page, "Zen");
    const bridge = await startFrozenRun(page);
    for (let i = 0; i < 3; i += 1) await bridge.forceStack(0.98);
    await page.keyboard.press("Escape");
    const finish = page.locator(".pause-finish-btn");
    await finish.press("Enter");
    await expect(finish).toHaveText("TAP AGAIN TO FINISH");
    await page.waitForTimeout(FINISH_CONFIRM_GUARD_MS + 100);
    await finish.press("Enter");
    await expect(page.locator(".gameover-title")).toHaveText("SESSION COMPLETE");
    await expectNoViolations(page);
  });

  test("game over, Daily", async ({ page }) => {
    await page.goto("/");
    await page.locator(".daily-btn").press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98);
    await missOut(bridge);
    await expect(page.locator(".daily-result-label")).toContainText("DAILY");
    await expectNoViolations(page);
  });

  test("Mono theme, start screen and game over", async ({ page }) => {
    await page.goto("/");
    await enterMono(page);
    await expectNoViolations(page);

    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98);
    await missOut(bridge);
    await expect(page.locator(".gameover-screen")).toBeVisible();
    await expectNoViolations(page);
  });
});
