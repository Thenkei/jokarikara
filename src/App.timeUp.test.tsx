import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playTimeUp, playFailSound } = vi.hoisted(() => ({
  playTimeUp: vi.fn(),
  playFailSound: vi.fn(),
}));
vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      {
        playTimeUp,
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
import { TIME_UP_DELAY_MS } from "./rendering/effects";

const banner = () => screen.queryByTestId("time-up-banner");
const pauseMenu = () => screen.queryByRole("dialog", { name: "Game paused" });
const flushAnnouncements = () => act(async () => {});
const liveRegion = (container: HTMLElement) =>
  container.querySelector(".sr-only[aria-live='polite']")?.textContent ?? "";
const bridge = () => {
  const b = window.__GAME_TEST__;
  if (!b) throw new Error("test bridge not installed");
  return b;
};

describe("Time Attack TIME! ending (App)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Bridge only (delays were fixed at import: the real 1 s hold applies).
    vi.stubEnv("VITE_E2E", "true");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const startTimeAttack = () => {
    const utils = render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "Time Attack mode" }));
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    act(() => bridge().pause());
    return utils;
  };

  const runOutTheClock = () =>
    act(() => {
      bridge().setTimeRemaining(0.01);
      bridge().step(0.02);
    });

  it("shows TIME! with the medal, announces the result once, then the TIME! game over", async () => {
    const { container } = startTimeAttack();
    // 8 PERFECT stacks: 1120 points, Bronze.
    act(() => {
      for (let i = 0; i < 8; i += 1) bridge().forceStack(0.98);
    });
    await flushAnnouncements();

    runOutTheClock();
    expect(playTimeUp).toHaveBeenCalledWith(1, "BRONZE");
    expect(playFailSound).not.toHaveBeenCalled();
    expect(banner()?.textContent).toBe("TIME!BRONZE MEDAL");
    expect(banner()?.getAttribute("aria-hidden")).toBe("true");
    await flushAnnouncements();
    expect(liveRegion(container)).toBe("Time! Score 1120. Bronze medal");

    // The run is over: pausing during the TIME! hold is ignored (MAIN MENU
    // from there would abandon a finished run and its score).
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).toBeNull();
    await flushAnnouncements();

    act(() => vi.advanceTimersByTime(TIME_UP_DELAY_MS));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("TIME!");
    expect(screen.getByText("Out of time.")).toBeTruthy();
    expect(screen.getByTestId("gameover-medal").textContent).toContain("BRONZE MEDAL");
    await flushAnnouncements();
    // Not re-announced as a loss ("Game over").
    expect(liveRegion(container)).toBe("Time! Score 1120. Bronze medal");
  });

  it("says just the score without a medal, and a new run starts clean", async () => {
    const { container } = startTimeAttack();
    runOutTheClock();
    expect(playTimeUp).toHaveBeenCalledWith(1, null);
    expect(banner()?.textContent).toBe("TIME!");
    await flushAnnouncements();
    expect(liveRegion(container)).toBe("Time! Score 0");
    act(() => vi.advanceTimersByTime(TIME_UP_DELAY_MS));

    fireEvent.click(screen.getByRole("button", { name: /RETRY/ }));
    expect(banner()).toBeNull();
    // Pausing works again in the new run.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).not.toBeNull();
    await flushAnnouncements();
  });
});
