import { getWorldRoot, semitonesToRatio } from "./music";
import {
  chooseArpeggioNote,
  DRONE_LEVEL,
  getLayerTargets,
  getPulseNote,
  getStepSeconds,
  LAYER_FADE_SECONDS,
  MUSIC_FADE_IN_SECONDS,
  resyncStepTime,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULER_INTERVAL_MS,
  STEPS_PER_BAR,
  WORLD_CROSSFADE_SECONDS,
} from "./soundtrack";
import type { MusicIntensity } from "./types";

/** Exponential envelopes cannot reach 0; this is effectively silence. */
const SILENCE = 0.0001;
/** Shortest fade ever applied, to avoid zero-length (clicking) ramps. */
const MIN_FADE_SECONDS = 0.01;
/** Base cutoff of the drone low-pass and how far the LFO sweeps it. */
const DRONE_FILTER_HZ = 520;
const DRONE_FILTER_SWEEP_HZ = 260;
/** Very slow filter movement (~14 s cycle) so the pad breathes. */
const DRONE_LFO_HZ = 0.07;
/** Small detune between drone voices: a gentle chorus instead of a static tone. */
const DRONE_DETUNE_CENTS = 4;

type RhythmLayer = 1 | 2;

interface DroneVoice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  world: number;
}

interface Session {
  bus: GainNode;
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  drone: DroneVoice;
  /** Drones fading out after a world change; released on their onended. */
  retiringDrones: Set<DroneVoice>;
  layerGains: Record<RhythmLayer, GainNode>;
  /** Audio-clock time until which a layer keeps receiving notes (its fade-out). */
  layerActiveUntil: Record<RhythmLayer, number>;
  intensity: MusicIntensity;
  rootHz: number;
  timerId: ReturnType<typeof setInterval> | null;
  nextStepTime: number;
  step: number;
  lastArpNote: number | null;
}

export interface MusicEngineOptions {
  /** Injected for deterministic tests; defaults to Math.random. */
  random?: () => number;
}

/**
 * Glide a param toward `target` starting from wherever it currently is.
 * setTargetAtTime always departs from the param's computed value, so
 * overlapping fades never jump (unlike cancelScheduledValues + linear ramps,
 * which can snap back on browsers without cancelAndHoldAtTime).
 */
const glide = (
  param: AudioParam,
  target: number,
  now: number,
  seconds: number,
): void => {
  // ~98% of the way there after `seconds` (4 time constants).
  param.setTargetAtTime(target, now, Math.max(seconds, MIN_FADE_SECONDS) / 4);
};

const safeDisconnect = (...nodes: AudioNode[]): void => {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Already disconnected: nothing to release.
    }
  }
};

/**
 * Procedural ambient soundtrack. A session is a small, fixed graph:
 *
 *   drone oscs (root + fifth) -> drone gain -> low-pass (LFO on cutoff) -> bus
 *   pulse notes  -> pulse layer gain ----------------------------------> bus
 *   arp notes    -> arp layer gain ------------------------------------> bus
 *   bus -> output (the music gain, which feeds the shared master)
 *
 * Steady state is 3 oscillators (2 drone + LFO) plus at most a couple of
 * short-lived note oscillators. Rhythmic notes are placed on the AudioContext
 * clock by a lookahead scheduler that only runs while a rhythmic layer is
 * audible, so a drone-only, paused, muted or stopped soundtrack costs no
 * timer work at all.
 */
export class MusicEngine {
  private session: Session | null = null;
  private readonly ctx: AudioContext;
  private readonly output: AudioNode;
  private readonly random: () => number;
  private readonly stepSeconds = getStepSeconds();

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    options: MusicEngineOptions = {},
  ) {
    this.ctx = ctx;
    this.output = output;
    this.random = options.random ?? Math.random;
  }

  isRunning(): boolean {
    return this.session !== null;
  }

  /** Whether the lookahead timer is currently armed (for tests/diagnostics). */
  isScheduling(): boolean {
    return this.session?.timerId != null;
  }

  /**
   * Build the graph and fade in. Idempotent: on a running engine it only
   * re-targets world and intensity.
   */
  start(world: number, intensity: MusicIntensity): void {
    if (this.session) {
      this.setWorld(world);
      this.setIntensity(intensity);
      return;
    }

    const { ctx } = this;
    const now = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.output);
    glide(bus.gain, 1, now, MUSIC_FADE_IN_SECONDS);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = DRONE_FILTER_HZ;
    filter.Q.value = 0.7;
    filter.connect(bus);

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = DRONE_LFO_HZ;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = DRONE_FILTER_SWEEP_HZ;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start(now);

    const makeLayerGain = (): GainNode => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(bus);
      return gain;
    };

    const session: Session = {
      bus,
      filter,
      lfo,
      lfoDepth,
      drone: this.createDrone(world, filter, now, MUSIC_FADE_IN_SECONDS),
      retiringDrones: new Set(),
      layerGains: { 1: makeLayerGain(), 2: makeLayerGain() },
      layerActiveUntil: { 1: -Infinity, 2: -Infinity },
      intensity: 0,
      rootHz: getWorldRoot(world),
      timerId: null,
      nextStepTime: now,
      step: 0,
      lastArpNote: null,
    };
    this.session = session;
    this.setIntensity(intensity);
  }

  setIntensity(level: MusicIntensity): void {
    const session = this.session;
    if (!session) return;
    const now = this.ctx.currentTime;
    const targets = getLayerTargets(level);

    for (const layer of [1, 2] as const) {
      const on = targets[layer] > 0;
      const wasOn = session.intensity >= layer;
      if (on === wasOn) continue;
      glide(session.layerGains[layer].gain, targets[layer], now, LAYER_FADE_SECONDS);
      // Keep feeding notes through the fade-out so the layer dissolves
      // instead of stopping on a hard edge.
      session.layerActiveUntil[layer] = on ? Infinity : now + LAYER_FADE_SECONDS;
    }
    session.intensity = level;

    if (level > 0) this.ensureScheduler(session);
  }

  setWorld(world: number): void {
    const session = this.session;
    if (!session || session.drone.world === world) return;
    const now = this.ctx.currentTime;

    const outgoing = session.drone;
    glide(outgoing.gain.gain, 0, now, WORLD_CROSSFADE_SECONDS);
    this.retireDrone(session, outgoing, now + WORLD_CROSSFADE_SECONDS);

    session.drone = this.createDrone(world, session.filter, now, WORLD_CROSSFADE_SECONDS);
    session.rootHz = getWorldRoot(world);
  }

  /**
   * Fade out and release everything. Oscillators are stopped at the end of
   * the fade and every node is disconnected once its source has ended.
   */
  stop(fadeSeconds: number): void {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.clearScheduler(session);

    const fade = Math.max(fadeSeconds, MIN_FADE_SECONDS);
    const now = this.ctx.currentTime;
    const end = now + fade;
    glide(session.bus.gain, 0, now, fade);

    for (const drone of [session.drone, ...session.retiringDrones]) {
      this.retireDrone(session, drone, end);
    }

    session.lfo.onended = () => {
      safeDisconnect(
        session.lfo,
        session.lfoDepth,
        session.filter,
        session.layerGains[1],
        session.layerGains[2],
        session.bus,
      );
    };
    session.lfo.stop(end);
  }

  private createDrone(
    world: number,
    destination: AudioNode,
    now: number,
    fadeSeconds: number,
  ): DroneVoice {
    const { ctx } = this;
    // One octave below the world root: warm, out of the SFX register.
    const bass = getWorldRoot(world) / 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(destination);
    glide(gain.gain, DRONE_LEVEL, now, fadeSeconds);

    const voices: Array<{ freq: number; type: OscillatorType; detune: number }> = [
      { freq: bass, type: "triangle", detune: -DRONE_DETUNE_CENTS },
      { freq: bass * semitonesToRatio(7), type: "sine", detune: DRONE_DETUNE_CENTS },
    ];
    const oscillators = voices.map(({ freq, type, detune }) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(now);
      return osc;
    });
    return { oscillators, gain, world };
  }

  private retireDrone(session: Session, drone: DroneVoice, at: number): void {
    session.retiringDrones.add(drone);
    const [first] = drone.oscillators;
    if (first) {
      first.onended = () => {
        safeDisconnect(...drone.oscillators, drone.gain);
        session.retiringDrones.delete(drone);
      };
    }
    for (const osc of drone.oscillators) {
      try {
        osc.stop(at);
      } catch {
        // stop() throws if already scheduled to stop: the earlier stop wins.
      }
    }
  }

  private ensureScheduler(session: Session): void {
    if (session.timerId !== null) return;
    // Start on a fresh downbeat slightly ahead of now.
    session.nextStepTime = this.ctx.currentTime + this.stepSeconds / 4;
    session.step = 0;
    session.timerId = setInterval(() => this.schedule(session), SCHEDULER_INTERVAL_MS);
    this.schedule(session);
  }

  private clearScheduler(session: Session): void {
    if (session.timerId === null) return;
    clearInterval(session.timerId);
    session.timerId = null;
  }

  private schedule(session: Session): void {
    // A stale tick from a stopped session must never touch the graph.
    if (this.session !== session) {
      this.clearScheduler(session);
      return;
    }
    const now = this.ctx.currentTime;
    session.nextStepTime = resyncStepTime(session.nextStepTime, now, this.stepSeconds);
    const horizon = now + SCHEDULE_AHEAD_SECONDS;

    while (session.nextStepTime < horizon) {
      this.scheduleStep(session, session.step, session.nextStepTime);
      session.nextStepTime += this.stepSeconds;
      session.step = (session.step + 1) % STEPS_PER_BAR;
    }

    const anyLayerAlive =
      session.layerActiveUntil[1] > now || session.layerActiveUntil[2] > now;
    if (!anyLayerAlive) this.clearScheduler(session);
  }

  private scheduleStep(session: Session, step: number, time: number): void {
    if (session.layerActiveUntil[1] > time) {
      const semis = getPulseNote(step);
      if (semis !== null) {
        this.note(session.layerGains[1], {
          freq: (session.rootHz / 2) * semitonesToRatio(semis),
          type: "triangle",
          start: time,
          attack: 0.01,
          duration: 0.34,
          peak: 0.55,
        });
      }
    }

    if (session.layerActiveUntil[2] > time) {
      const semis = chooseArpeggioNote(step, this.random(), session.lastArpNote);
      if (semis !== null) {
        session.lastArpNote = semis;
        this.note(session.layerGains[2], {
          freq: session.rootHz * 2 * semitonesToRatio(semis),
          type: "sine",
          start: time,
          attack: 0.03,
          duration: 0.9,
          peak: 0.4,
        });
      }
    }
  }

  private note(
    destination: AudioNode,
    v: {
      freq: number;
      type: OscillatorType;
      start: number;
      attack: number;
      duration: number;
      peak: number;
    },
  ): void {
    const { ctx } = this;
    const end = v.start + v.duration;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, v.start);
    gain.gain.setValueAtTime(SILENCE, v.start);
    gain.gain.linearRampToValueAtTime(v.peak, v.start + v.attack);
    gain.gain.exponentialRampToValueAtTime(SILENCE, end);
    osc.connect(gain);
    gain.connect(destination);
    osc.onended = () => safeDisconnect(osc, gain);
    osc.start(v.start);
    osc.stop(end + 0.02);
  }
}
