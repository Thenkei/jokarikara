import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { playTick, pauseMusic, resumeMusic } = vi.hoisted(() => ({
  playTick: vi.fn(),
  pauseMusic: vi.fn(),
  resumeMusic: vi.fn(),
}));
vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      {
        playTick,
        pauseMusic,
        resumeMusic,
        isMuted: () => false,
        isMusicEnabled: () => true,
        getContextState: () => null,
      },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ),
  };
});

import App from "./App";
import { RESUME_COUNTDOWN_STEP_MS } from "./gameplay/resumeCountdown";

const countdown = () => screen.queryByTestId("resume-countdown");
const pauseMenu = () => screen.queryByRole("dialog", { name: "Game paused" });
const flushAnnouncements = () => act(async () => {});
const liveRegion = (container: HTMLElement) =>
  container.querySelector(".sr-only[aria-live='polite']")?.textContent ?? "";

describe("resume countdown (App)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  const startAndPause = () => {
    const utils = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).not.toBeNull();
    return utils;
  };

  it("closes the menu at once, counts 3 · 2 · 1 (announced once), then resumes", async () => {
    const { container } = startAndPause();
    await flushAnnouncements();
    expect(liveRegion(container)).toBe("Paused");
    fireEvent.click(screen.getByRole("button", { name: "RESUME" }));
    expect(pauseMenu()).toBeNull();
    expect(countdown()?.textContent).toBe("3");
    await flushAnnouncements();
    expect(liveRegion(container)).toBe("Resuming in 3");
    expect(resumeMusic).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(RESUME_COUNTDOWN_STEP_MS));
    expect(countdown()?.textContent).toBe("2");
    act(() => vi.advanceTimersByTime(RESUME_COUNTDOWN_STEP_MS));
    expect(countdown()?.textContent).toBe("1");
    await flushAnnouncements();
    expect(liveRegion(container)).toBe("Resuming in 3");

    act(() => vi.advanceTimersByTime(RESUME_COUNTDOWN_STEP_MS));
    expect(countdown()).toBeNull();
    expect(resumeMusic).toHaveBeenCalledTimes(1);
    expect(playTick.mock.calls).toEqual([
      [false, true],
      [false, true],
      [false, true],
      [true, true],
    ]);
  });

  it("Escape or P during the count re-opens the pause menu and cancels it", async () => {
    startAndPause();
    fireEvent.click(screen.getByRole("button", { name: "RESUME" }));
    act(() => vi.advanceTimersByTime(RESUME_COUNTDOWN_STEP_MS));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(pauseMenu()).not.toBeNull();
    expect(countdown()).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(pauseMenu()).not.toBeNull();
    expect(resumeMusic).not.toHaveBeenCalled();

    // Escape from the menu starts a fresh count; P cancels it the same way.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(countdown()?.textContent).toBe("3");
    fireEvent.keyDown(window, { key: "p" });
    expect(pauseMenu()).not.toBeNull();
    expect(countdown()).toBeNull();
    await flushAnnouncements();
  });

  it("losing focus during the count pauses again", async () => {
    startAndPause();
    fireEvent.click(screen.getByRole("button", { name: "RESUME" }));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(pauseMenu()).not.toBeNull();
    expect(countdown()).toBeNull();
    await flushAnnouncements();
  });

  it("leaving to the main menu drops the count", async () => {
    startAndPause();
    fireEvent.click(screen.getByRole("button", { name: "RESUME" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "MAIN MENU" }));
    act(() => vi.advanceTimersByTime(5000));
    expect(countdown()).toBeNull();
    expect(screen.getByRole("button", { name: "START" })).toBeTruthy();
    await flushAnnouncements();
  });

  it("does not count down on the first start of a run", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    expect(countdown()).toBeNull();
    expect(playTick).not.toHaveBeenCalled();
  });
});
