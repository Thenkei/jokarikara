import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      {
        isMuted: () => false,
        isMusicEnabled: () => true,
        getContextState: () => null,
      },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ),
  };
});

import App from "./App";
import { GAME_OVER_DELAY_MS } from "./rendering/effects";

const pauseMenu = () => screen.queryByRole("dialog", { name: "Game paused" });
const gameOver = () => document.querySelector(".gameover-screen");
const bridge = () => {
  const b = window.__GAME_TEST__;
  if (!b) throw new Error("test bridge not installed");
  return b;
};

describe("Fail hold before the game over screen (App)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Bridge only (delays were fixed at import: the real fail hold applies).
    vi.stubEnv("VITE_E2E", "true");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const loseClassicRun = () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    act(() => {
      const b = bridge();
      b.pause();
      b.setActiveSize((b.getState().lastSize ?? 100) * 1.5);
      b.tap();
    });
  };

  it("ignores pausing while a lost run holds its fail feedback", () => {
    expect(GAME_OVER_DELAY_MS).toBeGreaterThan(0);
    loseClassicRun();
    expect(gameOver()).toBeNull();

    // MAIN MENU from a pause here would abandon the lost run and its score.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).toBeNull();

    act(() => vi.advanceTimersByTime(GAME_OVER_DELAY_MS));
    expect(gameOver()).not.toBeNull();
  });

  it("pauses normally again in the next run", () => {
    loseClassicRun();
    act(() => vi.advanceTimersByTime(GAME_OVER_DELAY_MS));
    fireEvent.click(screen.getByRole("button", { name: /RETRY/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).not.toBeNull();
  });
});
