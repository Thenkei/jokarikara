import { describe, expect, it } from "vitest";
import { createInitialState, getStackQuality, spawnActiveShape } from "../core/gameState";
import { getReverseQualityRatio, REVERSE_SPAWN_RATIO } from "./reverse";
import { isTapBlockedByFracture } from "./fracture";
import { STYLE_QUALITY_THRESHOLDS } from "../constants/game";
import type { GameMode, GameState } from "../types";
import {
  advanceTimingCue,
  CUE_LEAD_START_RATIO,
  CUE_MAX_INTERVAL,
  CUE_MIN_GAP,
  CUE_MIN_INTERVAL,
  CUE_PITCH_STEPS,
  CUE_WINDOW_INTERVAL,
  getCueReading,
  getCueTiming,
  IDLE_CUE_CLOCK,
  isTimingCueWorld,
  stepTimingCue,
  type CueClock,
  type CueTiming,
} from "./timingCue";

const PERFECT = STYLE_QUALITY_THRESHOLDS.perfectMinRatio;

/** Fresh run with circle-on-circle shapes, so containment is size-only. */
const fresh = (mode: GameMode = "CLASSIC", world = 1): GameState => {
  const base = spawnActiveShape(createInitialState(1000, mode, 424242));
  const shapes = base.shapes.map((shape) => ({ ...shape, type: "circle" as const }));
  return {
    ...base,
    world,
    shapes,
    activeShape: { ...base.activeShape!, type: "circle", rotation: 0 },
    activeOffset: { x: 0, y: 0 },
  };
};

const lastSize = (state: GameState) => state.shapes[state.shapes.length - 1].size;

/** Same state with the active shape at `ratio` × the last stacked size. */
const at = (state: GameState, ratio: number): GameState => ({
  ...state,
  activeShape: { ...state.activeShape!, size: lastSize(state) * ratio },
});

const approach = (interval: number, step = 0): CueTiming => ({
  interval,
  step,
  inWindow: false,
});
const windowTiming: CueTiming = {
  interval: CUE_WINDOW_INTERVAL,
  step: CUE_PITCH_STEPS - 1,
  inWindow: true,
};

describe("timing cue: worlds", () => {
  it("is available everywhere except the Heartbeat world", () => {
    for (let world = 1; world <= 9; world += 1) {
      expect(isTimingCueWorld(world)).toBe(true);
    }
    expect(isTimingCueWorld(10)).toBe(false);
  });
});

describe("timing cue: reading (regular worlds)", () => {
  const state = fresh();
  const entryRatio = PERFECT;

  it("is silent while the shape is far from the band", () => {
    expect(getCueReading(state)).toBeNull(); // just spawned
    expect(getCueReading(at(state, CUE_LEAD_START_RATIO * entryRatio * 0.99))).toBeNull();
  });

  it("measures progress from the lead start to the PERFECT entry", () => {
    expect(getCueReading(at(state, CUE_LEAD_START_RATIO * entryRatio))).toEqual({
      progress: 0,
      inWindow: false,
    });
    const midRatio = ((CUE_LEAD_START_RATIO + 1) / 2) * entryRatio;
    expect(getCueReading(at(state, midRatio))?.progress).toBeCloseTo(0.5, 10);
    const nearly = getCueReading(at(state, entryRatio * 0.999));
    expect(nearly?.inWindow).toBe(false);
    expect(nearly?.progress).toBeGreaterThan(0.99);
  });

  it("is in the window exactly where a tap scores PERFECT", () => {
    for (const ratio of [0.5, 0.9, 0.95, 0.969, 0.97, 0.98, 0.995]) {
      const reading = getCueReading(at(state, ratio));
      const perfect = getStackQuality(ratio) === "PERFECT";
      expect(reading?.inWindow ?? false).toBe(perfect);
    }
  });

  it("goes silent once the shape no longer fits (a tap would miss)", () => {
    expect(getCueReading(at(state, 1.02))).toBeNull();
  });

  it("is silent after game over or without an active shape", () => {
    expect(getCueReading({ ...at(state, 0.98), isGameOver: true })).toBeNull();
    expect(getCueReading({ ...state, activeShape: null })).toBeNull();
  });

  it("is silent in the Heartbeat world", () => {
    const heartbeat = fresh("CLASSIC", 10);
    expect(getCueReading(at(heartbeat, 0.9))).toBeNull();
    expect(getCueReading(at(heartbeat, 0.98))).toBeNull();
  });

  it("does not ring the PERFECT tick while a fracture blocks the tap", () => {
    const base = at(fresh("CLASSIC", 3), 0.98);
    let blocked: GameState | null = null;
    let open: GameState | null = null;
    for (let t = 0; t < 20 && (!blocked || !open); t += 0.01) {
      const probe = { ...base, elapsedTime: t };
      if (isTapBlockedByFracture(probe, t)) blocked ??= probe;
      else open ??= probe;
    }
    expect(blocked).not.toBeNull();
    expect(open).not.toBeNull();
    expect(getCueReading(blocked!)).toBeNull();
    expect(getCueReading(open!)).toEqual({ progress: 1, inWindow: true });
  });
});

describe("timing cue: reading (reverse world)", () => {
  const state = fresh("CLASSIC", 9);

  it("approaches from the spawn size towards containing the previous shape", () => {
    expect(getCueReading(at(state, REVERSE_SPAWN_RATIO))).toEqual({
      progress: 0,
      inWindow: false,
    });
    expect(getCueReading(at(state, REVERSE_SPAWN_RATIO * 0.99))).toBeNull();
    const mid = (REVERSE_SPAWN_RATIO + 1) / 2;
    expect(getCueReading(at(state, mid))?.progress).toBeCloseTo(0.5, 10);
  });

  it("is in the window exactly where a tap scores PERFECT", () => {
    // (The exact float edge 1 / PERFECT is left out: scoring and the guide
    // round it differently, which no frame can actually land on.)
    for (const ratio of [0.99, 1.0, 1.01, 1.03, (1 / PERFECT) * 0.999, 1.04]) {
      const reading = getCueReading(at(state, ratio));
      const quality = getStackQuality(getReverseQualityRatio(ratio, 1));
      expect(reading?.inWindow ?? false).toBe(ratio >= 1 && quality === "PERFECT");
    }
  });

  it("goes silent once the PERFECT band is passed", () => {
    expect(getCueReading(at(state, (1 / PERFECT) * 1.01))).toBeNull();
    expect(getCueReading(at(state, 1.2))).toBeNull();
  });
});

describe("timing cue: timing curve", () => {
  it("is silent without a reading", () => {
    expect(getCueTiming(null)).toBeNull();
  });

  it("speeds up geometrically from the slowest to the fastest interval", () => {
    const start = getCueTiming({ progress: 0, inWindow: false })!;
    const mid = getCueTiming({ progress: 0.5, inWindow: false })!;
    const end = getCueTiming({ progress: 1, inWindow: false })!;
    expect(start.interval).toBeCloseTo(CUE_MAX_INTERVAL, 10);
    expect(end.interval).toBeCloseTo(CUE_MIN_INTERVAL, 10);
    expect(mid.interval).toBeCloseTo(Math.sqrt(CUE_MAX_INTERVAL * CUE_MIN_INTERVAL), 10);

    let previous = Number.POSITIVE_INFINITY;
    for (let p = 0; p <= 1; p += 0.05) {
      const { interval } = getCueTiming({ progress: p, inWindow: false })!;
      expect(interval).toBeLessThan(previous);
      previous = interval;
    }
  });

  it("raises the pitch step with progress and keeps it in range", () => {
    const steps = [0, 0.24, 0.25, 0.5, 0.75, 0.99, 1, 1.5, -1].map(
      (progress) => getCueTiming({ progress, inWindow: false })!.step,
    );
    expect(steps).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 0]);
  });

  it("uses a dedicated window timing", () => {
    expect(getCueTiming({ progress: 1, inWindow: true })).toEqual(windowTiming);
  });
});

describe("timing cue: stepper", () => {
  it("ticks immediately when an approach starts", () => {
    const { clock, tick } = stepTimingCue(IDLE_CUE_CLOCK, 5, approach(0.4, 1));
    expect(tick).toEqual({ step: 1, inWindow: false });
    expect(clock).toEqual({ lastTickAt: 5, inWindow: false });
  });

  it("waits for the interval between ticks", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: false };
    expect(stepTimingCue(clock, 5.39, approach(0.4)).tick).toBeNull();
    expect(stepTimingCue(clock, 5.4, approach(0.4)).tick).not.toBeNull();
  });

  it("follows a shrinking interval (accelerando)", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: false };
    expect(stepTimingCue(clock, 5.2, approach(0.4)).tick).toBeNull();
    expect(stepTimingCue(clock, 5.2, approach(0.15)).tick).not.toBeNull();
  });

  it("rings the window tick on entry without waiting out the interval", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: false };
    const { tick, clock: next } = stepTimingCue(clock, 5 + CUE_MIN_GAP, windowTiming);
    expect(tick).toEqual({ step: CUE_PITCH_STEPS - 1, inWindow: true });
    expect(next).toEqual({ lastTickAt: 5 + CUE_MIN_GAP, inWindow: true });
  });

  it("never ticks closer than the minimum gap, but keeps the entry pending", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: false };
    const held = stepTimingCue(clock, 5.02, windowTiming);
    expect(held.tick).toBeNull();
    expect(held.clock.inWindow).toBe(false);
    expect(stepTimingCue(held.clock, 5 + CUE_MIN_GAP, windowTiming).tick?.inWindow).toBe(
      true,
    );
  });

  it("re-strikes the window tick while the shape stays in the band", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: true };
    expect(stepTimingCue(clock, 5.1, windowTiming).tick).toBeNull();
    expect(stepTimingCue(clock, 5 + CUE_WINDOW_INTERVAL, windowTiming).tick).not.toBeNull();
  });

  it("announces a re-entry after being pushed out of the band", () => {
    let clock: CueClock = { lastTickAt: 5, inWindow: true };
    clock = stepTimingCue(clock, 5.03, approach(0.4)).clock;
    expect(clock).toEqual({ lastTickAt: 5, inWindow: false });
    expect(stepTimingCue(clock, 5.07, windowTiming).tick?.inWindow).toBe(true);
  });

  it("resets when silent so the next approach starts fresh", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: true };
    const silent = stepTimingCue(clock, 5.01, null);
    expect(silent).toEqual({ clock: IDLE_CUE_CLOCK, tick: null });
    expect(stepTimingCue(silent.clock, 5.02, approach(0.4)).tick).not.toBeNull();
  });

  it("treats a clock that went backwards as a fresh start", () => {
    const clock: CueClock = { lastTickAt: 50, inWindow: false };
    expect(stepTimingCue(clock, 1, approach(0.4)).tick).not.toBeNull();
  });

  it("does not allocate a new clock on idle frames", () => {
    const clock: CueClock = { lastTickAt: 5, inWindow: false };
    expect(stepTimingCue(clock, 5.1, approach(0.4)).clock).toBe(clock);
  });
});

describe("timing cue: simulated approach", () => {
  /** Grow linearly from `fromRatio` to `toRatio` over `seconds` at 60 Hz. */
  const simulate = (state: GameState, fromRatio: number, toRatio: number, seconds = 3) => {
    const dt = 1 / 60;
    const frames = Math.round(seconds / dt);
    const ticks: { t: number; step: number; inWindow: boolean }[] = [];
    let clock = IDLE_CUE_CLOCK;
    for (let i = 0; i <= frames; i += 1) {
      const ratio = fromRatio + ((toRatio - fromRatio) * i) / frames;
      const frame = { ...at(state, ratio), elapsedTime: i * dt };
      const result = advanceTimingCue(clock, frame);
      clock = result.clock;
      if (result.tick) ticks.push({ t: frame.elapsedTime, ...result.tick });
    }
    return ticks;
  };

  it("accelerates, climbs in pitch and lands on the window tick", () => {
    const ticks = simulate(fresh(), 0.3, 1.0);
    const approachTicks = ticks.filter((t) => !t.inWindow);
    const windowTicks = ticks.filter((t) => t.inWindow);

    expect(approachTicks.length).toBeGreaterThan(5);
    expect(windowTicks.length).toBeGreaterThanOrEqual(1);
    // All approach ticks precede the first window tick.
    expect(approachTicks.at(-1)!.t).toBeLessThan(windowTicks[0].t);

    const gaps = approachTicks.slice(1).map((tick, i) => tick.t - approachTicks[i].t);
    expect(gaps[0]).toBeGreaterThan(gaps.at(-1)!);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(CUE_MIN_GAP);

    const steps = approachTicks.map((t) => t.step);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps[0]).toBe(0);
    expect(steps.at(-1)).toBe(CUE_PITCH_STEPS - 1);
  });

  it("follows the reverse target in world 9 and stops after the band", () => {
    const ticks = simulate(fresh("CLASSIC", 9), REVERSE_SPAWN_RATIO, 1.15);
    const windowTicks = ticks.filter((t) => t.inWindow);
    expect(windowTicks.length).toBeGreaterThanOrEqual(1);
    const exitTime = ((1 / PERFECT - REVERSE_SPAWN_RATIO) / (1.15 - REVERSE_SPAWN_RATIO)) * 3;
    expect(ticks.at(-1)!.t).toBeLessThanOrEqual(exitTime + 1 / 60);
  });

  it("stays silent through a whole approach in the Heartbeat world", () => {
    expect(simulate(fresh("CLASSIC", 10), 0.3, 1.0)).toEqual([]);
  });
});
