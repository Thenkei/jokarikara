import type { EndReason, GameMode } from "../types";
import type { HapticPattern } from "../utils/haptics";
import type { Translator } from "../i18n";
import { getMedalTitle, type Medal } from "./medals";

/**
 * What the end of a run sounds, looks and feels like. Pure: GameCanvas asks
 * once per run, at the moment it ends, and only plays what it is told.
 *
 * Three endings, by why the run ended (`getEndReason`):
 * - a failure (Classic miss, Zen out of lives): the fail buzz, red shake +
 *   flash and the fail haptic, then the game over screen after a short beat;
 * - Time Attack's clock reaching 0 ("timeout"): the normal end of that mode,
 *   never punished like a mistake. A bell + cadence that resolves according
 *   to the result (neutral without a medal, richer per medal), one calm ring
 *   and flash in the world colour, a "TIME!" banner, a level-up haptic, and a
 *   longer beat before the game over screen so the banner reads.
 *   This also covers a miss whose −5 s penalty drains the clock: the clock
 *   hit 0, so it is a timeout (the miss played its own miss feedback first).
 * - Zen FINISH RUN ("finished"): the world's resolving chord, no visual
 *   effect, a level-up haptic, and the game over screen at once.
 */

/** Which run-ending cue the audio service plays. */
export type EndCue =
  | { readonly kind: "fail" }
  | { readonly kind: "finish" }
  | { readonly kind: "timeUp"; readonly medal: Medal | null };

/** Which canvas effect marks the end (`none`: the board stays as it is). */
export type EndEffect = "fail" | "timeUp" | "none";

/** Where the game over screen comes from after the end (see GameCanvas). */
export type EndHold = "fail" | "timeUp" | "none";

export interface EndFeedback {
  readonly cue: EndCue;
  readonly effect: EndEffect;
  readonly haptic: HapticPattern;
  /** How long the board stays before the game over screen. */
  readonly hold: EndHold;
  /** Whether the HUD shows the "TIME!" banner (and announces the result). */
  readonly timeUpBanner: boolean;
}

const FAIL: EndFeedback = Object.freeze({
  cue: Object.freeze({ kind: "fail" as const }),
  effect: "fail",
  haptic: "fail",
  hold: "fail",
  timeUpBanner: false,
});

const FINISH: EndFeedback = Object.freeze({
  cue: Object.freeze({ kind: "finish" as const }),
  effect: "none",
  haptic: "levelUp",
  // The player asked for it: no reason to keep them waiting.
  hold: "none",
  timeUpBanner: false,
});

/**
 * Feedback for a run that just ended. `medal` is the run's final medal
 * (`getMedal(score)` for a run that has medals, else null); only the
 * Time Attack timeout uses it. A null reason (not over) reads as a failure,
 * the conservative default for a caller that ended the run some other way.
 */
export const selectEndFeedback = (
  reason: EndReason | null,
  mode: GameMode,
  medal: Medal | null,
): EndFeedback => {
  if (reason === "finished") return FINISH;
  if (reason === "timeout" && mode === "TIME_ATTACK") {
    return {
      cue: { kind: "timeUp", medal },
      effect: "timeUp",
      haptic: "levelUp",
      hold: "timeUp",
      timeUpBanner: true,
    };
  }
  return FAIL;
};

/** What the TIME! moment reports to the HUD (banner + announcement). */
export interface TimeUpResult {
  readonly score: number;
  readonly medal: Medal | null;
}

/** Screen-reader text for the TIME! moment ("Time! Score 1240. Bronze medal"). */
export const getTimeUpAnnouncement = (
  i18n: Translator,
  { score, medal }: TimeUpResult,
): string =>
  medal === null
    ? i18n.t("announce.timeUp", { score })
    : i18n.t("announce.timeUpMedal", { score, medal: getMedalTitle(i18n, medal) });

/**
 * Game over headline: a finished Zen session and a Time Attack run that used
 * its clock are complete runs, not losses, so neither says GAME OVER.
 */
export const getGameOverHeadline = (
  i18n: Translator,
  reason: EndReason | null | undefined,
): string => {
  switch (reason) {
    case "finished":
      return i18n.t("gameOver.headlineFinished");
    case "timeout":
      return i18n.t("gameOver.headlineTimeUp");
    default:
      return i18n.t("gameOver.headline");
  }
};
