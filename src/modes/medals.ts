import type { GameMode } from "../types";

/**
 * Time Attack medals: Bronze / Silver / Gold goals for the final score.
 * Pure; App keeps the run latch in a ref and only re-renders on a crossing.
 *
 * Thresholds were calibrated with a 60 Hz simulation of the real pure game
 * functions (growth, zoom, timer bonuses and penalties, fractures, bosses,
 * containment) and a player model per profile (300 seeded runs each):
 *
 *   profile                         median   reaches B / S / G
 *   casual, mostly GOOD, 8% misses     945       41% /  8% /  0%
 *   consistent GREAT, 5% misses       1110       62% / 25% /  2%
 *   PERFECT streaks, 2% misses        1565       90% / 52% / 26%
 *
 * Bronze is a solid casual run, Silver a good run of a consistently GREAT
 * player, Gold a good run of PERFECT streaks. The score only counts stack
 * quality (combo feeds STYLE, not the score); the time bonuses are what make
 * precision pay, by buying more stacks.
 */

export const MEDALS = ["BRONZE", "SILVER", "GOLD"] as const;
export type Medal = (typeof MEDALS)[number];

/** Minimum final score (inclusive) for each medal. Strictly increasing. */
export const MEDAL_THRESHOLDS: Readonly<Record<Medal, number>> = Object.freeze({
  BRONZE: 1000,
  SILVER: 1500,
  GOLD: 2200,
});

export const MEDAL_LABELS: Readonly<Record<Medal, string>> = Object.freeze({
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
});

/**
 * Crossing cue strength: the combo fanfare tier played for each medal (a
 * longer rising run for a bigger medal), reusing that sound's mix level.
 */
export const MEDAL_CUE_TIER: Readonly<Record<Medal, number>> = Object.freeze({
  BRONZE: 2,
  SILVER: 3,
  GOLD: 5,
});

/** Only regular Time Attack runs have medals (Daily is Classic rules). */
export const hasMedals = (mode: GameMode, daily: boolean, practice: boolean): boolean =>
  mode === "TIME_ATTACK" && !daily && !practice;

/** Non-negative integer score; anything unusable reads as 0. */
const toScore = (score: number): number =>
  Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;

const rank = (medal: Medal | null): number => (medal === null ? -1 : MEDALS.indexOf(medal));

/** Highest medal reached by `score` (thresholds are inclusive), or null. */
export const getMedal = (score: number): Medal | null => {
  const value = toScore(score);
  let earned: Medal | null = null;
  for (const medal of MEDALS) {
    if (value >= MEDAL_THRESHOLDS[medal]) earned = medal;
  }
  return earned;
};

/** The medal above `medal` (null = none yet), or null after Gold. */
export const getMedalAfter = (medal: Medal | null): Medal | null =>
  MEDALS[rank(medal) + 1] ?? null;

export interface NextMedal {
  readonly medal: Medal;
  readonly threshold: number;
  /** Points still missing (always >= 1). */
  readonly toGo: number;
}

/** Next medal still out of reach for `score`, or null once Gold is earned. */
export const getNextMedal = (score: number): NextMedal | null => {
  const medal = getMedalAfter(getMedal(score));
  if (medal === null) return null;
  const threshold = MEDAL_THRESHOLDS[medal];
  return { medal, threshold, toGo: threshold - toScore(score) };
};

export interface MedalResult {
  readonly earned: Medal | null;
  readonly next: NextMedal | null;
}

/** What the game over screen shows for a final score. */
export const getMedalResult = (score: number): MedalResult => ({
  earned: getMedal(score),
  next: getNextMedal(score),
});

/** Share text label, word only (no emoji): "Gold medal". */
export const getMedalShareLabel = (medal: Medal): string => `${MEDAL_LABELS[medal]} medal`;

// ---------------------------------------------------------------------------
// In-run latch: one cue per medal, never per frame
// ---------------------------------------------------------------------------

export interface MedalRunState {
  /** False for runs without medals: every step is then a no-op. */
  readonly enabled: boolean;
  /** Highest medal reached this run; never goes down. */
  readonly earned: Medal | null;
}

export const createMedalRun = (enabled: boolean): MedalRunState => ({
  enabled,
  earned: null,
});

export interface MedalStep {
  state: MedalRunState;
  /**
   * The medal reached by this score update, only on the update that first
   * reaches it. If one update skipped a medal (not possible with today's
   * points per stack), the highest one is reported: one cue per update.
   */
  crossed: Medal | null;
}

/** Feeds a new score. Returns the same state object when nothing changes. */
export const advanceMedalRun = (state: MedalRunState, score: number): MedalStep => {
  if (!state.enabled) return { state, crossed: null };
  const medal = getMedal(score);
  if (rank(medal) <= rank(state.earned)) return { state, crossed: null };
  return { state: { ...state, earned: medal }, crossed: medal };
};

/** HUD target: the next medal after the one earned, null once Gold is in. */
export const getMedalTarget = (
  earned: Medal | null,
): { medal: Medal; threshold: number } | null => {
  const medal = getMedalAfter(earned);
  return medal === null ? null : { medal, threshold: MEDAL_THRESHOLDS[medal] };
};

export type HudGoal =
  | { readonly kind: "best"; readonly score: number }
  | { readonly kind: "medal"; readonly medal: Medal; readonly threshold: number };

/**
 * The single goal the HUD shows: whichever of the personal best and the next
 * medal the score reaches first. The primary pill has no room for both on a
 * 375-390 px phone (it would run under PAUSE), and the nearer goal is the one
 * worth chasing now; the other one takes over as soon as it is passed, so a
 * run reads as a ladder (BRONZE 1000 → SILVER 1500 → BEST 1800 → GOLD 2200).
 * The best is beaten only strictly above it, so it needs `best + 1` points;
 * on a tie the medal wins (reaching it beats the best on the same stack).
 */
export const selectHudGoal = (
  personalBest: number | null,
  medal: { medal: Medal; threshold: number } | null,
): HudGoal | null => {
  const best = personalBest !== null && Number.isFinite(personalBest) ? personalBest : null;
  if (best === null) return medal ? { kind: "medal", ...medal } : null;
  if (medal === null || best + 1 < medal.threshold) return { kind: "best", score: best };
  return { kind: "medal", ...medal };
};

/** Screen-reader text for a crossing (the banner itself is decorative). */
export const getMedalAnnouncement = (medal: Medal): string => {
  const next = getMedalTarget(medal);
  return next === null
    ? `${MEDAL_LABELS[medal]} medal. Top medal earned`
    : `${MEDAL_LABELS[medal]} medal. Next: ${MEDAL_LABELS[next.medal]} at ${next.threshold}`;
};
