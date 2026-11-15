import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MusicEngine } from "./musicEngine";
import { getWorldRoot } from "./music";
import {
  DRONE_FILTER_HZ,
  getStepSeconds,
  getTensionParams,
  LAYER_FADE_SECONDS,
  LAYER_LEVELS,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULER_INTERVAL_MS,
  TENSION_ATTACK_SECONDS,
  TENSION_RELEASE_SECONDS,
  WORLD_CROSSFADE_SECONDS,
} from "./soundtrack";
import {
  makeMockAudioContext,
  type MockAudioContext,
  type MockGain,
  type MockNode,
  type MockOscillator,
  type MockParam,
} from "./mockAudioContext.testutil";

/** Drone (root + fifth) + filter LFO. */
const PERSISTENT_OSCILLATORS = 3;

describe("MusicEngine", () => {
  let mock: MockAudioContext;
  let output: MockGain;
  let engine: MusicEngine;

  /** Advance both clocks: the audio clock and the JS timers driving the scheduler. */
  const advance = (seconds: number) => {
    mock.ctx.currentTime += seconds;
    vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS);
  };

  /** Advance at the scheduler's own cadence, like a running context. */
  const advanceSmoothly = (seconds: number) => {
    const tick = SCHEDULER_INTERVAL_MS / 1000;
    for (let t = 0; t < seconds - 1e-9; t += tick) advance(tick);
  };

  const startTimes = (from: number) =>
    mock.oscillators.slice(from).map((osc) => osc.start.mock.calls[0]?.[0] as number);

  beforeEach(() => {
    vi.useFakeTimers();
    mock = makeMockAudioContext();
    output = mock.ctx.createGain();
    engine = new MusicEngine(mock.asAudioContext(), output as unknown as AudioNode, {
      random: () => 0,
    });
  });

  afterEach(() => {
    engine.stop(0);
    vi.useRealTimers();
  });

  it("starts a drone-only bed with a handful of oscillators and no timer", () => {
    engine.start(1, 0);
    expect(engine.isRunning()).toBe(true);
    expect(mock.oscillators).toHaveLength(PERSISTENT_OSCILLATORS);
    mock.oscillators.forEach((osc) => expect(osc.start).toHaveBeenCalled());
    expect(engine.isScheduling()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tunes the drone to the world root (bass octave) and its fifth", () => {
    engine.start(3, 0);
    const freqs = mock.oscillators.map((osc) => osc.frequency.value);
    const bass = getWorldRoot(3) / 2;
    expect(freqs).toContainEqual(bass);
    expect(freqs.some((f) => Math.abs(f - bass * 1.4983) < 0.5)).toBe(true);
  });

  it("is idempotent: starting again re-targets instead of rebuilding", () => {
    engine.start(1, 0);
    engine.start(1, 0);
    expect(mock.oscillators).toHaveLength(PERSISTENT_OSCILLATORS);
  });

  it("fades the bus in with a smooth glide, never an instant jump", () => {
    engine.start(1, 0);
    const bus = mock.gains.find((g) =>
      g.connect.mock.calls.some(([dest]) => dest === output),
    );
    expect(bus).toBeDefined();
    expect(bus!.gain.value).toBe(0);
    expect(bus!.gain.setTargetAtTime).toHaveBeenCalledWith(1, 0, expect.any(Number));
  });

  it("arms the lookahead scheduler for the pulse layer and fades it in", () => {
    engine.start(1, 0);
    engine.setIntensity(1);
    expect(engine.isScheduling()).toBe(true);

    const layerFadeIns = mock.gains.filter((g) =>
      g.gain.setTargetAtTime.mock.calls.some(([target]) => target === LAYER_LEVELS[1]),
    );
    expect(layerFadeIns).toHaveLength(1);

    // Only notes inside the lookahead window are created.
    const created = mock.oscillators.length - PERSISTENT_OSCILLATORS;
    expect(created).toBeGreaterThan(0);
    startTimes(PERSISTENT_OSCILLATORS).forEach((t) =>
      expect(t).toBeLessThan(SCHEDULE_AHEAD_SECONDS),
    );
  });

  it("schedules notes on the audio clock at a steady tempo", () => {
    engine.start(1, 1);
    for (let i = 0; i < 120; i += 1) advance(SCHEDULER_INTERVAL_MS / 1000);

    const times = startTimes(PERSISTENT_OSCILLATORS);
    // Pulse plays every other eighth note: one quarter note apart.
    const quarter = getStepSeconds() * 2;
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i] - times[i - 1]).toBeCloseTo(quarter, 6);
    }
    // ~3 s at 90 BPM = ~4.5 quarter notes.
    expect(times.length).toBeGreaterThanOrEqual(4);
    expect(times.length).toBeLessThanOrEqual(6);
  });

  it("adds sparse arpeggio notes at intensity 2", () => {
    engine.start(1, 1);
    for (let i = 0; i < 80; i += 1) advance(SCHEDULER_INTERVAL_MS / 1000);
    const pulseOnly = mock.oscillators.length;

    mock.ctx.currentTime = 100;
    const before = mock.oscillators.length;
    engine.setIntensity(2);
    for (let i = 0; i < 80; i += 1) advance(SCHEDULER_INTERVAL_MS / 1000);
    const withArp = mock.oscillators.length - before;

    expect(withArp).toBeGreaterThan(pulseOnly - PERSISTENT_OSCILLATORS);
    const arpRoot = getWorldRoot(1) * 2;
    expect(
      mock.oscillators
        .slice(before)
        .some((osc) => osc.frequency.setValueAtTime.mock.calls[0]?.[0] >= arpRoot),
    ).toBe(true);
  });

  it("keeps a dropped layer playing through its fade, then idles the timer", () => {
    engine.start(1, 2);
    advance(0.5);
    engine.setIntensity(0);
    expect(engine.isScheduling()).toBe(true);

    const atDrop = mock.oscillators.length;
    // Real timer cadence (one 0.6 s jump would read as a stall and resync).
    advanceSmoothly(LAYER_FADE_SECONDS / 2);
    expect(mock.oscillators.length).toBeGreaterThan(atDrop);

    advance(LAYER_FADE_SECONDS);
    advance(0.05);
    expect(engine.isScheduling()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    const idle = mock.oscillators.length;
    advance(2);
    expect(mock.oscillators.length).toBe(idle);
  });

  it("does not burst missed notes after the scheduler stalls", () => {
    engine.start(1, 2);
    advance(0.1);
    const before = mock.oscillators.length;
    // Background-tab style stall: 30 s of audio clock, one timer tick.
    advance(30);
    expect(mock.oscillators.length - before).toBeLessThanOrEqual(2);
  });

  it("crossfades the drone to a new world's root", () => {
    engine.start(1, 0);
    const oldDrone = mock.oscillators.slice(0, PERSISTENT_OSCILLATORS);
    mock.ctx.currentTime = 10;
    engine.setWorld(2);

    const newDrone = mock.oscillators.slice(PERSISTENT_OSCILLATORS);
    expect(newDrone).toHaveLength(2);
    expect(newDrone.map((o) => o.frequency.value)).toContainEqual(getWorldRoot(2) / 2);
    const stoppedOld = oldDrone.filter((o) => o.stop.mock.calls.length > 0);
    expect(stoppedOld).toHaveLength(2);
    stoppedOld.forEach((o) =>
      expect(o.stop).toHaveBeenCalledWith(10 + WORLD_CROSSFADE_SECONDS),
    );

    engine.setWorld(2);
    expect(mock.oscillators).toHaveLength(PERSISTENT_OSCILLATORS + 2);
  });

  it("releases every node and timer on stop", () => {
    engine.start(1, 2);
    advance(1);
    engine.setWorld(2);
    advance(0.5);
    engine.stop(0.6);

    expect(engine.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    mock.oscillators.forEach((osc) => expect(osc.stop).toHaveBeenCalled());

    mock.endStoppedOscillators();
    mock.nodes
      .filter((node) => node !== output)
      .forEach((node) => expect(node.disconnect).toHaveBeenCalled());

    // A late tick must not resurrect anything.
    const count = mock.oscillators.length;
    advance(1);
    expect(mock.oscillators).toHaveLength(count);
  });

  it("treats stop and setters on a stopped engine as no-ops", () => {
    expect(() => {
      engine.stop(0.2);
      engine.setIntensity(2);
      engine.setWorld(4);
    }).not.toThrow();
    expect(mock.oscillators).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  describe("Time Attack tension", () => {
    const STEP = getStepSeconds();

    /** The session's fixed nodes, found through the graph's wiring. */
    const graph = () => {
      const bus = mock.gains.find((g) =>
        g.connect.mock.calls.some(([dest]) => dest === output),
      )!;
      const filter = mock.nodes.find((n) => n.kind === "filter") as MockNode & {
        frequency: MockParam;
        Q: MockParam;
        connect: MockNode["connect"];
      };
      const tremolo = filter.connect.mock.calls[0][0] as MockGain;
      const lfo = mock.oscillators.find(
        (o) => Math.abs(o.frequency.value - 1 / STEP) < 1e-9,
      );
      const pedalHz = getWorldRoot(1) * 2 ** (7 / 12);
      const pedal = mock.oscillators.find(
        (o) => Math.abs(o.frequency.value - pedalHz) < 1e-6,
      );
      const target = (osc: MockOscillator | undefined) =>
        osc?.connect.mock.calls[0]?.[0] as MockGain | undefined;
      return {
        bus,
        filter,
        tremolo,
        lfo,
        lfoDepth: target(lfo),
        pedal,
        pedalGain: target(pedal),
      };
    };
    /** Last glide target of a param: [target, startTime, timeConstant]. */
    const lastGlide = (param: MockParam) => param.setTargetAtTime.mock.calls.at(-1);

    it("costs nothing extra while calm: no tension voice, no scheduler", () => {
      engine.start(1, 0);
      engine.setTension(0);
      expect(mock.oscillators).toHaveLength(PERSISTENT_OSCILLATORS);
      expect(engine.isScheduling()).toBe(false);
      expect(engine.getTension()).toBe(0);
    });

    it("tightens the bed with glides: filter, tremolo, pedal, bus lift and the pulse", () => {
      engine.start(1, 0);
      mock.ctx.currentTime = 5;
      engine.setTension(1);
      const g = graph();
      const full = getTensionParams(1);
      const tau = TENSION_ATTACK_SECONDS / 4;

      expect(lastGlide(g.filter.frequency)).toEqual([full.filterHz, 5, tau]);
      expect(full.filterHz).toBeGreaterThan(DRONE_FILTER_HZ * 2);
      expect(lastGlide(g.filter.Q)).toEqual([full.filterQ, 5, tau]);
      expect(lastGlide(g.bus.gain)).toEqual([full.busGain, 5, tau]);
      expect(lastGlide(g.tremolo.gain)).toEqual([1 - full.tremoloDepth / 2, 5, tau]);
      expect(lastGlide(g.lfoDepth!.gain)).toEqual([full.tremoloDepth / 2, 5, tau]);
      expect(lastGlide(g.pedalGain!.gain)).toEqual([full.pedalLevel, 5, tau]);
      // Nothing jumps: no param of the session is set instantly.
      for (const param of [g.filter.frequency, g.bus.gain, g.tremolo.gain]) {
        expect(param.setValueAtTime).not.toHaveBeenCalled();
      }
      // The bass pulse comes in although the streak is 0.
      expect(engine.isScheduling()).toBe(true);
      expect(
        mock.gains.some((gain) =>
          gain.gain.setTargetAtTime.mock.calls.some(([t]) => t === LAYER_LEVELS[1]),
        ),
      ).toBe(true);
      expect(engine.getTension()).toBe(1);
    });

    it("locks the tremolo to the tempo and puts its peaks on the pulse grid", () => {
      engine.start(1, 0);
      mock.ctx.currentTime = 3.21;
      engine.setTension(0.5);
      const { lfo } = graph();
      expect(lfo).toBeDefined();
      // One cycle per eighth note at the soundtrack tempo.
      expect(lfo!.frequency.value).toBeCloseTo(1 / STEP, 9);
      advanceSmoothly(2);

      const lfoStart = lfo!.start.mock.calls[0][0] as number;
      expect(lfoStart).toBeGreaterThanOrEqual(3.21);
      const firstPeak = lfoStart + STEP / 4;
      const pulseStarts = startTimes(PERSISTENT_OSCILLATORS + 2);
      expect(pulseStarts.length).toBeGreaterThan(0);
      for (const t of pulseStarts) {
        const cycles = (t - firstPeak) / STEP;
        expect(Math.abs(cycles - Math.round(cycles))).toBeLessThan(1e-6);
      }
    });

    it("eases back out after a time bonus, slower than it tightened", () => {
      engine.start(1, 0);
      engine.setTension(0.8);
      const voiceOscillators = mock.oscillators.length;
      mock.ctx.currentTime = 2;
      engine.setTension(0);
      const g = graph();
      const tau = TENSION_RELEASE_SECONDS / 4;
      expect(TENSION_RELEASE_SECONDS).toBeGreaterThan(TENSION_ATTACK_SECONDS);

      expect(lastGlide(g.filter.frequency)).toEqual([DRONE_FILTER_HZ, 2, tau]);
      expect(lastGlide(g.filter.Q)).toEqual([getTensionParams(0).filterQ, 2, tau]);
      expect(lastGlide(g.bus.gain)).toEqual([1, 2, tau]);
      expect(lastGlide(g.tremolo.gain)).toEqual([1, 2, tau]);
      expect(lastGlide(g.lfoDepth!.gain)).toEqual([0, 2, tau]);
      expect(lastGlide(g.pedalGain!.gain)).toEqual([0, 2, tau]);

      // The forced pulse fades out with the layer fade, then the timer idles.
      advanceSmoothly(LAYER_FADE_SECONDS + 0.2);
      expect(engine.isScheduling()).toBe(false);

      // Another close call reuses the tension voice (no new persistent nodes).
      const before = mock.oscillators.length;
      engine.setTension(0.3);
      expect(mock.oscillators.length - before).toBeLessThanOrEqual(2); // notes only
      expect(
        mock.oscillators.filter((o) => Math.abs(o.frequency.value - 1 / STEP) < 1e-9),
      ).toHaveLength(1);
      expect(voiceOscillators).toBeGreaterThan(PERSISTENT_OSCILLATORS);
    });

    it("leaves streak layers alone when tension releases", () => {
      engine.start(1, 2);
      engine.setTension(1);
      engine.setTension(0);
      const pulseFadedOut = mock.gains.some((gain) =>
        gain.gain.setTargetAtTime.mock.calls.some(
          ([t], i, calls) => t === 0 && i > 0 && calls[i - 1][0] === LAYER_LEVELS[1],
        ),
      );
      expect(pulseFadedOut).toBe(false);
      expect(engine.isScheduling()).toBe(true);
    });

    it("ignores repeated and invalid values", () => {
      engine.start(1, 0);
      engine.setTension(0.5);
      const { filter } = graph();
      const glides = filter.frequency.setTargetAtTime.mock.calls.length;
      engine.setTension(0.5);
      engine.setTension(Number.NaN); // treated as calm
      expect(engine.getTension()).toBe(0);
      engine.setTension(7); // clamped
      expect(engine.getTension()).toBe(1);
      expect(filter.frequency.setTargetAtTime.mock.calls.length).toBe(glides + 2);
    });

    it("moves the pedal to the new key with the world crossfade", () => {
      engine.start(1, 0);
      engine.setTension(1);
      const { pedal } = graph();
      mock.ctx.currentTime = 4;
      engine.setWorld(3);
      expect(lastGlide(pedal!.frequency)).toEqual([
        getWorldRoot(3) * 2 ** (7 / 12),
        4,
        WORLD_CROSSFADE_SECONDS / 4,
      ]);
    });

    it("rebuilds tense (resume after a pause in the last seconds)", () => {
      engine.start(1, 0, 0.6);
      expect(engine.getTension()).toBe(0.6);
      expect(graph().pedal).toBeDefined();
      expect(engine.isScheduling()).toBe(true);
    });

    it("releases the tension voice with everything else on stop", () => {
      engine.start(1, 0);
      engine.setTension(1);
      advanceSmoothly(0.5);
      engine.stop(0.25);
      expect(vi.getTimerCount()).toBe(0);
      mock.oscillators.forEach((osc) => expect(osc.stop).toHaveBeenCalled());
      mock.endStoppedOscillators();
      mock.nodes
        .filter((node) => node !== output)
        .forEach((node) => expect(node.disconnect).toHaveBeenCalled());
      expect(engine.getTension()).toBe(0);
      expect(() => engine.setTension(1)).not.toThrow();
    });
  });
});
