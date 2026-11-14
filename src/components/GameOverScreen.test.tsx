import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameOverScreen, type GameOverRun } from "./GameOverScreen";
import { ACHIEVEMENT_IDS } from "../progression/achievements";
import { selectStreakLabel } from "../modes/dailyStreak";

const RUN: GameOverRun = {
  mode: "CLASSIC",
  practiceWorld: null,
  isNewBest: true,
  stats: { stackCount: 60, perfectCount: 20, bestStreak: 12, scoreHistory: [] },
  scores: [{ score: 3300, date: "11/14/2026" }],
  daily: null,
  achievements: [],
};

const renderScreen = (overrides: Partial<Parameters<typeof GameOverScreen>[0]> = {}) => {
  const handlers = { onShare: vi.fn(), onRetry: vi.fn(), onMenu: vi.fn() };
  const view = render(
    <GameOverScreen
      run={RUN}
      mode="CLASSIC"
      modeLabel="CLASSIC"
      score={3300}
      world={5}
      level={3}
      topScores={RUN.scores}
      stackCount={60}
      endInsight={{ title: "Too late.", tip: "Tap earlier." }}
      breakdown={{ PERFECT: 20, GREAT: 0, GOOD: 40, OK: 0 }}
      shareStatus="idle"
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, ...handlers };
};

describe("GameOverScreen", () => {
  it("shows the score as a labelled hero number, without a 'Total Score' prefix", () => {
    const { container } = renderScreen();
    const score = container.querySelector(".score-display");
    expect(score?.textContent).toBe("Score: 3300");
    expect(score?.querySelector(".visually-hidden")?.textContent).toBe("Score: ");
    expect(container.textContent).not.toContain("Total Score");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("GAME OVER");
  });

  it("presents progression as a stat (levels reached across worlds)", () => {
    const { container } = renderScreen();
    expect(container.querySelector(".stat-levels")?.textContent).toBe("23");
    expect(container.querySelector(".final-level")?.textContent).toContain("WORLD 5");
    expect(container.querySelector(".final-level")?.textContent).toContain("LEVEL 3");
    expect(container.querySelector(".progression-score")).toBeNull();
  });

  it("hides the combo stat in Zen", () => {
    const { container } = renderScreen({ mode: "ZEN" });
    expect(container.querySelector(".stat-combo")).toBeNull();
    expect(container.querySelector(".stat-stacks")?.textContent).toBe("60");
  });

  it("collapses a long unlock list behind an accessible '+N more' toggle", () => {
    const ids = ACHIEVEMENT_IDS.slice(0, 7);
    const { container } = renderScreen({ run: { ...RUN, achievements: ids } });
    const section = container.querySelector(".run-achievements") as HTMLElement;
    const toggle = within(section).getByRole("button", { name: "+3 MORE" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(section.querySelectorAll("li:not(.run-achievements-more)")).toHaveLength(4);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("SHOW LESS");
    expect(section.querySelectorAll("li:not(.run-achievements-more)")).toHaveLength(7);
  });

  it("shows every unlock when only one would be hidden", () => {
    const ids = ACHIEVEMENT_IDS.slice(0, 5);
    const { container } = renderScreen({ run: { ...RUN, achievements: ids } });
    expect(container.querySelector(".run-achievements-toggle")).toBeNull();
    expect(container.querySelectorAll(".run-achievements li")).toHaveLength(5);
  });

  it("keeps RETRY, share and menu together in the action bar, RETRY first", () => {
    const { container, onRetry, onShare, onMenu } = renderScreen({ shareStatus: "copied" });
    const bar = container.querySelector(".gameover-actions") as HTMLElement;
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "RETRY",
      "SHARE RESULT",
      "MAIN MENU",
    ]);
    expect(within(bar).getByText("Copied to clipboard")).toBeTruthy();

    buttons.forEach((b) => fireEvent.click(b));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  it("shows the daily summary instead of the leaderboard for a Daily run", () => {
    const { container } = renderScreen({
      run: { ...RUN, daily: { dateKey: "2026-11-14", best: 3300, attempts: 2 } },
    });
    expect(container.querySelector(".daily-result-label")?.textContent).toContain("DAILY");
    expect(container.querySelector(".daily-summary-line")?.textContent).toContain("2 TRIES");
    expect(container.textContent).not.toContain("TOP SCORES");
    // Share lives in the action bar, not inside the daily card.
    expect(container.querySelector(".daily-summary .share-btn")).toBeNull();
    expect(container.querySelector(".gameover-actions .share-btn")).not.toBeNull();
  });

  it("shows the streak and the countdown to the next Daily on the TODAY card", () => {
    const { container } = renderScreen({
      run: { ...RUN, daily: { dateKey: "2026-11-14", best: 3300, attempts: 1 } },
      dailyStreak: selectStreakLabel(4, true),
      nextDaily: {
        kind: "countdown",
        countdown: { text: "7h 12m", spoken: "7 hours 12 minutes" },
      },
    });
    const card = container.querySelector(".daily-summary") as HTMLElement;
    const next = card.querySelector(".daily-next") as HTMLElement;
    // Visible compact text is hidden from AT, which gets the spoken wording.
    expect(next.querySelector("[aria-hidden='true']")?.textContent).toBe(
      "NEXT CHALLENGE IN 7h 12m",
    );
    expect(next.querySelector(".visually-hidden")?.textContent).toBe(
      "Next challenge in 7 hours 12 minutes.",
    );
    expect(card.querySelector(".streak-chip")?.textContent).toBe("4-DAY STREAK");
    expect(card.querySelector(".daily-summary-streak .visually-hidden")?.textContent).toBe(
      "4-day streak.",
    );
  });

  it("says the next Daily is ready once the run's day is over", () => {
    const { container } = renderScreen({
      run: { ...RUN, daily: { dateKey: "2026-11-14", best: 3300, attempts: 1 } },
      nextDaily: { kind: "ready" },
    });
    expect(container.querySelector(".daily-next")?.textContent).toBe(
      "NEXT CHALLENGE IS READY",
    );
    expect(container.querySelector(".streak-chip")).toBeNull();
  });

  it("shows no Daily extras for a regular run", () => {
    const { container } = renderScreen({
      nextDaily: { kind: "ready" },
      dailyStreak: selectStreakLabel(4, true),
    });
    expect(container.querySelector(".daily-next")).toBeNull();
    expect(container.querySelector(".streak-chip")).toBeNull();
  });
});
