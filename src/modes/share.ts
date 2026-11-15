import type { GameMode } from "../types";
import { QUALITY_EMOJI } from "./daily";
import { QUALITY_ORDER, type QualityBreakdown } from "./runInsights";
import { getMedal, getMedalShareLabel, hasMedals } from "./medals";

/**
 * Share text for regular (non-daily) runs. Pure: the caller hands over what
 * the game over screen shows, this decides the wording. Every number is
 * sanitised so a bad input can degrade the text but never print
 * "undefined" / "NaN" into someone's timeline.
 */

/** Public build (GitHub Pages, matches Vite's `base`). */
export const GAME_URL = "https://thenkei.github.io/jokarikara/";

/**
 * Max cells in the quality bar. The bar is proportional to the whole run
 * (unlike the Daily trail, which shows the first stacks in order), so a
 * 300-stack run still fits in one short line.
 */
export const SHARE_BAR_LENGTH = 10;

const MODE_SHARE_LABELS: Readonly<Record<GameMode, string>> = {
  CLASSIC: "Classic",
  ZEN: "Zen",
  TIME_ATTACK: "Time Attack",
};

/** Non-negative integer, or `fallback` for NaN / ±Infinity / null. */
const toCount = (value: number | null | undefined, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;

/** World / level are 1-based: anything below 1 or non-finite reads as 1. */
const toOrdinal = (value: number | null | undefined): number =>
  Math.max(1, toCount(value, 1));

/**
 * Splits `maxCells` between qualities proportionally to their counts
 * (largest remainder), best quality first. Runs shorter than the bar get one
 * cell per stack. Any quality that occurred keeps at least one cell, so a
 * single OK in a long PERFECT run still shows.
 */
export const buildQualityBar = (
  breakdown: Readonly<QualityBreakdown>,
  maxCells: number = SHARE_BAR_LENGTH,
): string => {
  const counts = QUALITY_ORDER.map((q) => toCount(breakdown[q]));
  const total = counts.reduce((sum, n) => sum + n, 0);
  const width = Math.max(1, toCount(maxCells, SHARE_BAR_LENGTH));
  if (total === 0) return "";

  let cells: number[];
  if (total <= width) {
    cells = counts;
  } else {
    const exact = counts.map((n) => (n * width) / total);
    cells = exact.map(Math.floor);
    let left = width - cells.reduce((sum, n) => sum + n, 0);
    // Largest remainder first; ties keep the better quality (stable order).
    const byRemainder = exact
      .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
      .sort((a, b) => b.remainder - a.remainder);
    for (const { index } of byRemainder) {
      if (left === 0) break;
      cells[index] += 1;
      left -= 1;
    }
    // Visibility floor: borrow a cell from the widest bucket. With 4
    // qualities and width >= 4 there is always a bucket with > 1 cell.
    counts.forEach((n, index) => {
      if (n === 0 || cells[index] > 0) return;
      const widest = cells.indexOf(Math.max(...cells));
      if (cells[widest] <= 1) return;
      cells[widest] -= 1;
      cells[index] = 1;
    });
  }

  return QUALITY_ORDER.map((q, index) => QUALITY_EMOJI[q].repeat(cells[index])).join("");
};

export interface RunShareInput {
  mode: GameMode;
  score: number;
  world: number;
  level: number;
  /** Stacks made during this run (practice offset already removed). */
  stackCount: number;
  /** Ignored for Zen, which has no combo. */
  bestCombo?: number | null;
  breakdown: Readonly<QualityBreakdown>;
  /** Zen practice start world; omitted / null for a regular run. */
  practiceWorld?: number | null;
}

/**
 * Spoiler-free result text for a regular run:
 *
 *   Shape Stack · Classic
 *   1240 pts · 42 stacks · W3 L2 · combo x12
 *   🟨🟨🟨🟨🟩🟩🟩🟦🟦⬜
 *   https://thenkei.github.io/jokarikara/
 *
 * Time Attack names the medal earned in the title, in words ("Shape Stack ·
 * Time Attack · Gold medal"), and stays silent when there is none.
 */
export const buildRunShareText = ({
  mode,
  score,
  world,
  level,
  stackCount,
  bestCombo,
  breakdown,
  practiceWorld,
}: RunShareInput): string => {
  const modeLabel = MODE_SHARE_LABELS[mode] ?? MODE_SHARE_LABELS.CLASSIC;
  const practiceFrom = toCount(practiceWorld);
  const practice = practiceFrom > 1;
  const medal = hasMedals(mode, false, practice) ? getMedal(toCount(score)) : null;
  const title = practice
    ? `Shape Stack · ${modeLabel} practice from W${practiceFrom}`
    : medal
      ? `Shape Stack · ${modeLabel} · ${getMedalShareLabel(medal)}`
      : `Shape Stack · ${modeLabel}`;

  const stacks = toCount(stackCount);
  const stats = [
    `${toCount(score)} pts`,
    `${stacks} ${stacks === 1 ? "stack" : "stacks"}`,
    `W${toOrdinal(world)} L${toOrdinal(level)}`,
  ];
  const combo = toCount(bestCombo);
  if (mode !== "ZEN" && combo > 0) stats.push(`combo x${combo}`);

  const lines = [title, stats.join(" · ")];
  const bar = buildQualityBar(breakdown);
  if (bar) lines.push(bar);
  lines.push(GAME_URL);
  return lines.join("\n");
};
