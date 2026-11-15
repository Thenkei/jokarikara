import { getWorldRoot, semitonesToRatio } from "./music";
import {
  alignToGrid,
  chooseArpeggioNote,
  DRONE_FILTER_HZ,
  DRONE_FILTER_Q,
  DRONE_LEVEL,
  getEffectiveIntensity,
  getLayerTargets,
  getPulseNote,
  getStepSeconds,
  getTensionParams,
  LAYER_FADE_SECONDS,
  MUSIC_FADE_IN_SECONDS,
  resyncStepTime,
  sanitizeTension,
  SCHEDULE_AHEAD_SECONDS,
  SCHEDULE_LEAD_SECONDS,
  SCHEDULER_INTERVAL_MS,
  STEPS_PER_BAR,
  TENSION_ATTACK_SECONDS,
  TENSION_RELEASE_SECONDS,
  WORLD_CROSSFADE_SECONDS,
} from "./soundtrack";
import type { MusicIntensity } from "./types";

/** Exponential envelopes cannot reach 0; this is effectively silence. */
const SILENCE = 0.0001;
/** Shortest fade ever applied, to avoid zero-length (clicking) ramps. */
const MIN_FADE_SECONDS = 0.01;
/** How far the slow LFO sweeps the drone low-pass around its base cutoff. */
const DRONE_FILTER_SWEEP_HZ = 260;
/** Very slow filter movement (~14 s cycle) so the pad breathes. */
const DRONE_LFO_HZ = 0.07;
/** Small detune between drone voices: a gentle chorus instead of a static tone. */
const DRONE_DETUNE_CENTS = 4;

type RhythmLayer = 1 | 2;

/** Dominant pedal: a fifth above the world root (inside the drone's filter). */
const pedalHz = (world: number): number => getWorldRoot(world) * semitonesToRatio(7);

interface DroneVoice {
  oscillators: OscillatorNode[];
  gain: GainNode;
  world: number;
}

/**
 * Time Attack tension voice, built on the first tense second and kept until
 * the session stops (calm, it is two silent oscillators: cheaper than a
 * rebuild when a time bonus is followed by another close call).
 */
interface TensionVoice {
  /** One cycle per eighth note, phase-locked so its peaks land on the step grid. */
  lfo: OscillatorNode;
  /** LFO amount into the tremolo gain (depth / 2). */
  lfoDepth: GainNode;
  pedal: OscillatorNode;
  pedalGain: GainNode;
}

interface Session {
  bus: GainNode;
  filter: BiquadFilterNode;
  /** Drone tremolo stage (filter -> tremolo -> bus); unity while calm. */
  tremolo: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  drone: DroneVoice;
  /** Drones fading out after a world change; released on their onended. */
  retiringDrones: Set<DroneVoice>;
  layerGains: Record<RhythmLayer, GainNode>;
  /** Audio-clock time until which a layer keeps receiving notes (its fade-out). */
  layerActiveUntil: Record<RhythmLayer, number>;
  /** Requested (streak) intensity. */
  intensity: MusicIntensity;
  /** Layers actually playing: the intensity, raised by tension. */
  layerIntensity: MusicIntensity;
  tension: number;
  tensionVoice: TensionVoice | null;
  /** Audio-clock anchor of the eighth-note grid every rhythmic event sits on. */
  gridOrigin: number;
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
 *   drone oscs (root + fifth) -> drone gain -> low-pass (LFO on cutoff)
 *     -> tremolo -> bus
 *   [tension] dominant pedal -> pedal gain -> low-pass
 *   [tension] eighth-note LFO -> depth -> tremolo.gain
 *   pulse notes  -> pulse layer gain ----------------------------------> bus
 *   arp notes    -> arp layer gain ------------------------------------> bus
 *   bus -> output (the music gain, which feeds the shared master)
 *
 * Steady state is 3 oscillators (2 drone + LFO) plus at most a couple of
 * short-lived note oscillators; the last seconds of Time Attack add two
 * (pedal + tremolo LFO), built lazily so other modes never pay for them.
 * Rhythmic notes are placed on the AudioContext clock by a lookahead
 * scheduler that only runs while a rhythmic layer is audible, so a
 * drone-only, paused, muted or stopped soundtrack costs no timer work at all.
 * Every rhythmic event sits on one eighth-note grid anchored at session
 * start, so the pulse and the tension tremolo stay in phase.
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

  /** Current tension (for tests/diagnostics); 0 when stopped. */
  getTension(): number {
    return this.session?.tension ?? 0;
  }

  /**
   * Build the graph and fade in. Idempotent: on a running engine it only
   * re-targets world, intensity and tension.
   */
  start(world: number, intensity: MusicIntensity, tension = 0): void {
    if (this.session) {
      this.setWorld(world);
      this.setIntensity(intensity);
      this.setTension(tension);
      return;
    }

    const { ctx } = this;
    const now = ctx.currentTime;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.output);
    glide(bus.gain, getTensionParams(0).busGain, now, MUSIC_FADE_IN_SECONDS);

    const tremolo = ctx.createGain();
    tremolo.gain.value = 1;
    tremolo.connect(bus);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = DRONE_FILTER_HZ;
    filter.Q.value = DRONE_FILTER_Q;
    filter.connect(tremolo);

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
      tremolo,
      lfo,
      lfoDepth,
      drone: this.createDrone(world, filter, now, MUSIC_FADE_IN_SECONDS),
      retiringDrones: new Set(),
      layerGains: { 1: makeLayerGain(), 2: makeLayerGain() },
      layerActiveUntil: { 1: -Infinity, 2: -Infinity },
      intensity: 0,
      layerIntensity: 0,
      tension: 0,
      tensionVoice: null,
      gridOrigin: now + SCHEDULE_LEAD_SECONDS,
      rootHz: getWorldRoot(world),
      timerId: null,
      nextStepTime: now,
      step: 0,
      lastArpNote: null,
    };
    this.session = session;
    this.setIntensity(intensity);
    this.setTension(tension);
  }

  setIntensity(level: MusicIntensity): void {
    const session = this.session;
    if (!session) return;
    session.intensity = level;
    this.applyLayers(session);
  }

  /**
   * Time Attack tension (0..1, see `getTensionParams`): opens the drone
   * filter, pulses the drone on the eighth-note grid, brings in a dominant
   * pedal, lifts the bus slightly and forces the bass pulse in. Every change
   * is a glide from the current value (no clicks); easing out after a time
   * bonus is slower than tightening. An unchanged value is a no-op.
   */
  setTension(value: number): void {
    const session = this.session;
    if (!session) return;
    const tension = sanitizeTension(value);
    if (tension === session.tension) return;
    const rising = tension > session.tension;
    session.tension = tension;

    const now = this.ctx.currentTime;
    const seconds = rising ? TENSION_ATTACK_SECONDS : TENSION_RELEASE_SECONDS;
    const params = getTensionParams(tension);
    if (tension > 0 && !session.tensionVoice) {
      session.tensionVoice = this.createTensionVoice(session, now);
    }
    glide(session.filter.frequency, params.filterHz, now, seconds);
    glide(session.filter.Q, params.filterQ, now, seconds);
    glide(session.bus.gain, params.busGain, now, seconds);
    // Gain swings within [1 - depth, 1]: the tremolo only ever dips.
    glide(session.tremolo.gain, 1 - params.tremoloDepth / 2, now, seconds);
    const voice = session.tensionVoice;
    if (voice) {
      glide(voice.lfoDepth.gain, params.tremoloDepth / 2, now, seconds);
      glide(voice.pedalGain.gain, params.pedalLevel, now, seconds);
    }
    this.applyLayers(session);
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
    // The pedal follows the key over the drone's crossfade (a glide, no jump).
    if (session.tensionVoice) {
      glide(session.tensionVoice.pedal.frequency, pedalHz(world), now, WORLD_CROSSFADE_SECONDS);
    }
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

    const voice = session.tensionVoice;
    if (voice) {
      voice.pedal.onended = () =>
        safeDisconnect(voice.lfo, voice.lfoDepth, voice.pedal, voice.pedalGain);
      for (const osc of [voice.lfo, voice.pedal]) {
        try {
          osc.stop(end);
        } catch {
          // An LFO whose phase-locked start is still ahead may refuse: it
          // never sounded, and the pedal's onended releases it anyway.
        }
      }
    }

    session.lfo.onended = () => {
      safeDisconnect(
        session.lfo,
        session.lfoDepth,
        session.filter,
        session.tremolo,
        session.layerGains[1],
        session.layerGains[2],
        session.bus,
      );
    };
    session.lfo.stop(end);
  }

  /** Fade rhythmic layers in/out to the effective (streak + tension) intensity. */
  private applyLayers(session: Session): void {
    const level = getEffectiveIntensity(session.intensity, session.tension);
    const now = this.ctx.currentTime;
    const targets = getLayerTargets(level);

    for (const layer of [1, 2] as const) {
      const on = targets[layer] > 0;
      const wasOn = session.layerIntensity >= layer;
      if (on === wasOn) continue;
      glide(session.layerGains[layer].gain, targets[layer], now, LAYER_FADE_SECONDS);
      // Keep feeding notes through the fade-out so the layer dissolves
      // instead of stopping on a hard edge.
      session.layerActiveUntil[layer] = on ? Infinity : now + LAYER_FADE_SECONDS;
    }
    session.layerIntensity = level;

    if (level > 0) this.ensureScheduler(session);
  }

  private createTensionVoice(session: Session, now: number): TensionVoice {
    const { ctx } = this;
    const period = this.stepSeconds;

    // Tremolo: one cycle per eighth note (tempo-locked). A sine started at
    // `s` peaks at s + period/4, so starting a quarter period before a grid
    // point puts every peak (the drone at full level) on the pulse's grid.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1 / period;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth);
    lfoDepth.connect(session.tremolo.gain);
    const firstPeak = alignToGrid(
      session.gridOrigin,
      now + SCHEDULE_LEAD_SECONDS + period / 4,
      period,
    ).time;
    lfo.start(firstPeak - period / 4);

    const pedalGain = ctx.createGain();
    pedalGain.gain.value = 0;
    pedalGain.connect(session.filter);
    const pedal = ctx.createOscillator();
    // Triangle: its odd partials are what the opening filter reveals.
    pedal.type = "triangle";
    pedal.frequency.value = pedalHz(session.drone.world);
    pedal.connect(pedalGain);
    pedal.start(now);

    return { lfo, lfoDepth, pedal, pedalGain };
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

  /** Put the next step on the session grid, a hair ahead of `now`. */
  private snapToGrid(session: Session, now: number): void {
    const next = alignToGrid(
      session.gridOrigin,
      now + SCHEDULE_LEAD_SECONDS,
      this.stepSeconds,
    );
    session.nextStepTime = next.time;
    session.step = next.step;
  }

  private ensureScheduler(session: Session): void {
    if (session.timerId !== null) return;
    // Re-enter on the session grid (not a fresh downbeat), so the pulse stays
    // in phase with the tension tremolo and with its own earlier bars.
    this.snapToGrid(session, this.ctx.currentTime);
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
    if (resyncStepTime(session.nextStepTime, now, this.stepSeconds) !== session.nextStepTime) {
      // Fell behind (throttled timer, stall): skip the missed steps and
      // land back on the grid instead of bursting them.
      this.snapToGrid(session, now);
    }
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
