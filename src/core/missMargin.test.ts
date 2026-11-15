import { describe, expect, it } from "vitest";
import type { GameState } from "../types";
import type { Shape } from "../utils/geometry";
import { findSizeThreshold, getLargestFittingSize } from "../utils/geometry";
import {
  getArenaRadius,
  getLargestArenaSize,
  getReverseWrapSize,
} from "../gameplay/reverse";
import { isTapBlockedByFracture } from "../gameplay/fracture";
import {
  FRACTURE_CLEAR_HORIZON,
  FRACTURE_CLEAR_STEP,
  advanceClock,
  checkContainment,
  createInitialState,
  getFractureClearDelay,
  getMissMargin,
  handleMiss,
  restartActiveShape,
  spawnActiveShape,
  stackActiveShape,
  updateActiveShape,
} from "./gameState";
import { STYLE_QUALITY_THRESHOLDS } from "../constants/game";

const shape = (type: Shape["type"], size: number, rotation = 0): Shape => ({
  type,
  size,
  rotation,
  color: "#fff",
  opacity: 1,
});

/** Containment tolerance of `isPointInShape` (half a unit on the radius). */
const BUFFER = 0.5;

/**
 * Largest axis-aligned square inside a pentagon of size `p` (vertex up), with
 * the containment buffer: the upper corners touch the upper side edges, whose
 * normals point at ±54° from the horizontal.
 */
const squareInPentagonFit = (p: number) =>
  (2 * (p / 2 + BUFFER) * Math.cos(Math.PI / 5)) /
  (Math.sin(Math.PI / 5) + Math.cos(Math.PI / 5));

const regularState = (
  container: Shape,
  active: Shape,
  offset = { x: 0, y: 0 },
): GameState => ({
  ...createInitialState(1000, "CLASSIC", 7),
  shapes: [container],
  activeShape: active,
  activeOffset: offset,
});

const reverseState = (
  previous: Shape,
  active: Shape,
  overrides: Partial<GameState> = {},
): GameState => ({
  ...createInitialState(1000, "CLASSIC", 7, false, 9),
  shapes: [previous],
  activeShape: active,
  activeOffset: { x: 0, y: 0 },
  ...overrides,
});

describe("findSizeThreshold", () => {
  it("bisects towards the fitting side in both directions", () => {
    expect(findSizeThreshold((s) => s <= 42, 0, 100)).toBeCloseTo(42, 4);
    expect(findSizeThreshold((s) => s >= 42, 100, 0)).toBeCloseTo(42, 4);
    // Returned on the fitting side.
    expect(findSizeThreshold((s) => s <= 42, 0, 100)).toBeLessThanOrEqual(42);
  });
});

describe("getLargestFittingSize", () => {
  it("circle in circle: the container plus its half-unit buffer", () => {
    // Fits while r ≤ 50 + 0.5, i.e. size ≤ 101.
    expect(getLargestFittingSize(shape("circle", 110), shape("circle", 100))).toBeCloseTo(
      101,
      3,
    );
  });

  it("square in pentagon: limited by the upper side edges", () => {
    const fit = squareInPentagonFit(200);
    expect(fit).toBeCloseTo(116.42, 2);
    expect(
      getLargestFittingSize(shape("square", 130), shape("pentagon", 200)),
    ).toBeCloseTo(fit, 3);
  });

  it("accounts for a drift offset (gravity) on the child", () => {
    // Centre 10 units off: fits while r + 10 ≤ 50.5, i.e. size ≤ 81.
    expect(
      getLargestFittingSize(shape("circle", 90), shape("circle", 100), { x: 10, y: 0 }),
    ).toBeCloseTo(81, 3);
  });

  it("has no answer when the child fits or its centre is outside", () => {
    expect(getLargestFittingSize(shape("circle", 90), shape("circle", 100))).toBeNull();
    expect(
      getLargestFittingSize(shape("circle", 90), shape("circle", 100), { x: 60, y: 0 }),
    ).toBeNull();
  });
});

/** One loop frame, in the loop's order (clock first, then growth). */
const frame = (state: GameState, dt: number) =>
  updateActiveShape(advanceClock(state, dt), dt);

const PERFECT = STYLE_QUALITY_THRESHOLDS.perfectMinRatio;
/** PERFECT band entry for a 100-unit container. */
const PERFECT_SIZE = 100 * PERFECT;

describe("PERFECT band entry tracking", () => {
  /** Container 100, circle growing at a fixed rate (frozen growth speed). */
  const growing = (size: number): GameState => ({
    ...regularState(shape("circle", 100), shape("circle", size)),
    elapsedTime: 10,
    perfectBandEnteredAt: null,
  });

  it("interpolates the crossing inside the frame", () => {
    const before = growing(PERFECT * 100 - 1);
    const after = frame(before, 0.1);
    const grown = after.activeShape!.size - before.activeShape!.size;
    expect(grown).toBeGreaterThan(1); // the frame crosses the band entry
    // Entry is 1 unit into a `grown`-unit frame that started at t = 10.
    expect(after.perfectBandEnteredAt).toBeCloseTo(10 + 0.1 * (1 / grown), 9);
  });

  it("stays null below the band and keeps the first entry afterwards", () => {
    const below = frame(growing(50), 1 / 60);
    expect(below.perfectBandEnteredAt).toBeNull();
    const entered = { ...growing(98), perfectBandEnteredAt: 7.5 };
    expect(frame(entered, 1 / 60).perfectBandEnteredAt).toBe(7.5);
  });

  it("counts a shape already past the entry from the frame start", () => {
    expect(frame(growing(99), 0.02).perfectBandEnteredAt).toBeCloseTo(10, 9);
  });

  it("resets whenever a new shape starts growing", () => {
    const entered = { ...growing(99), perfectBandEnteredAt: 3 };
    expect(spawnActiveShape(entered).perfectBandEnteredAt).toBeNull();
    expect(restartActiveShape(entered).perfectBandEnteredAt).toBeNull();
    expect(stackActiveShape(entered).state.perfectBandEnteredAt).toBeNull();
    const zen = handleMiss({ ...entered, mode: "ZEN", zenLivesRemaining: 5 }, "badTap");
    expect(zen.perfectBandEnteredAt).toBeNull();
  });
});

describe("getMissMargin (regular worlds)", () => {
  it("untapped overflow: time since PERFECT opened, not a size", () => {
    const margin = getMissMargin(
      {
        ...regularState(shape("circle", 100), shape("circle", 101.4)),
        elapsedTime: 12.75,
        perfectBandEnteredAt: 12.35,
      },
      "overflow",
    );
    expect(margin).toEqual({ kind: "lateTime", seconds: expect.closeTo(0.4, 9) });
  });

  it("untapped overflow matches a real run: PERFECT entry to the edge", () => {
    // Grow frame by frame until containment fails, like the loop does.
    let state: GameState = {
      ...regularState(shape("circle", 100), shape("circle", 60)),
      perfectBandEnteredAt: null,
    };
    let enteredAt: number | null = null;
    for (let i = 0; i < 10_000 && checkContainment(state); i += 1) {
      state = frame(state, 1 / 60);
      if (enteredAt === null && state.activeShape!.size >= PERFECT_SIZE) {
        enteredAt = state.elapsedTime;
      }
    }
    const margin = getMissMargin(state, "overflow");
    expect(margin?.kind).toBe("lateTime");
    const seconds = margin?.kind === "lateTime" ? margin.seconds : NaN;
    // Interpolated entry: within one frame before the first frame in band.
    expect(seconds).toBeGreaterThanOrEqual(state.elapsedTime - enteredAt!);
    expect(seconds).toBeLessThanOrEqual(state.elapsedTime - enteredAt! + 1 / 60);
  });

  it("untapped overflow that never reached PERFECT: reason only", () => {
    // Square in pentagon cannot grow past ~58 % of the pentagon.
    expect(
      getMissMargin(
        {
          ...regularState(shape("pentagon", 200), shape("square", 117)),
          perfectBandEnteredAt: null,
        },
        "overflow",
      ),
    ).toBeNull();
  });

  it("tap with a corner out (square in pentagon): size overshoot vs the fit", () => {
    const margin = getMissMargin(
      regularState(shape("pentagon", 200), shape("square", 130)),
      "badTap",
    );
    expect(margin).toEqual({
      kind: "late",
      fraction: expect.closeTo(130 / squareInPentagonFit(200) - 1, 5),
    });
  });

  it("tap with a corner out (circle in circle): overshoot vs the buffered fit", () => {
    expect(
      getMissMargin(regularState(shape("circle", 100), shape("circle", 110)), "badTap"),
    ).toEqual({ kind: "late", fraction: expect.closeTo(110 / 101 - 1, 5) });
  });

  it("is null when nothing was out (or no number makes sense)", () => {
    expect(
      getMissMargin(regularState(shape("circle", 100), shape("circle", 90)), "badTap"),
    ).toBeNull();
    expect(
      getMissMargin(
        regularState(shape("circle", 100), shape("circle", 90), { x: 70, y: 0 }),
        "badTap",
      ),
    ).toBeNull();
    expect(
      getMissMargin({ ...createInitialState(1000), activeShape: null }, "overflow"),
    ).toBeNull();
  });

  it("is captured by handleMiss before the shape resets", () => {
    const missed = handleMiss(
      { ...regularState(shape("circle", 100), shape("circle", 110)), mode: "ZEN", zenLivesRemaining: 5 },
      "badTap",
    );
    expect(missed.activeShape?.size).toBeLessThan(10); // reset to spawn size
    expect(missed.lastMissMargin).toEqual({
      kind: "late",
      fraction: expect.closeTo(110 / 101 - 1, 5),
    });
  });
});

describe("getMissMargin (Reverse Stack)", () => {
  it("tap before wrapping: shortfall relative to the wrapping size", () => {
    // The previous circle (r 50) is wrapped once r + 0.5 ≥ 50, size ≥ 99.
    const state = reverseState(shape("circle", 100), shape("circle", 90));
    expect(getReverseWrapSize(state)).toBeCloseTo(99, 3);
    const margin = getMissMargin(state, "badTap");
    expect(margin).toEqual({ kind: "early", fraction: expect.closeTo(9 / 99, 5) });
  });

  it("a rotated square needs more than the same size to wrap a square", () => {
    const state = reverseState(shape("square", 100), shape("square", 110, Math.PI / 4));
    // Rotated 45°: the inner square's corners (r 50√2) must reach the
    // rotated square's sides (apothem s/2 + buffer).
    const wrap = getReverseWrapSize(state);
    expect(wrap).toBeCloseTo(2 * (50 * Math.SQRT2 - BUFFER), 3);
    expect(getMissMargin(state, "badTap")?.kind).toBe("early");
  });

  it("crossing the arena untapped: time since PERFECT (wrapping) opened", () => {
    const state = reverseState(shape("circle", 100), shape("circle", 530), {
      initialSize: 500,
      zoom: 2,
      elapsedTime: 20,
      perfectBandEnteredAt: 18.8,
    });
    expect(getMissMargin(state, "overflow")).toEqual({
      kind: "lateTime",
      seconds: expect.closeTo(1.2, 9),
    });
  });

  it("enters the Reverse band once the shape reaches the previous size", () => {
    const state = reverseState(shape("circle", 100), shape("circle", 99.9), {
      perfectBandEnteredAt: null,
    });
    expect(frame(state, 0.1).perfectBandEnteredAt).not.toBeNull();
    expect(
      frame({ ...state, activeShape: shape("circle", 80) }, 1 / 60).perfectBandEnteredAt,
    ).toBeNull();
  });

  it("a tap past the arena: overshoot relative to the arena diameter", () => {
    const state = reverseState(shape("circle", 100), shape("circle", 530), {
      initialSize: 500,
      zoom: 2,
    });
    expect(getArenaRadius(state)).toBe(250);
    expect(getLargestArenaSize(state)).toBeCloseTo(500, 3);
    expect(getMissMargin(state, "badTap")).toEqual({
      kind: "late",
      fraction: expect.closeTo(0.06, 5),
    });
  });

  it("is null when it already wrapped and stayed inside", () => {
    const state = reverseState(shape("circle", 100), shape("circle", 120));
    expect(getReverseWrapSize(state)).toBeNull();
    expect(getMissMargin(state, "badTap")).toBeNull();
  });
});

describe("fracture clear delay", () => {
  /** World 3 Classic, circle at 85 % of its container, frozen growth. */
  const fractureState = (speed: number): GameState => {
    const base = spawnActiveShape(createInitialState(1000, "CLASSIC", 11, false, 3));
    const container = base.shapes[base.shapes.length - 1];
    return {
      ...base,
      isBossLevel: false,
      currentSpeed: speed,
      activeShape: { ...shape("circle", container.size * 0.85), rotation: 0 },
    };
  };

  /** First game time (from 0, 10 ms steps) at which a tap is blocked. */
  const blockedAt = (state: GameState): GameState => {
    for (let t = 0; t < 10; t += 0.01) {
      const candidate = { ...state, elapsedTime: t };
      if (isTapBlockedByFracture(candidate, t)) return candidate;
    }
    throw new Error("no blocked time found");
  };

  it("is null when the tap is not blocked", () => {
    expect(getFractureClearDelay({ ...fractureState(0), activeShape: null })).toBeNull();
  });

  it("finds when the sectors clear, simulating the run forward", () => {
    const state = blockedAt(fractureState(0));
    const delay = getFractureClearDelay(state);
    expect(delay).not.toBeNull();
    expect(delay!).toBeGreaterThan(0);
    expect(delay!).toBeLessThanOrEqual(FRACTURE_CLEAR_HORIZON);
    // Whole simulated frames.
    expect(Math.round(delay! / FRACTURE_CLEAR_STEP) * FRACTURE_CLEAR_STEP).toBeCloseTo(
      delay!,
      9,
    );
    expect(getMissMargin(state, "fracture")).toEqual({
      kind: "fracture",
      clearInSec: delay,
    });
  });

  it("is null when the shape would overflow before the sectors clear", () => {
    const state = blockedAt(fractureState(1e6));
    expect(getFractureClearDelay(state)).toBeNull();
    expect(getMissMargin(state, "fracture")).toBeNull();
  });
});
