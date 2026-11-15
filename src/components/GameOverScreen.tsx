import { useState } from "react";
import { useI18n } from "../i18n/context";
import { Rich } from "../i18n/Rich";
import type { GameMode, RunStats } from "../types";
import type { HighScore } from "../utils/storage";
import type { EndInsight, QualityBreakdown } from "../modes/runInsights";
import { QUALITY_ORDER } from "../modes/runInsights";
import { formatDailyLabel } from "../modes/daily";
import { LEVELS_PER_WORLD } from "../constants/game";
import { getAchievementTitle, type AchievementId } from "../progression/achievements";
import type { DailyCountdown, DailyStreakLabel } from "../modes/dailyStreak";
import { StreakChip } from "./StreakChip";
import { MedalGlyph } from "./MedalGlyph";
import { getMedalName, getMedalTitle, type MedalResult } from "../modes/medals";
import { getGameOverHeadline } from "../modes/endFeedback";
import { formatScoreDate } from "../modes/scoreDate";

export type ShareStatus = "idle" | "copied" | "shared" | "failed";

export interface DailyRunResult {
  dateKey: string;
  best: number;
  attempts: number;
}

/**
 * After a Daily: time left until the next one, or "ready" once the day the
 * run was played has ended (RETRY then starts the new day's challenge).
 */
export type NextDailyStatus =
  | { readonly kind: "countdown"; readonly countdown: DailyCountdown }
  | { readonly kind: "ready" };

/** What the game over screen knows about the run that just ended. */
export interface GameOverRun {
  mode: GameMode;
  /** World a practice run started at; null for regular runs. */
  practiceWorld: number | null;
  isNewBest: boolean;
  stats: RunStats;
  scores: readonly HighScore[];
  daily: DailyRunResult | null;
  /** Unlocked during this run (live and at game over). */
  achievements: readonly AchievementId[];
}

interface GameOverScreenProps {
  run: GameOverRun | null;
  mode: GameMode;
  score: number;
  world: number;
  level: number;
  /** Current top scores for `mode` (already include this run). */
  topScores: readonly HighScore[];
  /** Stacks made this run (practice runs exclude the skipped worlds). */
  stackCount: number;
  endInsight: EndInsight | null;
  breakdown: QualityBreakdown;
  shareStatus: ShareStatus;
  /** Time Attack runs only: medal earned and the next goal. */
  medal?: MedalResult | null;
  /** Daily runs only: current streak (null below two days). */
  dailyStreak?: DailyStreakLabel | null;
  /** Daily runs only: when the next challenge unlocks. */
  nextDaily?: NextDailyStatus | null;
  onShare: () => void;
  onRetry: () => void;
  onMenu: () => void;
}

/** Chips shown before "+N more"; a lone extra chip is shown rather than hidden. */
const VISIBLE_UNLOCKS = 4;

/** Absolute level reached across worlds (world 5 level 3 → 23). */
const levelsReached = (world: number, level: number): number =>
  (world - 1) * LEVELS_PER_WORLD + level;

const SHARE_STATUS_KEYS = {
  copied: "share.copied",
  shared: "share.shared",
  failed: "share.failed",
} as const;

function RunAchievements({ ids }: { ids: readonly AchievementId[] }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [expanded, setExpanded] = useState(false);
  const collapsible = ids.length > VISIBLE_UNLOCKS + 1;
  const shown = collapsible && !expanded ? ids.slice(0, VISIBLE_UNLOCKS) : ids;
  const hiddenCount = ids.length - shown.length;

  return (
    <section className="run-achievements gameover-card" aria-labelledby="run-achievements-heading">
      <h3 id="run-achievements-heading">
        {t("gameOver.unlocked")}{" "}
        <span className="run-achievements-count">{ids.length}</span>
      </h3>
      <ul id="run-achievements-list">
        {shown.map((id) => (
          <li key={id}>{getAchievementTitle(i18n, id)}</li>
        ))}
        {collapsible && (
          <li className="run-achievements-more">
            <button
              type="button"
              className="run-achievements-toggle"
              aria-expanded={expanded}
              aria-controls="run-achievements-list"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? t("gameOver.showLess")
                : t("gameOver.showMore", { count: hiddenCount })}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/** Medal under the score: earned metal (or an empty slot) and what is next. */
function MedalSummary({ result }: { result: MedalResult }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { earned, next } = result;
  return (
    <div
      className={`gameover-medal medal--${earned ? earned.toLowerCase() : "none"}`}
      data-testid="gameover-medal"
    >
      <MedalGlyph medal={earned} />
      <p className="gameover-medal-text">
        <span className="gameover-medal-title">
          {earned ? i18n.upper(getMedalTitle(i18n, earned)) : t("medal.none")}
        </span>
        {next && (
          <span className="gameover-medal-next">
            <span className="visually-hidden">. </span>
            {t("medal.nextAt", {
              medal: getMedalName(i18n, next.medal),
              threshold: next.threshold,
            })}
            <span aria-hidden="true"> · </span>
            <span className="visually-hidden">, </span>
            {t("medal.toGo", { points: next.toGo })}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Game over: score hero, grouped run cards in a scrollable body and an action
 * bar (RETRY / share / menu) that never scrolls out of view. Presentational:
 * every decision about the run (records, share text) is made by the caller.
 */
export function GameOverScreen({
  run,
  mode,
  score,
  world,
  level,
  topScores,
  stackCount,
  endInsight,
  breakdown,
  shareStatus,
  medal = null,
  dailyStreak = null,
  nextDaily = null,
  onShare,
  onRetry,
  onMenu,
}: GameOverScreenProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const breakdownTotal = QUALITY_ORDER.reduce((sum, q) => sum + breakdown[q], 0);

  return (
    <div className="screen gameover-screen">
      {/* Focusable: on a phone the cards scroll, and keyboard users need a
          stop to scroll them (there is no control inside to land on). */}
      <div
        className="gameover-body"
        tabIndex={0}
        role="region"
        aria-label={t("gameOver.summary")}
      >
        <header className="gameover-hero">
          <h1 className="title gameover-title">
            {getGameOverHeadline(i18n, run?.stats.endReason)}
          </h1>
          {run?.practiceWorld && (
            <p className="practice-result-label">
              {t("gameOver.practiceFrom", { world: run.practiceWorld })}
            </p>
          )}
          {run?.daily && (
            <p className="daily-result-label">
              {t("gameOver.daily", { date: formatDailyLabel(i18n, run.daily.dateKey) })}
            </p>
          )}
          <p className="score-display">
            <span className="visually-hidden">{t("gameOver.scoreLabel")}</span>
            {score}
          </p>
          <div className="gameover-meta">
            <p className="final-level">
              {t("gameOver.world", { world })}
              <span className="gameover-meta-sep" aria-hidden="true">
                {" · "}
              </span>
              <span className="visually-hidden">, </span>
              {t("gameOver.level", { level })}
            </p>
            {run?.isNewBest && (
              <span className="new-best-badge" role="status">
                {t("gameOver.newBest")}
              </span>
            )}
          </div>
          {medal && <MedalSummary result={medal} />}
        </header>

        <div className="gameover-cards">
          <div className="gameover-col">
            <section className="gameover-card gameover-run" aria-label={t("gameOver.runStats")}>
              <dl className="run-stats">
                <div>
                  <dt>{t("gameOver.stacks")}</dt>
                  <dd className="stat-stacks">{stackCount}</dd>
                </div>
                <div>
                  <dt>{t("gameOver.perfect")}</dt>
                  <dd className="stat-perfect">{run?.stats.perfectCount ?? 0}</dd>
                </div>
                {mode !== "ZEN" && (
                  <div>
                    <dt>{t("gameOver.bestCombo")}</dt>
                    <dd className="stat-combo">x{run?.stats.bestStreak ?? 0}</dd>
                  </div>
                )}
                <div title={t("gameOver.levelsHint")}>
                  <dt>{t("gameOver.levels")}</dt>
                  <dd className="stat-levels">{levelsReached(world, level)}</dd>
                </div>
              </dl>
              {breakdownTotal > 0 && (
                // A name is only allowed on a role: group the legend under it.
                <div
                  className="quality-breakdown"
                  role="group"
                  aria-label={t("gameOver.breakdown")}
                >
                  <div className="quality-breakdown-bar" aria-hidden="true">
                    {QUALITY_ORDER.map((q) =>
                      breakdown[q] > 0 ? (
                        <span
                          key={q}
                          className={`quality-segment quality-segment--${q.toLowerCase()}`}
                          style={{ flexGrow: breakdown[q] }}
                        />
                      ) : null,
                    )}
                  </div>
                  <ul className="quality-breakdown-legend">
                    {QUALITY_ORDER.map((q) => (
                      <li key={q} className={`quality-legend--${q.toLowerCase()}`}>
                        {t(`quality.${q}`)} <strong>{breakdown[q]}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            {endInsight && (
              <div
                className={`gameover-card end-insight ${
                  endInsight.tone === "calm" ? "end-insight--calm" : "danger-signal"
                }`}
                role="status"
              >
                {endInsight.margin && (
                  <p className="end-insight-margin">{endInsight.margin}</p>
                )}
                {endInsight.marginHint && (
                  <p className="end-insight-hint">{endInsight.marginHint}</p>
                )}
                <p className="end-insight-title">{endInsight.title}</p>
                <p className="end-insight-tip">{endInsight.tip}</p>
              </div>
            )}
          </div>

          <div className="gameover-col">
            {run && run.achievements.length > 0 && (
              <RunAchievements ids={run.achievements} />
            )}
            {run?.practiceWorld ? (
              <div className="leaderboard gameover-card practice-summary">
                <h3>{t("gameOver.practiceTitle")}</h3>
                <p>{t("gameOver.practiceBody")}</p>
              </div>
            ) : run?.daily ? (
              <div className="leaderboard gameover-card daily-summary">
                <h3>{t("gameOver.today")}</h3>
                <p className="daily-summary-line">
                  <Rich
                    template={i18n.template("gameOver.dailyLine")}
                    slots={{
                      best: <strong>{run.daily.best}</strong>,
                      tries: t("daily.tries", { count: run.daily.attempts }),
                    }}
                  />
                </p>
                {dailyStreak && (
                  <p className="daily-summary-streak">
                    <span className="visually-hidden">{dailyStreak.spoken}</span>
                    <StreakChip label={dailyStreak} />
                  </p>
                )}
                {nextDaily?.kind === "countdown" && (
                  <p className="daily-next">
                    <span aria-hidden="true">
                      <Rich
                        template={i18n.template("daily.nextIn")}
                        slots={{ time: <strong>{nextDaily.countdown.text}</strong> }}
                      />
                    </span>
                    <span className="visually-hidden">
                      {t("daily.nextInSpoken", { time: nextDaily.countdown.spoken })}
                    </span>
                  </p>
                )}
                {nextDaily?.kind === "ready" && (
                  <p className="daily-next daily-next--ready">{t("daily.nextReady")}</p>
                )}
              </div>
            ) : (
              <div className="leaderboard gameover-card">
                <h3>{t("gameOver.topScores", { mode: t(`mode.${mode}.label`) })}</h3>
                {topScores.length === 0 ? (
                  <p>{t("gameOver.noScores")}</p>
                ) : (
                  <ul>
                    {topScores.map((hs, idx) => (
                      <li
                        key={idx}
                        className={run?.isNewBest && idx === 0 ? "current-best" : undefined}
                      >
                        <span>#{idx + 1}</span>
                        <span>{hs.score}</span>
                        <span>{formatScoreDate(i18n, hs.date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="gameover-actions">
        {run && (
          <p className="share-status" role="status">
            {shareStatus === "idle" ? "" : t(SHARE_STATUS_KEYS[shareStatus])}
          </p>
        )}
        <button className="retry-btn" data-ui-sound="confirm" onClick={onRetry}>
          {t("gameOver.retry")}
        </button>
        <div className="gameover-actions-secondary">
          {run && (
            <button className="share-btn" data-ui-sound="confirm" onClick={onShare}>
              {t("gameOver.share")}
            </button>
          )}
          <button className="menu-btn" data-ui-sound="back" onClick={onMenu}>
            {t("gameOver.mainMenu")}
          </button>
        </div>
      </div>
    </div>
  );
}
