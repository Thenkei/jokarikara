import { useState } from "react";
import type { GameMode, RunStats } from "../types";
import type { HighScore } from "../utils/storage";
import type { EndInsight, QualityBreakdown } from "../modes/runInsights";
import { QUALITY_ORDER } from "../modes/runInsights";
import { formatDailyLabel } from "../modes/daily";
import { LEVELS_PER_WORLD } from "../constants/game";
import { getAchievement, type AchievementId } from "../progression/achievements";

export type ShareStatus = "idle" | "copied" | "shared" | "failed";

export interface DailyRunResult {
  dateKey: string;
  best: number;
  attempts: number;
}

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
  /** Short mode label for the leaderboard heading ("CLASSIC", "TIME"...). */
  modeLabel: string;
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
  onShare: () => void;
  onRetry: () => void;
  onMenu: () => void;
}

/** Chips shown before "+N more"; a lone extra chip is shown rather than hidden. */
const VISIBLE_UNLOCKS = 4;

/** Absolute level reached across worlds (world 5 level 3 → 23). */
const levelsReached = (world: number, level: number): number =>
  (world - 1) * LEVELS_PER_WORLD + level;

const SHARE_STATUS_TEXT: Record<ShareStatus, string> = {
  idle: "",
  copied: "Copied to clipboard",
  shared: "Shared!",
  failed: "Sharing unavailable",
};

function RunAchievements({ ids }: { ids: readonly AchievementId[] }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = ids.length > VISIBLE_UNLOCKS + 1;
  const shown = collapsible && !expanded ? ids.slice(0, VISIBLE_UNLOCKS) : ids;
  const hiddenCount = ids.length - shown.length;

  return (
    <section className="run-achievements gameover-card" aria-labelledby="run-achievements-heading">
      <h3 id="run-achievements-heading">
        UNLOCKED THIS RUN <span className="run-achievements-count">{ids.length}</span>
      </h3>
      <ul id="run-achievements-list">
        {shown.map((id) => (
          <li key={id}>{getAchievement(id).title}</li>
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
              {expanded ? "SHOW LESS" : `+${hiddenCount} MORE`}
            </button>
          </li>
        )}
      </ul>
    </section>
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
  modeLabel,
  score,
  world,
  level,
  topScores,
  stackCount,
  endInsight,
  breakdown,
  shareStatus,
  onShare,
  onRetry,
  onMenu,
}: GameOverScreenProps) {
  const breakdownTotal = QUALITY_ORDER.reduce((sum, q) => sum + breakdown[q], 0);

  return (
    <div className="screen gameover-screen">
      <div className="gameover-body">
        <header className="gameover-hero">
          <h1 className="title gameover-title">GAME OVER</h1>
          {run?.practiceWorld && (
            <p className="practice-result-label">
              PRACTICE · FROM WORLD {run.practiceWorld}
            </p>
          )}
          {run?.daily && (
            <p className="daily-result-label">
              DAILY · {formatDailyLabel(run.daily.dateKey)}
            </p>
          )}
          <p className="score-display">
            <span className="visually-hidden">Score: </span>
            {score}
          </p>
          <div className="gameover-meta">
            <p className="final-level">
              WORLD {world}
              <span className="gameover-meta-sep" aria-hidden="true">
                {" · "}
              </span>
              <span className="visually-hidden">, </span>
              LEVEL {level}
            </p>
            {run?.isNewBest && (
              <span className="new-best-badge" role="status">
                NEW BEST
              </span>
            )}
          </div>
        </header>

        <div className="gameover-cards">
          <div className="gameover-col">
            <section className="gameover-card gameover-run" aria-label="Run stats">
              <dl className="run-stats">
                <div>
                  <dt>STACKS</dt>
                  <dd className="stat-stacks">{stackCount}</dd>
                </div>
                <div>
                  <dt>PERFECT</dt>
                  <dd className="stat-perfect">{run?.stats.perfectCount ?? 0}</dd>
                </div>
                {mode !== "ZEN" && (
                  <div>
                    <dt>BEST COMBO</dt>
                    <dd className="stat-combo">x{run?.stats.bestStreak ?? 0}</dd>
                  </div>
                )}
                <div title="Levels reached across all worlds">
                  <dt>LEVELS</dt>
                  <dd className="stat-levels">{levelsReached(world, level)}</dd>
                </div>
              </dl>
              {breakdownTotal > 0 && (
                <div className="quality-breakdown" aria-label="Stack quality breakdown">
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
                        {q} <strong>{breakdown[q]}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            {endInsight && (
              <div className="gameover-card end-insight" role="status">
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
                <h3>PRACTICE RUN</h3>
                <p>Practice runs don't count toward scores or achievements.</p>
              </div>
            ) : run?.daily ? (
              <div className="leaderboard gameover-card daily-summary">
                <h3>TODAY</h3>
                <p className="daily-summary-line">
                  BEST <strong>{run.daily.best}</strong> · {run.daily.attempts}{" "}
                  {run.daily.attempts === 1 ? "TRY" : "TRIES"}
                </p>
              </div>
            ) : (
              <div className="leaderboard gameover-card">
                <h3>TOP SCORES - {modeLabel}</h3>
                {topScores.length === 0 ? (
                  <p>No high scores yet!</p>
                ) : (
                  <ul>
                    {topScores.map((hs, idx) => (
                      <li
                        key={idx}
                        className={run?.isNewBest && idx === 0 ? "current-best" : undefined}
                      >
                        <span>#{idx + 1}</span>
                        <span>{hs.score}</span>
                        <span>{hs.date}</span>
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
            {SHARE_STATUS_TEXT[shareStatus]}
          </p>
        )}
        <button className="retry-btn" data-ui-sound="confirm" onClick={onRetry}>
          RETRY
        </button>
        <div className="gameover-actions-secondary">
          {run && (
            <button className="share-btn" data-ui-sound="confirm" onClick={onShare}>
              SHARE RESULT
            </button>
          )}
          <button className="menu-btn" data-ui-sound="back" onClick={onMenu}>
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
