import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { RESUME_COUNTDOWN_TOTAL_MS } from "../src/gameplay/resumeCountdown";

/**
 * axe-core scan helpers shared by tests/axe.spec.ts (every screen, English)
 * and tests/i18n.spec.ts (French screens). WCAG 2.1 A + AA, any impact fails.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
/** Every impact fails the audit: none is accepted today. */
const FAILING_IMPACTS = new Set(["minor", "moderate", "serious", "critical"]);

/**
 * Wait for every finite CSS animation/transition (entrances, fades) to end, so
 * contrast is measured on the settled frame rather than mid-fade. Infinite
 * ones (idle pulses) are left running: their resting state is what a player
 * reads most of the time. Something can mount a frame after the action that
 * caused it (an unlock toast after a stack), so with a live clock it first
 * lets two frames render, and it repeats until a pass finds nothing running.
 */
const settle = async (page: Page, liveClock: boolean) => {
  for (let pass = 0; pass < 5; pass += 1) {
    const running = await page.evaluate(async (waitFrames) => {
      if (waitFrames) {
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      }
      const finite = document.getAnimations().filter((animation) => {
        const end = Number(animation.effect?.getComputedTiming().endTime);
        return animation.playState === "running" && Number.isFinite(end);
      });
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
      return finite.length;
    }, liveClock);
    if (running === 0) return;
  }
};

type AxeViolations = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"];

const format = (violations: AxeViolations) =>
  violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help}\n` +
        v.nodes
          .map((n) => `    ${n.target.join(" ")}\n      ${n.failureSummary?.replace(/\n/g, "\n      ")}`)
          .join("\n"),
    )
    .join("\n");

type ScanOptions = {
  /**
   * The page runs on Playwright's paused clock, which also freezes axe's own
   * timers: pump the fake clock 1 ms at a time until the scan is done.
   */
  pumpPausedClock?: boolean;
};

/**
 * Fake time one scan may pump (~150 ms used locally): two scans together stay
 * inside the 3 · 2 · 1, so both run while the countdown is on screen.
 */
const PUMP_BUDGET_MS = Math.floor((RESUME_COUNTDOWN_TOTAL_MS - 100) / 2);
/** Fake time advanced per pump step (one 60 Hz frame). */
const PUMP_STEP_MS = 16;

/**
 * Decorative image layers: the start screen backdrop (SVG) and the game board
 * canvas (role img). axe cannot compute a background through an image node,
 * so text over them comes back "incomplete" instead of pass/fail. The second
 * pass hides them and re-runs only color-contrast, measuring every label
 * against the surface it sits on (panels, cards, chips, the page colour).
 */
const DECOR_HIDDEN_CSS = ".start-backdrop, canvas { visibility: hidden !important; }";

/**
 * No CSS transitions while scanning: a UI timer firing mid-scan (e.g. the
 * STYLE/COMBO row auto-hiding a few seconds after a stack) would otherwise be
 * measured half-faded, at a contrast no player ever reads (seen on CI as
 * 1.4:1 on Mobile Chrome). State changes then apply instantly; keyframe
 * animations are left to `settle`.
 */
const NO_TRANSITIONS_CSS =
  "*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; }";

const analyze = async (page: Page, builder: AxeBuilder, pumpPausedClock: boolean) => {
  let done = false;
  const scan = builder.analyze().finally(() => {
    done = true;
  });
  if (pumpPausedClock) {
    // One frame per step: each runFor is a browser round trip, and ~800
    // one-millisecond steps per scan overran the 30 s test budget on loaded
    // CI runners. 16 ms keeps the same fake-time budget in ~50 round trips.
    for (let ms = 0; !done && ms < PUMP_BUDGET_MS; ms += PUMP_STEP_MS) {
      await page.clock.runFor(PUMP_STEP_MS);
    }
  }
  return scan;
};

const expectClean = (label: string, violations: AxeViolations) => {
  const failing = violations.filter((v) => FAILING_IMPACTS.has(v.impact ?? "minor"));
  // Soft: a screen with several scans reports all of them in one run.
  expect.soft(failing.map((v) => v.id), `${label}\n${format(failing)}`).toEqual([]);
};

export const expectNoViolations = async (page: Page, { pumpPausedClock = false }: ScanOptions = {}) => {
  // axe audits one frame, and contrast is a property of the resting frame.
  // With motion on, an entrance that starts mid-scan (an unlock toast on a
  // slow engine) is measured at a random opacity. The app's reduced-motion
  // CSS only drops motion (colours are shared), so the scans see what every
  // player sees once things stop moving.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const frozen = await page.addStyleTag({ content: NO_TRANSITIONS_CSS });
  try {
    // Playwright's paused clock also freezes requestAnimationFrame.
    await settle(page, !pumpPausedClock);
    const full = await analyze(
      page,
      new AxeBuilder({ page }).withTags(WCAG_TAGS),
      pumpPausedClock,
    );
    expectClean("full scan", full.violations);

    const style = await page.addStyleTag({ content: DECOR_HIDDEN_CSS });
    try {
      const contrast = await analyze(
        page,
        new AxeBuilder({ page }).withRules(["color-contrast"]),
        pumpPausedClock,
      );
      expectClean("color-contrast, decorative layers hidden", contrast.violations);
    } finally {
      await style.evaluate((node) => node.remove());
    }
  } finally {
    await frozen.evaluate((node) => node.remove());
    await page.emulateMedia({ reducedMotion: null });
  }
};
