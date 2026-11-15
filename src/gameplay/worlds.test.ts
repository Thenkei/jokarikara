import { describe, it, expect } from "vitest";
import {
  createInitialState,
  handleMiss,
  isStackValid,
  spawnActiveShape,
  stackActiveShape,
  undoLastStack,
  updateActiveShape,
} from "../core/gameState";
import { getGameplayConfig, getWorldConfig } from "./selectors";
import { WORLD_TEXT_COUNT, getWorldName, getWorldTagline } from "./worldText";
import { getTranslator } from "../i18n";
import {
  getReverseZoom,
  REVERSE_SEED_RATIO,
  REVERSE_SPAWN_RATIO,
} from "./reverse";
import { getZoomForLevel, STACKS_PER_LEVEL, LEVELS_PER_WORLD } from "../constants/game";
import type { GameMode, GameState } from "../types";

const STACKS_PER_WORLD = STACKS_PER_LEVEL * LEVELS_PER_WORLD;

/** Stack deterministically to just before `targetWorld` starts. */
const stackTo = (stacks: number, mode: GameMode = "CLASSIC"): GameState => {
  let state = spawnActiveShape(createInitialState(1000, mode, 7));
  for (let i = 0; i < stacks; i += 1) {
    const last = state.shapes[state.shapes.length - 1];
    const reverse = getWorldConfig(state.world).mechanics.reverseStacking;
    state = {
      ...state,
      activeShape: {
        ...state.activeShape!,
        size: reverse ? last.size / 0.9 : last.size * 0.9,
      },
    };
    state = spawnActiveShape(stackActiveShape(state).state);
  }
  return state;
};

describe("world taglines", () => {
  it("every configured world explains its rule on entry", () => {
    const en = getTranslator("en");
    const worlds = Object.keys(getGameplayConfig().worlds).map(Number);
    // Each configured world has its own catalog text (worldText.ts).
    expect(worlds).toHaveLength(WORLD_TEXT_COUNT);
    for (const world of worlds) {
      expect(getWorldName(en, world)).toBeTruthy();
      expect(getWorldTagline(en, world).length).toBeGreaterThan(10);
    }
  });
});

describe("entering and leaving the Reverse Stack world", () => {
  const before9 = stackTo(8 * STACKS_PER_WORLD - 1);
  const in9 = stackTo(8 * STACKS_PER_WORLD);

  it("disables rim fractures and the eclipse in world 9", () => {
    const mechanics = getWorldConfig(9).mechanics;
    expect(mechanics.reverseStacking).toBe(true);
    expect(mechanics.fractureWindows).toBe(false);
    expect(mechanics.eclipseEffect).toBe(false);
    // Still cumulative otherwise (inherits world 8).
    expect(mechanics.gravityDrift).toBe(true);
  });

  it("starts from a small seed and zooms to frame it", () => {
    expect(before9.world).toBe(8);
    expect(in9.world).toBe(9);
    expect(in9.shapes).toHaveLength(1);
    expect(in9.shapes[0].size).toBeCloseTo(in9.initialSize * REVERSE_SEED_RATIO, 6);
    expect(in9.targetZoom).toBeCloseTo(
      getReverseZoom(in9.initialSize, in9.shapes[0].size),
      9,
    );
  });

  it("spawns the growing shape just inside the previous one", () => {
    const last = in9.shapes[in9.shapes.length - 1];
    expect(in9.activeShape!.size).toBeCloseTo(last.size * REVERSE_SPAWN_RATIO, 9);
  });

  it("validates taps that wrap the previous shape and rates tight wraps PERFECT", () => {
    const last = in9.shapes[0];
    const early = { ...in9, activeShape: { ...in9.activeShape!, type: "circle" as const, size: last.size * 0.9 } };
    expect(isStackValid(early)).toBe(false);

    const tight = { ...in9, zoom: in9.targetZoom, activeShape: { ...in9.activeShape!, type: "circle" as const, size: last.size * 1.02 } };
    // Seed is a circle, so a circle 2% larger wraps it.
    expect(last.type).toBe("circle");
    expect(isStackValid(tight)).toBe(true);
    const result = stackActiveShape(tight);
    expect(result.quality).toBe("PERFECT");
    expect(result.state.targetZoom).toBeLessThan(tight.targetZoom);
  });

  it("restores the full-size base and level zoom when leaving for world 10", () => {
    const in10 = stackTo(9 * STACKS_PER_WORLD);
    expect(in10.world).toBe(10);
    expect(in10.shapes).toHaveLength(1);
    expect(in10.shapes[0].size).toBeCloseTo(in10.initialSize, 6);
    expect(in10.targetZoom).toBe(getZoomForLevel(1));
    expect(in10.activeShape!.size).toBeCloseTo(in10.initialSize * 0.05, 6);
  });

  it("resets a Zen miss to the reverse spawn size", () => {
    const zen = stackTo(8 * STACKS_PER_WORLD, "ZEN");
    const last = zen.shapes[zen.shapes.length - 1];
    const missed = handleMiss({
      ...zen,
      activeShape: { ...zen.activeShape!, size: last.size * 3 },
    });
    expect(missed.zenLivesRemaining).toBe((zen.zenLivesRemaining ?? 0) - 1);
    expect(missed.activeShape!.size).toBeCloseTo(last.size * REVERSE_SPAWN_RATIO, 9);
  });

  it("re-frames the camera on undo in a reverse world", () => {
    const zen = stackTo(8 * STACKS_PER_WORLD + 2, "ZEN");
    expect(zen.world).toBe(9);
    const undone = undoLastStack(zen);
    const last = undone.shapes[undone.shapes.length - 1];
    expect(undone.targetZoom).toBeCloseTo(
      getReverseZoom(undone.initialSize, last.size),
      9,
    );
  });
});

describe("Heartbeat world", () => {
  it("modulates growth with the beat in world 10 only", () => {
    const base = stackTo(9 * STACKS_PER_WORLD);
    expect(base.world).toBe(10);
    const onBeat = updateActiveShape({ ...base, elapsedTime: 0 }, 1 / 60);
    const offBeat = updateActiveShape({ ...base, elapsedTime: 0.6 }, 1 / 60);
    const growth = (s: GameState) => s.activeShape!.size - base.activeShape!.size;
    expect(growth(onBeat)).toBeGreaterThan(growth(offBeat) * 20);

    const world8 = stackTo(7 * STACKS_PER_WORLD);
    const a = updateActiveShape({ ...world8, elapsedTime: 0 }, 1 / 60);
    const b = updateActiveShape({ ...world8, elapsedTime: 0.6 }, 1 / 60);
    expect(a.activeShape!.size).toBeCloseTo(b.activeShape!.size, 6);
  });
});

describe("practice start world", () => {
  it("starts at level 1 of the chosen world with matching progression", () => {
    const state = createInitialState(1000, "ZEN", 3, false, 4);
    expect(state.world).toBe(4);
    expect(state.level).toBe(1);
    expect(state.stackCount).toBe(3 * STACKS_PER_WORLD);
    expect(state.score).toBe(0);
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].size).toBeCloseTo(state.initialSize, 9);
    expect(state.zoom).toBe(getZoomForLevel(1));
  });

  it("starts a reverse world from its seed with the reverse camera", () => {
    const state = createInitialState(1000, "ZEN", 3, false, 9);
    expect(state.world).toBe(9);
    expect(state.shapes[0].size).toBeCloseTo(state.initialSize * REVERSE_SEED_RATIO, 9);
    expect(state.zoom).toBeCloseTo(
      getReverseZoom(state.initialSize, state.shapes[0].size),
      9,
    );
  });

  it("treats invalid start worlds as world 1", () => {
    expect(createInitialState(1000, "ZEN", 3, false, 0).world).toBe(1);
    expect(createInitialState(1000, "ZEN", 3, false, 2.7).world).toBe(2);
  });
});

