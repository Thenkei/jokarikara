import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameOverScreen, type GameOverRun } from "./GameOverScreen";
import { ACHIEVEMENT_IDS } from "../progression/achievements";
import { selectStreakLabel } from "../modes/dailyStreak";
import { getMedalResult, MEDAL_THRESHOLDS } from "../modes/medals";
import { getEndInsight } from "../modes/runInsights";

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

  it("heads a Time Attack run that used its clock TIME!, not GAME OVER", () => {
    renderScreen({
      mode: "TIME_ATTACK",
      modeLabel: "TIME ATTACK",
      run: {
        ...RUN,
        mode: "TIME_ATTACK",
        stats: { ...RUN.stats, endReason: "timeout", endMargin: null },
      },
      endInsight: getEndInsight("timeout", 2),
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("TIME!");
    // The rest of the card is unchanged.
    expect(screen.getByText("Out of time.")).toBeTruthy();
  });

  it("presents progression as a stat (levels reached across worlds)", () => {
    const { container } = renderScreen();
    expect(container.querySelector(".stat-levels")?.textContent).toBe("23");
    expect(container.querySelector(".final-level")?.textContent).toContain("WORLD 5");
    expect(container.querySelector(".final-level")?.textContent).toContain("LEVEL 3");
    expect(container.querySelector(".progression-score")).toBeNull();
  });

  it("leads the insight card with the miss margin, keeping the danger styling", () => {
    const NBSP = "\u00a0";
    const { container } = renderScreen({
      endInsight: {
        margin: `Late by 0.4${NBSP}s`,
        marginHint: `PERFECT opened 0.4${NBSP}s before the edge.`,
        title: "The shape crossed the edge.",
        tip: "Tap a touch earlier.",
      },
    });
    const card = container.querySelector(".end-insight");
    expect(card?.classList.contains("danger-signal")).toBe(true);
    expect(card?.getAttribute("role")).toBe("status");
    const lines = Array.from(card?.querySelectorAll("p") ?? []).map((p) => p.className);
    expect(lines).toEqual([
      "end-insight-margin",
      "end-insight-hint",
      "end-insight-title",
      "end-insight-tip",
    ]);
    expect(card?.querySelector(".end-insight-margin")?.textContent).toBe(
      `Late by 0.4${NBSP}s`,
    );
    expect(card?.querySelector(".end-insight-hint")?.textContent).toBe(
      `PERFECT opened 0.4${NBSP}s before the edge.`,
    );
    expect(card?.querySelector(".end-insight-title")?.textContent).toBe(
      "The shape crossed the edge.",
    );
  });

  it("shows a size margin without a hint line", () => {
    const { container } = renderScreen({
      endInsight: { margin: "Too late by 4\u00a0%", title: "That tap didn't fit.", tip: "x" },
    });
    expect(container.querySelector(".end-insight-margin")?.textContent).toBe(
      "Too late by 4\u00a0%",
    );
    expect(container.querySelector(".end-insight-hint")).toBeNull();
  });

  it("shows no margin line when the miss had none", () => {
    const { container } = renderScreen();
    expect(container.querySelector(".end-insight-margin")).toBeNull();
    expect(container.querySelector(".end-insight-title")?.textContent).toBe("Too late.");
  });

  it("shows a finished Zen session calmly: no danger styling, no margin", () => {
    const { container } = renderScreen({
      mode: "ZEN",
      modeLabel: "ZEN",
      run: {
        ...RUN,
        mode: "ZEN",
        stats: { ...RUN.stats, endReason: "finished", endMargin: null },
      },
      endInsight: getEndInsight("finished", 5, null, [140, 140, 90]),
    });
    const card = container.querySelector(".end-insight");
    expect(card?.classList.contains("danger-signal")).toBe(false);
    expect(card?.classList.contains("end-insight--calm")).toBe(true);
    expect(container.querySelector(".danger-signal")).toBeNull();
    expect(card?.querySelector(".end-insight-margin")).toBeNull();
    expect(card?.querySelector(".end-insight-title")?.textContent).toBe("Session complete.");
    // A chosen ending, not a failure: the headline says so too.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("SESSION COMPLETE");
    expect(card?.querySelector(".end-insight-tip")?.textContent).toContain("67% PERFECT");
    // Still the full game over: stats, leaderboard and share.
    expect(container.querySelector(".stat-stacks")?.textContent).toBe("60");
    expect(screen.getByRole("heading", { name: "TOP SCORES - ZEN" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "SHARE RESULT" })).toBeTruthy();
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

  describe("Time Attack medal", () => {
    const TA_RUN: GameOverRun = { ...RUN, mode: "TIME_ATTACK", isNewBest: false };
    const renderTa = (score: number) =>
      renderScreen({
        run: TA_RUN,
        mode: "TIME_ATTACK",
        modeLabel: "TIME",
        score,
        medal: getMedalResult(score),
      });
    const medalOf = (container: HTMLElement) =>
      container.querySelector<HTMLElement>("[data-testid='gameover-medal']");

    it("shows the earned medal and the next one with the points to go", () => {
      const { container } = renderTa(MEDAL_THRESHOLDS.SILVER - 230);
      const medal = medalOf(container)!;
      expect(medal.classList).toContain("medal--bronze");
      expect(medal.querySelector(".gameover-medal-title")?.textContent).toBe("BRONZE MEDAL");
      // Visible text (aria-hidden separator), then the spoken version.
      const next = medal.querySelector(".gameover-medal-next")!;
      const visible = [...next.childNodes]
        .filter((n) => !(n instanceof HTMLElement && n.classList.contains("visually-hidden")))
        .map((n) => n.textContent)
        .join("");
      expect(visible).toBe(`Silver at ${MEDAL_THRESHOLDS.SILVER} · 230 to go`);
      expect(next.textContent).toBe(`. Silver at ${MEDAL_THRESHOLDS.SILVER} · , 230 to go`);
    });

    it("draws an SVG glyph (decorative), not an emoji", () => {
      const { container } = renderTa(MEDAL_THRESHOLDS.GOLD);
      const svg = medalOf(container)!.querySelector("svg.medal-glyph--gold")!;
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(medalOf(container)!.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    });

    it("gold has no next goal", () => {
      const { container } = renderTa(MEDAL_THRESHOLDS.GOLD + 140);
      const medal = medalOf(container)!;
      expect(medal.querySelector(".gameover-medal-title")?.textContent).toBe("GOLD MEDAL");
      expect(medal.querySelector(".gameover-medal-next")).toBeNull();
    });

    it("below Bronze: no medal, with the Bronze target", () => {
      const { container } = renderTa(880);
      const medal = medalOf(container)!;
      expect(medal.classList).toContain("medal--none");
      expect(medal.querySelector(".gameover-medal-title")?.textContent).toBe("NO MEDAL");
      expect(medal.querySelector(".gameover-medal-next")?.textContent).toContain(
        `Bronze at ${MEDAL_THRESHOLDS.BRONZE}`,
      );
      expect(medal.querySelector(".gameover-medal-next")?.textContent).toContain("120 to go");
      expect(medal.querySelector("svg.medal-glyph--none")).not.toBeNull();
    });

    it("sits in the hero, after the score (the score stays the hero)", () => {
      const { container } = renderTa(MEDAL_THRESHOLDS.BRONZE);
      const hero = container.querySelector(".gameover-hero")!;
      const medal = medalOf(container)!;
      expect(hero.contains(medal)).toBe(true);
      const score = hero.querySelector(".score-display")!;
      expect(score.compareDocumentPosition(medal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("is absent when the caller passes no medal (other modes)", () => {
      const { container } = renderScreen();
      expect(medalOf(container)).toBeNull();
    });
  });
});
