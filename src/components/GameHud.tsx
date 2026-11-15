import { useI18n } from "../i18n/context";
import type { GameMode } from "../types";
import { getMedalName, type HudGoal } from "../modes/medals";

/** Time Attack timer turns critical (red, pulsing) at or below this. */
const TIMER_CRITICAL_SECONDS = 10;

interface GameHudProps {
  mode: GameMode;
  score: number;
  world: number;
  level: number;
  /** Time Attack seconds left (null before the first report). */
  timeRemaining: number | null;
  /** Zen lives left (null outside Zen). */
  zenLives: number | null;
  /** The run beat the previous best: the score pill turns gold. */
  recordPassed: boolean;
  reducedFx: boolean;
  /** The single goal chip (best to beat or next medal), if any. */
  goal: HudGoal | null;
  /** The run is a Daily Challenge (DAILY chip). */
  daily: boolean;
  /** Row 3 (STYLE/COMBO or Zen controls) is revealed. */
  showSecondary: boolean;
  styleScore: number;
  streak: number;
  bestStreak: number;
  onPause: () => void;
  onRestartShape: () => void;
  onUndo: () => void;
}

/** Pointer presses must not leave focus on a HUD button (Space would press it). */
const blurTarget = (event: { currentTarget: HTMLElement }) => event.currentTarget.blur();

/**
 * In-run HUD: the PAUSE corner button and the HUD rows (see CLAUDE.md "HUD
 * layout"): row 1 score + vital readout (Time Attack timer or Zen lives),
 * row 2 goal chip / W / L / DAILY, row 3 auto-revealed STYLE/COMBO or the Zen
 * RESTART/UNDO controls. Presentational: App owns every value and action.
 */
export function GameHud({
  mode,
  score,
  world,
  level,
  timeRemaining,
  zenLives,
  recordPassed,
  reducedFx,
  goal,
  daily,
  showSecondary,
  styleScore,
  streak,
  bestStreak,
  onPause,
  onRestartShape,
  onUndo,
}: GameHudProps) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <>
      <button
        className="pause-btn"
        onClick={(event) => {
          blurTarget(event);
          onPause();
        }}
        aria-label={t("hud.pauseAria")}
      >
        {t("hud.pause")}
      </button>

      <div className="hud">
        {/* Row 1: the score and the one vital readout (Time Attack timer or
            Zen lives), in a band that reserves the PAUSE corner so they can
            never slide under it (see .hud-top). Everything else lives in
            the always-visible meta row below. */}
        <div className="hud-top">
          <div
            className={`hud-row hud-primary ${
              recordPassed ? `is-record${reducedFx ? " reduced-fx" : ""}` : ""
            }`}
          >
            <span className="score score-readout">{score}</span>
            {mode === "TIME_ATTACK" && timeRemaining !== null && (
              <span
                className={`timer-badge ${
                  timeRemaining <= TIMER_CRITICAL_SECONDS ? "critical" : ""
                }`}
                role="timer"
                aria-label={t("hud.timerAria", { count: Math.ceil(timeRemaining) })}
              >
                {t("hud.timer", { seconds: Math.ceil(timeRemaining) })}
              </span>
            )}
            {mode === "ZEN" && (
              <span className={`lives-badge ${(zenLives ?? 0) <= 3 ? "critical" : ""}`}>
                {t("hud.lives", { lives: zenLives ?? 0 })}
              </span>
            )}
          </div>
        </div>
        <div className="hud-row hud-meta">
          {/* A single goal chip, no earned-medal glyph (the lane pill and
              the game over carry the medal itself). */}
          {goal?.kind === "best" && (
            <span className="pb-target" data-testid="pb-target">
              {t("hud.best", { score: goal.score })}
            </span>
          )}
          {goal?.kind === "medal" && (
            <span
              key={goal.medal}
              className={`medal-target medal--${goal.medal.toLowerCase()}${
                reducedFx ? " reduced-fx" : ""
              }`}
              data-testid="medal-target"
            >
              {t("hud.medalGoal", {
                medal: i18n.upper(getMedalName(i18n, goal.medal)),
                threshold: goal.threshold,
              })}
            </span>
          )}
          <span className="world-badge">{t("hud.world", { world })}</span>
          <span className="level-badge">{t("hud.level", { level })}</span>
          {daily && <span className="daily-badge">{t("hud.daily")}</span>}
        </div>
        <div
          className={`hud-row hud-secondary ${showSecondary ? "revealed" : "hidden"}`}
          aria-hidden={!showSecondary}
        >
          {mode !== "ZEN" && (
            <>
              <span className="style-badge">{t("hud.style", { score: styleScore })}</span>
              <span className={`streak-badge ${streak > 1 ? "active" : ""}`}>
                {t("hud.combo", { streak })}
              </span>
              <span className="best-streak-badge">
                {t("hud.bestCombo", { streak: bestStreak })}
              </span>
            </>
          )}
          {mode === "ZEN" && (
            <div className="zen-controls">
              <button
                className="restart-btn"
                data-ui-sound="none"
                onClick={(event) => {
                  blurTarget(event);
                  onRestartShape();
                }}
                aria-label={t("hud.zenRestartAria")}
              >
                {t("hud.zenRestart")}
              </button>
              <button
                className="undo-btn"
                data-ui-sound="none"
                onClick={(event) => {
                  blurTarget(event);
                  onUndo();
                }}
                aria-label={t("hud.zenUndoAria")}
              >
                {t("hud.zenUndo")}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
