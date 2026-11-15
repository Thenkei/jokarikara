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
import { GAME_OVER_INPUT_GUARD_MS } from "./modes/gameOverGuard";

const gameOver = () => document.querySelector(".gameover-screen");
const actionBar = () => document.querySelector(".gameover-actions");
const bridge = () => {
  const b = window.__GAME_TEST__;
  if (!b) throw new Error("test bridge not installed");
  return b;
};

describe("Game over reflex tap guard (App)", () => {
  beforeEach(() => {
    localStorage.clear();
    // Bridge only (delays were fixed at import: the real guard applies).
    vi.stubEnv("VITE_E2E", "true");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const showGameOver = () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    act(() => {
      const b = bridge();
      b.pause();
      b.setActiveSize((b.getState().lastSize ?? 100) * 1.5);
      b.tap();
    });
    act(() => vi.advanceTimersByTime(GAME_OVER_DELAY_MS));
    expect(gameOver()).not.toBeNull();
  };

  it("ignores Enter and keeps the actions inert for a beat", () => {
    expect(GAME_OVER_INPUT_GUARD_MS).toBeGreaterThan(0);
    showGameOver();
    expect(actionBar()?.hasAttribute("inert")).toBe(true);

    // A reflex Enter (the run's tap key) must not skip the results.
    fireEvent.keyDown(window, { key: "Enter" });
    expect(gameOver()).not.toBeNull();

    act(() => vi.advanceTimersByTime(GAME_OVER_INPUT_GUARD_MS));
    expect(actionBar()?.hasAttribute("inert")).toBe(false);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(gameOver()).toBeNull();
  });

  it("guards each game over, including after a RETRY", () => {
    showGameOver();
    act(() => vi.advanceTimersByTime(GAME_OVER_INPUT_GUARD_MS));
    fireEvent.click(screen.getByRole("button", { name: /RETRY/ }));
    act(() => {
      const b = bridge();
      b.pause();
      b.setActiveSize((b.getState().lastSize ?? 100) * 1.5);
      b.tap();
    });
    act(() => vi.advanceTimersByTime(GAME_OVER_DELAY_MS));
    expect(actionBar()?.hasAttribute("inert")).toBe(true);
  });
});
