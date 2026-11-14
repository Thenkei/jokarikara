import type { DailyStreakLabel } from "../modes/dailyStreak";

/**
 * Daily streak chip with a small flame drawn in SVG (no emoji font needed;
 * follows `currentColor`). Decorative only: the streak is part of the
 * accessible name of whatever contains it.
 */
export function StreakChip({ label }: { label: DailyStreakLabel }) {
  return (
    <span className={`streak-chip streak-chip--${label.state}`} aria-hidden="true">
      <svg className="streak-flame" viewBox="0 0 12 16" focusable="false">
        <path
          d="M6 0.6c0.5 2.4 3 3.9 4.3 6.4 1.6 3.1 0.3 7.9-4.3 8.4-4.1-0.3-5.9-3.7-4.8-7.1 0.3 1.3 1.1 2.2 2 2.4-0.8-3.6 1.6-6.1 2.8-10.1z"
          fill="currentColor"
        />
        <path
          d="M6.2 8.2c1.6 1.4 2.2 3.1 1.6 4.5-0.4 1-1.2 1.5-2 1.5-1.2-0.1-2-1.1-1.8-2.4 0.4 0.4 0.9 0.6 1.3 0.5-0.4-1.6 0.2-3 0.9-4.1z"
          className="streak-flame-core"
        />
      </svg>
      {label.text}
    </span>
  );
}
