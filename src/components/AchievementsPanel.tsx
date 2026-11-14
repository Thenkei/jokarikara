import { useMemo } from "react";
import { ACHIEVEMENTS, ACHIEVEMENT_COUNT } from "../progression/achievements";
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
        return { achievement, unlocked, progress };
      }),
    [record],
  );
  const unlockedCount = items.filter((item) => item.unlocked).length;

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
      <ul className="achievement-list">
        {items.map(({ achievement, unlocked, progress }) => (
          <li
            key={achievement.id}
            className={`achievement-item ${unlocked ? "unlocked" : "locked"}`}
            data-achievement-id={achievement.id}
          >
            <span className="achievement-mark" aria-hidden="true">
              {unlocked ? "◆" : "◇"}
            </span>
            <span className="achievement-text">
              <span className="achievement-title">{achievement.title}</span>
              <span className="achievement-desc">{achievement.description}</span>
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
      <button className="achievements-back-btn" data-ui-sound="back" onClick={onClose} autoFocus>
        BACK
      </button>
    </section>
  );
}
