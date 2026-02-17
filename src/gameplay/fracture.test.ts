import { describe, expect, it } from "vitest";
import { createInitialState, spawnActiveShape } from "../core/gameState";
import type { GameState } from "../types";
import { getWorldMechanics } from "../constants/game";
import {
  getFractureOverlay,
  getFractureProbeAngles,
  getFractureSectorCenters,
  isFractureActive,
  isTapBlockedByFracture,
} from "./fracture";

const createState = (mode: GameState["mode"] = "CLASSIC"): GameState => {
  const initial = createInitialState(1000, mode, 424242, false);
  return spawnActiveShape(initial, false);
};

describe("fracture mechanics", () => {
  it("is inactive in worlds before 3", () => {
    const world1 = { ...createState("CLASSIC"), world: 1 };
    const world2 = { ...createState("CLASSIC"), world: 2 };

    expect(isFractureActive(world1)).toBe(false);
    expect(isFractureActive(world2)).toBe(false);
  });

  it("is inactive in zen mode", () => {
    const state = { ...createState("ZEN"), world: 3 };
    expect(isFractureActive(state)).toBe(false);
  });

  it("is active in world 3 for classic and time attack", () => {
    const classicState = { ...createState("CLASSIC"), world: 3 };
    const timeState = { ...createState("TIME_ATTACK"), world: 3 };

    expect(isFractureActive(classicState)).toBe(true);
    expect(isFractureActive(timeState)).toBe(true);
  });

  it("is inactive on boss stacks when disable flag is set", () => {
    const state = { ...createState("CLASSIC"), world: 3, isBossLevel: true };
    expect(isFractureActive(state)).toBe(false);
  });

  it("uses deterministic sector centers from time and speed", () => {
    const state = { ...createState("CLASSIC"), world: 3, level: 1 };
    const mechanics = getWorldMechanics(state.world);
    const centers = getFractureSectorCenters(1.5, state, mechanics);

    expect(centers).toHaveLength(2);
    expect(centers[0]).toBeCloseTo(1.35, 6);
    expect(centers[1]).toBeCloseTo(1.35 + Math.PI, 6);
  });

  it("uses four probe angles for circles", () => {
    const state = createState("CLASSIC");
    state.world = 3;
    if (!state.activeShape) {
      throw new Error("Expected active shape");
    }
    state.activeShape = {
      ...state.activeShape,
      type: "circle",
      rotation: 0,
    };

    const probes = getFractureProbeAngles(state);
    expect(probes).toHaveLength(4);
    expect(probes[0]).toBeCloseTo(0, 6);
    expect(probes[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(probes[2]).toBeCloseTo(Math.PI, 6);
    expect(probes[3]).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it("enforces boundary band gating before evaluating sectors", () => {
    const state = createState("CLASSIC");
    state.world = 3;
    if (!state.activeShape) {
      throw new Error("Expected active shape");
    }
    const container = state.shapes[state.shapes.length - 1];
    state.activeShape = {
      ...state.activeShape,
      type: "circle",
      rotation: 0,
      size: container.size * 0.6, // below configured 0.78 gate
    };

    expect(isTapBlockedByFracture(state, 0)).toBe(false);
  });

  it("blocks tap when probes intersect active fracture sectors", () => {
    const state = createState("CLASSIC");
    state.world = 3;
    if (!state.activeShape) {
      throw new Error("Expected active shape");
    }
    const container = state.shapes[state.shapes.length - 1];
    state.activeShape = {
      ...state.activeShape,
      type: "circle",
      rotation: 0,
      size: container.size * 0.9,
    };

    expect(isTapBlockedByFracture(state, 0)).toBe(true);
  });

  it("does not block tap when probes stay outside fracture sectors", () => {
    const state = createState("CLASSIC");
    state.world = 3;
    if (!state.activeShape) {
      throw new Error("Expected active shape");
    }
    const container = state.shapes[state.shapes.length - 1];
    state.activeShape = {
      ...state.activeShape,
      type: "circle",
      rotation: Math.PI / 4,
      size: container.size * 0.9,
    };

    expect(isTapBlockedByFracture(state, 0)).toBe(false);
  });

  it("returns overlay with centers and width when active", () => {
    const state = { ...createState("CLASSIC"), world: 3 };
    const overlay = getFractureOverlay(state, 0);

    expect(overlay).not.toBeNull();
    expect(overlay?.centers).toHaveLength(2);
    expect(overlay?.widthRad ?? 0).toBeGreaterThan(0);
  });
});
