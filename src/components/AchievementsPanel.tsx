import { useEffect, useMemo, useRef } from "react";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_COUNT,
  HIDDEN_ACHIEVEMENT_TEXT,
} from "../progression/achievements";
import { buildStatRows, isFirstEverProfile } from "../progression/stats";
import type { AchievementRecord } from "../utils/storage";

interface AchievementsPanelProps {
  record: AchievementRecord;
  onClose: () => void;
}

/** Menu sub-screen listing every achievement, locked ones greyed out. */
export function AchievementsPanel({ record, onClose }: AchievementsPanelProps) {
  const items = useMemo(
    () =>
      ACHIEVEMENTS.map((achievement) => {
        const unlocked = record.unlocked[achievement.id] !== undefined;
        const progress =
          !unlocked && achievement.progress
            ? achievement.progress({ run: null, lifetime: record.lifetime })
            : null;
        // A locked secret keeps its title and description to itself.
        const text =
          achievement.hidden && !unlocked ? HIDDEN_ACHIEVEMENT_TEXT : achievement;
        return { achievement, unlocked, progress, text };
      }),
    [record],
  );
  const unlockedCount = items.filter((item) => item.unlocked).length;
  // Keyboard focus starts on BACK, but without scrolling to it: on a phone
  // the panel overflows and autoFocus would open it scrolled to the bottom,
  // hiding the heading and stats.
  const backButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, []);
  // "Today" is sampled when the panel opens (it remounts on every open), so
  // the daily streak can only be stale if the panel stays open past midnight.
  const statRows = useMemo(
    () =>
      isFirstEverProfile(record.lifetime)
        ? null
        : buildStatRows(record.lifetime, new Date()),
    [record.lifetime],
  );

  return (
    <section
      className="screen achievements-screen"
      aria-labelledby="achievements-heading"
    >
      <h2 id="achievements-heading" className="achievements-heading">
        ACHIEVEMENTS
      </h2>
      <p className="achievements-count">
        {unlockedCount} / {ACHIEVEMENT_COUNT} UNLOCKED
      </p>
      {statRows && (
        <section className="lifetime-stats" aria-labelledby="lifetime-stats-heading">
          <h3 id="lifetime-stats-heading" className="lifetime-stats-heading">
            STATS
          </h3>
          <dl className="lifetime-stats-list">
            {statRows.map((row) => (
              <div key={row.id} className="lifetime-stat" data-stat-id={row.id}>
                <dt className="lifetime-stat-label">{row.label}</dt>
                <dd className="lifetime-stat-value">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <ul className="achievement-list">
        {items.map(({ achievement, unlocked, progress, text }) => (
          <li
            key={achievement.id}
            className={`achievement-item ${unlocked ? "unlocked" : "locked"}${
              achievement.hidden ? " hidden-achievement" : ""
            }`}
            data-achievement-id={achievement.id}
          >
            <span className="achievement-mark" aria-hidden="true">
              {unlocked ? "◆" : "◇"}
            </span>
            <span className="achievement-text">
              <span className="achievement-title">{text.title}</span>
              <span className="achievement-desc">{text.description}</span>
            </span>
            {progress && progress.current > 0 && (
              <span
                className="achievement-progress"
                aria-label={`${progress.current} of ${progress.target}`}
              >
                {progress.current}/{progress.target}
              </span>
            )}
            <span className="visually-hidden">
              {unlocked ? "Unlocked" : "Locked"}
            </span>
          </li>
        ))}
      </ul>
      <button
        ref={backButtonRef}
        className="achievements-back-btn"
        data-ui-sound="back"
        onClick={onClose}
      >
        BACK
      </button>
    </section>
  );
}
