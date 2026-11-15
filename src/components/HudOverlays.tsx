import type { CSSProperties } from "react";
import { useI18n } from "../i18n/context";
import { Rich } from "../i18n/Rich";
import type { GameMode, StackQuality } from "../types";
import { getTimeBonus } from "../core/gameState";
import { getComboTier } from "../gameplay/combo";
import { RESUME_COUNTDOWN_STEP_MS } from "../gameplay/resumeCountdown";
import { getWorldName, getWorldTagline } from "../gameplay/worldText";
import { TIME_ATTACK_MISS_PENALTY } from "../constants/game";
import { getMedalName, getMedalTitle, type Medal } from "../modes/medals";
import type { TimeUpResult } from "../modes/endFeedback";
import { MedalGlyph } from "./MedalGlyph";

/**
 * MISS pop for a miss that did not end the run, with how far it was off;
 * `id` replays the animation for identical consecutive labels.
 */
export interface MissPop {
  readonly label: string | null;
  readonly id: number;
}

/** Last combo milestone reached (`id` replays the banner animation). */
export interface ComboBanner {
  readonly streak: number;
  readonly id: number;
}

interface HudOverlaysProps {
  mode: GameMode;
  world: number;
  level: number;
  reducedFx: boolean;
  /** Resume countdown digit (3, 2, 1); null when not counting down. */
  resumeDigit: number | null;
  /** First-ever run, nothing stacked yet, not paused. */
  showFirstRunHint: boolean;
  /** Quality of the last stack (PERFECT/GREAT/...); null before the first. */
  lastQuality: StackQuality | null;
  /** Bumped per stack: replays the quality and time bonus pops. */
  qualityPulseId: number;
  /** Bumped per Time Attack miss: replays the penalty pop (0 = none yet). */
  penaltyPulseId: number;
  /** Bumped per Zen life regained: replays the "+1 LIFE" pop (0 = none yet). */
  lifePulseId: number;
  missPop: MissPop | null;
  comboBanner: ComboBanner;
  /** Previous best the run just passed (record banner); null = no record yet. */
  passedBest: number | null;
  /** The run is a Daily Challenge (record banner wording). */
  daily: boolean;
  /** Latest Time Attack medal earned this run; null if none (or no medals). */
  medalEarned: Medal | null;
  /** Next medal to reach after `medalEarned`; null at the top or without medals. */
  medalTarget: { medal: Medal; threshold: number } | null;
  /** Time Attack clock ran out: the TIME! banner (with the medal, if any). */
  timeUp: TimeUpResult | null;
  showLevelUp: boolean;
  /** World overlay shown (short entry or a first-visit hold). */
  worldUpVisible: boolean;
  /** First-visit how-to line (the overlay holds the game); null otherwise. */
  introHowTo: string | null;
}

/**
 * Transient in-run overlays over the board, in stacking order: resume
 * countdown digit, first-run hint, stack quality, Time Attack bonus/penalty
 * pops, Zen "+1 LIFE" pop, MISS pop, combo / record / medal banners, TIME!, level up and the
 * world entry (or first-visit intro). Mostly decorative (`aria-hidden`): App
 * announces the same moments through its live region. Presentational: App
 * owns every value and when it shows.
 */
export function HudOverlays({
  mode,
  world,
  level,
  reducedFx,
  resumeDigit,
  showFirstRunHint,
  lastQuality,
  qualityPulseId,
  penaltyPulseId,
  lifePulseId,
  missPop,
  comboBanner,
  passedBest,
  daily,
  medalEarned,
  medalTarget,
  timeUp,
  showLevelUp,
  worldUpVisible,
  introHowTo,
}: HudOverlaysProps) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <>
      {resumeDigit !== null && (
        // Decorative: the live region announces "Resuming in 3" once.
        // pointer-events: none, so taps reach the (frozen) board and are
        // ignored there like any tap while paused.
        <div
          className="resume-countdown"
          data-testid="resume-countdown"
          aria-hidden="true"
          style={{ "--resume-step": `${RESUME_COUNTDOWN_STEP_MS}ms` } as CSSProperties}
        >
          <span
            key={resumeDigit}
            className={`resume-countdown-digit${reducedFx ? " reduced-fx" : ""}`}
          >
            {resumeDigit}
          </span>
        </div>
      )}

      {showFirstRunHint && (
        <div className="first-run-hint" role="status">
          <p className="first-run-hint-title">{t("firstRun.title")}</p>
          <p className="first-run-hint-body">
            <Rich
              template={i18n.template("firstRun.body")}
              slots={{
                perfect: <span className="first-run-hint-perfect">{t("quality.PERFECT")}</span>,
              }}
            />
          </p>
        </div>
      )}

      {lastQuality && (
        <div
          key={`quality-${qualityPulseId}`}
          className={`quality-overlay quality-${lastQuality.toLowerCase()}`}
        >
          {t(`quality.${lastQuality}`)}
        </div>
      )}

      {mode === "TIME_ATTACK" && lastQuality && getTimeBonus(lastQuality) > 0 && (
        <div key={`bonus-${qualityPulseId}`} className="time-bonus-pop" aria-hidden="true">
          {t("hud.timeBonus", { seconds: getTimeBonus(lastQuality) })}
        </div>
      )}

      {mode === "TIME_ATTACK" && penaltyPulseId > 0 && TIME_ATTACK_MISS_PENALTY !== undefined && (
        <div
          key={`penalty-${penaltyPulseId}`}
          className="time-penalty-pop danger-signal"
          aria-hidden="true"
        >
          {t("hud.timePenalty", { seconds: TIME_ATTACK_MISS_PENALTY })}
        </div>
      )}

      {mode === "ZEN" && lifePulseId > 0 && (
        // Decorative: the live region announces the life regained.
        <div
          key={`life-${lifePulseId}`}
          className="time-bonus-pop life-regain-pop"
          data-testid="life-regain-pop"
          aria-hidden="true"
        >
          {t("hud.lifeRegained")}
        </div>
      )}

      {missPop && (
        // Decorative: the live region announces the miss and its margin.
        <div
          key={`miss-${missPop.id}`}
          className="miss-pop danger-signal"
          data-testid="miss-pop"
          aria-hidden="true"
        >
          <span className="miss-pop-title">{t("hud.miss")}</span>
          {missPop.label && <span className="miss-pop-margin">{missPop.label}</span>}
        </div>
      )}

      {comboBanner.streak > 0 && mode !== "ZEN" && (
        <div
          key={`combo-${comboBanner.id}`}
          className={`combo-milestone combo-tier-${getComboTier(comboBanner.streak)}`}
          role="status"
        >
          {t("banner.combo", { streak: comboBanner.streak })}
        </div>
      )}

      {passedBest !== null && (
        // Decorative: the live region announces it (no double read-out).
        <div
          className={`record-milestone ${reducedFx ? "reduced-fx" : ""}`}
          data-testid="record-banner"
          aria-hidden="true"
        >
          <span className="record-milestone-title">
            {t(daily ? "banner.newDailyBest" : "banner.newBest")}
          </span>
          <span className="record-milestone-sub">
            {t("banner.pastBest", { score: passedBest })}
          </span>
        </div>
      )}

      {medalEarned && (
        // Decorative: the live region announces it (no double read-out).
        <div
          key={`medal-${medalEarned}`}
          className={`medal-milestone medal--${medalEarned.toLowerCase()}${
            reducedFx ? " reduced-fx" : ""
          }`}
          data-testid="medal-banner"
          aria-hidden="true"
        >
          <MedalGlyph medal={medalEarned} />
          <span className="medal-milestone-text">
            <span className="medal-milestone-title">
              {i18n.upper(getMedalTitle(i18n, medalEarned))}
            </span>
            {medalTarget && (
              <span className="medal-milestone-sub">
                {t("banner.nextMedal", {
                  medal: i18n.upper(getMedalName(i18n, medalTarget.medal)),
                  threshold: medalTarget.threshold,
                })}
              </span>
            )}
          </span>
        </div>
      )}

      {timeUp && (
        // Decorative: the live region announces the result (no double
        // read-out). The level-up pop's styles, in the world colour.
        <div
          className={`level-up-overlay time-up-overlay${reducedFx ? " reduced-fx" : ""}`}
          data-testid="time-up-banner"
          aria-hidden="true"
        >
          <span className="level-up-text time-up-text">{t("banner.timeUp")}</span>
          {timeUp.medal && (
            <span className={`time-up-medal medal--${timeUp.medal.toLowerCase()}`}>
              <MedalGlyph medal={timeUp.medal} />
              {i18n.upper(getMedalTitle(i18n, timeUp.medal))}
            </span>
          )}
        </div>
      )}

      {showLevelUp && !worldUpVisible && !timeUp && (
        <div className="level-up-overlay">
          <span className="level-up-text">{t("banner.level", { level })}</span>
        </div>
      )}
      {worldUpVisible && (
        // Decorative: the live region announces the world (and, on a
        // first visit, its how-to line). pointer-events: none, so a tap
        // anywhere reaches the board, which dismisses a first-visit hold.
        <div
          className={`world-up-overlay${introHowTo ? " world-up-overlay--teach" : ""}${
            reducedFx ? " reduced-fx" : ""
          }`}
          data-testid="world-up"
          aria-hidden="true"
        >
          <span className="world-up-title">{t("banner.newWorld")}</span>
          <span className="world-up-text">{t("banner.world", { world })}</span>
          <span className="world-up-name">{getWorldName(i18n, world)}</span>
          <span className="world-up-tagline">{getWorldTagline(i18n, world)}</span>
          {introHowTo && (
            <>
              <span className="world-up-howto" data-testid="world-up-howto">
                {introHowTo}
              </span>
              <span className="world-up-continue">{t("banner.tapToPlay")}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}
