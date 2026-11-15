import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playWorldUp, playFailSound } = vi.hoisted(() => ({
  playWorldUp: vi.fn(),
  playFailSound: vi.fn(),
}));
vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      {
        playWorldUp,
        playFailSound,
        isMuted: () => false,
        isMusicEnabled: () => true,
        getContextState: () => null,
      },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ),
  };
});

import App from "./App";
import { FINISH_CONFIRM_GUARD_MS, FINISH_CONFIRM_WINDOW_MS } from "./modes/finishRun";
import { getHighScores } from "./utils/storage";

const pauseMenu = () => screen.queryByRole("dialog", { name: "Game paused" });
const finishButton = () =>
  screen.queryByRole("button", { name: "FINISH RUN" }) ??
  screen.queryByRole("button", { name: "TAP AGAIN TO FINISH" });
const flushAnnouncements = () => act(async () => {});
const liveRegion = (container: HTMLElement) =>
  container.querySelector(".sr-only[aria-live='polite']")?.textContent ?? "";

describe("Zen FINISH RUN (App)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  const startAndPause = (modeName: string) => {
    const utils = render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: modeName }));
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).not.toBeNull();
    return utils;
  };

  it.each(["Classic mode", "Time Attack mode"])("is not offered in %s", async (modeName) => {
    startAndPause(modeName);
    expect(finishButton()).toBeNull();
    // MAIN MENU keeps abandoning there.
    expect(screen.getByRole("button", { name: "MAIN MENU" })).toBeTruthy();
    await flushAnnouncements();
  });

  it("sits between RESTART and SETTINGS in the Zen pause menu", async () => {
    startAndPause("Zen mode");
    const labels = Array.from(pauseMenu()!.querySelectorAll("button")).map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual(["RESUME", "RESTART", "FINISH RUN", "SETTINGS", "MAIN MENU"]);
    await flushAnnouncements();
  });

  it("needs a deliberate second press, then ends the run as a calm game over", async () => {
    const { container } = startAndPause("Zen mode");
    await flushAnnouncements(); // "Paused"
    fireEvent.click(finishButton()!);
    expect(finishButton()?.textContent).toBe("TAP AGAIN TO FINISH");
    expect(finishButton()?.className).toContain("armed");
    await flushAnnouncements();
    expect(liveRegion(container)).toBe(
      "Finish this run? Press again to end it and keep your score",
    );

    // A double click is not a confirmation.
    fireEvent.click(finishButton()!);
    expect(pauseMenu()).not.toBeNull();
    expect(finishButton()?.textContent).toBe("TAP AGAIN TO FINISH");

    act(() => vi.advanceTimersByTime(FINISH_CONFIRM_GUARD_MS));
    fireEvent.click(finishButton()!);

    expect(container.querySelector(".gameover-screen")).not.toBeNull();
    const insight = container.querySelector(".end-insight");
    expect(insight?.classList.contains("danger-signal")).toBe(false);
    expect(insight?.querySelector(".end-insight-title")?.textContent).toBe("Session complete.");
    expect(container.querySelector(".end-insight-margin")).toBeNull();
    expect(playWorldUp).toHaveBeenCalled();
    expect(playFailSound).not.toHaveBeenCalled();
    // Same pipeline as a lives-out game over: the Zen top 5 has the run.
    expect(getHighScores("ZEN")).toHaveLength(1);
    await flushAnnouncements();
    // No "Game over" lead-in for a session the player chose to end.
    expect(liveRegion(container)).toBe("Session complete. Score 0");
  });

  it("disarms after the confirm window and when the menu closes", async () => {
    startAndPause("Zen mode");
    fireEvent.click(finishButton()!);
    act(() => vi.advanceTimersByTime(FINISH_CONFIRM_WINDOW_MS));
    expect(finishButton()?.textContent).toBe("FINISH RUN");

    // A press after the window arms again rather than finishing.
    fireEvent.click(finishButton()!);
    expect(finishButton()?.textContent).toBe("TAP AGAIN TO FINISH");
    fireEvent.keyDown(window, { key: "Escape" }); // resume (countdown)
    fireEvent.keyDown(window, { key: "Escape" }); // pause again
    expect(finishButton()?.textContent).toBe("FINISH RUN");
    act(() => vi.advanceTimersByTime(FINISH_CONFIRM_GUARD_MS));
    fireEvent.click(finishButton()!);
    expect(pauseMenu()).not.toBeNull();
    expect(getHighScores("ZEN")).toHaveLength(0);
    await flushAnnouncements();
  });

  it("finishes a practice run without touching the leaderboard", async () => {
    localStorage.setItem(
      "shape-stack-achievements-v1",
      JSON.stringify({ unlocked: {}, lifetime: { bestWorld: 3 } }),
    );
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "Zen mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Next start world" }));
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(finishButton()!);
    act(() => vi.advanceTimersByTime(FINISH_CONFIRM_GUARD_MS));
    fireEvent.click(finishButton()!);

    expect(container.querySelector(".practice-summary")).not.toBeNull();
    expect(container.querySelector(".end-insight-title")?.textContent).toBe(
      "Session complete.",
    );
    expect(getHighScores("ZEN")).toHaveLength(0);
    const lifetime = JSON.parse(localStorage.getItem("shape-stack-achievements-v1") ?? "{}")
      .lifetime;
    expect(lifetime.runsPlayed ?? 0).toBe(0);
    await flushAnnouncements();
  });
});
