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
import { LEVELS_PER_WORLD, STACKS_PER_LEVEL } from "./constants/game";
import { getWorldHowTo } from "./gameplay/worldText";
import { getTranslator } from "./i18n";
import { FIRST_VISIT_GRACE_MS, WORLD_INTRO_MS } from "./gameplay/worldIntro";

const ACHIEVEMENTS_KEY = "shape-stack-achievements-v1";
const HOW_TO_2 = getWorldHowTo(getTranslator("en"), 2);
const overlay = () => screen.queryByTestId("world-up");
const howTo = () => screen.queryByTestId("world-up-howto");
const flushAnnouncements = () => act(async () => {});
const liveRegion = (container: HTMLElement) =>
  container.querySelector(".sr-only[aria-live='polite']")?.textContent ?? "";
const pressSpace = () => fireEvent.keyDown(window, { key: " " });

const seedBestWorld = (bestWorld: number) =>
  localStorage.setItem(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ unlocked: {}, lifetime: { bestWorld } }),
  );

/** START a Classic run and stack (instant Space taps) into world 2. */
const startAndReachWorld2 = () => {
  const utils = render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "START" }));
  for (let i = 0; i < STACKS_PER_LEVEL * LEVELS_PER_WORLD; i += 1) pressSpace();
  expect(screen.getByText("WORLD 2")).toBeTruthy();
  return utils;
};

describe("first-visit world intro (App)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  });
  afterEach(() => vi.useRealTimers());

  it("teaches a never-reached world, announces it, and Space dismisses it", async () => {
    const { container } = startAndReachWorld2();
    expect(howTo()?.textContent).toBe(HOW_TO_2);
    expect(screen.getByText("TAP TO PLAY")).toBeTruthy();
    await flushAnnouncements();
    expect(liveRegion(container)).toContain("World 2. Breathing.");
    expect(liveRegion(container)).toContain(
      `${HOW_TO_2} Tap or press Space to play.`,
    );
    expect(liveRegion(container)).not.toContain("..");

    // Outlives the short overlay while the game waits for the player.
    act(() => vi.advanceTimersByTime(WORLD_INTRO_MS + 100));
    expect(howTo()).not.toBeNull();

    const score = () => container.querySelector(".score-readout")?.textContent;
    const scoreBefore = score();
    pressSpace();
    expect(overlay()).toBeNull();
    // Dismissing was not a stack (no score) and the run goes on in world 2.
    expect(score()).toBe(scoreBefore);
    expect(container.querySelector(".world-badge")?.textContent).toBe("W 2");
    // The next press plays again.
    pressSpace();
    expect(score()).not.toBe(scoreBefore);
  });

  it("swallows a key press during the grace period", () => {
    startAndReachWorld2();
    pressSpace();
    expect(howTo()).not.toBeNull();
    act(() => vi.advanceTimersByTime(FIRST_VISIT_GRACE_MS));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(overlay()).toBeNull();
  });

  it("keeps the short overlay for a world already reached", () => {
    seedBestWorld(5);
    startAndReachWorld2();
    expect(overlay()).not.toBeNull();
    expect(howTo()).toBeNull();
    act(() => vi.advanceTimersByTime(WORLD_INTRO_MS));
    expect(overlay()).toBeNull();
  });

  it("pausing ends the intro (RESUME counts down as usual)", () => {
    startAndReachWorld2();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(overlay()).toBeNull();
    expect(screen.getByRole("dialog", { name: "Game paused" })).toBeTruthy();
  });
});
