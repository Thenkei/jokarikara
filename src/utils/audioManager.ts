import type {
  IAudioService,
  UiSoundKind,
  MusicIntensity,
  MusicState,
  Voice,
} from "../audio/types";
import { MusicEngine } from "../audio/musicEngine";
import {
  MUSIC_VOLUME,
  MUTE_FADE_SECONDS,
  PAUSE_FADE_SECONDS,
  sanitizeTension,
  STOP_FADE_SECONDS,
} from "../audio/soundtrack";
import type { StackQuality } from "../types";
import type { Medal } from "../modes/medals";
import {
  getCueNoteHz,
  getStackNoteHz,
  getTimeUpCadence,
  pentatonicSemitones,
  getWorldRoot,
  LEVEL_UP_ARPEGGIO,
  QUALITY_HARMONY,
  semitonesToRatio,
  WORLD_UP_CHORD,
} from "../audio/music";

/** Seconds the record fanfare waits so the stack note under it reads first. */
const RECORD_DELAY = 0.08;
/**
 * The unlock toast drops in with its cue; a beat of delay lets the stack (or
 * level up) that earned it land first instead of masking the strike.
 */
const ACHIEVEMENT_DELAY = 0.12;

/**
 * Time-up: the chord lands once the bell strike has read (seconds), after
 * its pickup notes, one per step.
 */
const TIME_UP_CHORD_AT = 0.42;
const TIME_UP_PICKUP_STEP = 0.09;

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

import {
  BUS_COMPRESSOR,
  BUS_LIMITER,
  dbToGain,
  MASTER_VOLUME,
  MUSIC_REVERB_SEND_DB,
  SFX_REVERB_SEND_DB,
  SFX_TRIM_DB,
  SOFT_TICK_DB,
  STACK_REVERB_BOOST_DB,
  type SfxId,
} from "../audio/mix";
import {
  DEFAULT_ATTACK_SECONDS,
  getWorldPalette,
  paletteFx,
  paletteHarmony,
  paletteOrder,
  shapeVoices,
  type VoiceFx,
} from "../audio/palette";
import {
  createReverbBus,
  deferToIdle,
  type DeferTask,
  type ReverbBus,
} from "../audio/reverbBus";
import {
  extendAudibleUntil,
  IDLE_SUSPEND_GRACE_SECONDS,
  secondsUntilIdle,
} from "../audio/idle";

export interface AudioManagerOptions {
  /**
   * Schedules non-urgent setup (the reverb IR). Defaults to an idle callback;
   * offline renders and tests inject a synchronous or manual one.
   */
  defer?: DeferTask;
  /**
   * Suspend the context once nothing is audible (see `audio/idle.ts`).
   * Default true. Always off for offline contexts: their suspend() has
   * render-time semantics and they start via startRendering, not resume.
   */
  idleSuspend?: boolean;
}

/** Margin so an idle check never fires a hair before its audio-clock deadline. */
const IDLE_TIMER_SLACK_MS = 50;

/** An OfflineAudioContext (or a stand-in): rendered, never idle-suspended or resumed. */
const isOfflineContext = (ctx: BaseAudioContext): boolean => "startRendering" in ctx;

/** Exponential ramps cannot target 0; this is effectively silence. */
const SILENCE = 0.0001;

/** Butterworth Q: a palette lowpass darkens without a resonant bump. */
const LOWPASS_Q = Math.SQRT1_2;

/**
 * Per-sound palette effects. `input`/`output` is the filter/tremolo chain the
 * voices feed instead of the master (`null` = route voices directly);
 * `vibrato` is an LFO depth node each oscillator's detune listens to.
 */
type FxChain = {
  input: AudioNode | null;
  output: AudioNode | null;
  vibrato: AudioNode | null;
};

const safeDisconnect = (nodes: readonly AudioNode[]): void => {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Never connected / already released.
    }
  }
};

/**
 * Procedural Web Audio engine. Every sound is a short graph of oscillators
 * with an attack/decay envelope routed through a compressor, so stacked
 * harmonies on fast combos never clip.
 */
class AudioManager implements IAudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  /** Soundtrack bus into the master, below SFX level. */
  private musicGain: GainNode | null = null;
  /** Shared room reverb; `null` means a dry mix (not built yet, unsupported or failed). */
  private reverb: ReverbBus | null = null;
  /** Deferred reverb build: not scheduled, scheduled, or settled (built or given up). */
  private reverbBuild: "idle" | "pending" | "done" = "idle";
  private readonly defer: DeferTask;
  private readonly idleSuspend: boolean;
  /** The single pending idle check (`null` when none is armed). */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Audio clock time when everything scheduled so far, tails included, is silent. */
  private audibleUntil = -Infinity;
  /** We suspended the context for idleness and have not resumed it since. */
  private idleSuspended = false;

  constructor(options: AudioManagerOptions = {}) {
    this.defer = options.defer ?? deferToIdle;
    this.idleSuspend = options.idleSuspend ?? true;
  }
  private music: MusicEngine | null = null;
  private muted = false;
  private musicEnabled = true;
  /**
   * What the game wants from the soundtrack. The engine is reconciled against
   * it (plus mute and the music setting) so every combination of
   * pause/mute/toggle/stop converges to one well-defined state.
   */
  private musicIntent: {
    active: boolean;
    paused: boolean;
    world: number;
    intensity: MusicIntensity;
    /** Time Attack clock tension (0..1); survives pause/mute rebuilds. */
    tension: number;
  } = { active: false, paused: false, world: 1, intensity: 0, tension: 0 };

  prewarm(): void {
    // The first AudioContext is expensive in Chromium (~150 ms measured:
    // output device setup), and it used to be built inside the START tap.
    if (this.muted || this.ctx) return;
    this.init();
  }

  init(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as WindowWithWebkitAudioContext).webkitAudioContext;
    if (!Ctor) return; // Audio unsupported: degrade silently.

    try {
      this.ctx = new Ctor();
    } catch (error) {
      console.warn("Audio unavailable", error);
      return;
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : MASTER_VOLUME;

    // master -> glue compressor -> limiter -> out. Without dynamics support,
    // fall back to a direct connection (levels are conservative enough).
    if (typeof this.ctx.createDynamicsCompressor === "function") {
      const compressor = this.ctx.createDynamicsCompressor();
      const limiter = this.ctx.createDynamicsCompressor();
      const apply = (
        node: DynamicsCompressorNode,
        settings: typeof BUS_COMPRESSOR | typeof BUS_LIMITER,
      ) => {
        node.threshold.value = settings.threshold;
        node.knee.value = settings.knee;
        node.ratio.value = settings.ratio;
        node.attack.value = settings.attack;
        node.release.value = settings.release;
      };
      apply(compressor, BUS_COMPRESSOR);
      apply(limiter, BUS_LIMITER);
      this.masterGain.connect(compressor);
      compressor.connect(limiter);
      limiter.connect(this.ctx.destination);
    } else {
      this.masterGain.connect(this.ctx.destination);
    }

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOLUME;
    this.musicGain.connect(this.masterGain);

    // The dry graph above is all the first sound needs; the reverb (IR
    // generation is several ms, more on low-end phones) follows when idle.
    this.scheduleReverb();
    // A context nothing ends up playing on must not run forever either, but
    // gets the grace: init follows a gesture that usually plays something.
    this.noteAudible(this.ctx.currentTime, 0);
  }

  /**
   * Build the shared reverb off the first-sound path. Sounds played before it
   * exists stay dry; later voices pick up their send in `play()`. Never
   * allocates while muted: a build skipped for mute is retried on unmute or
   * on the next sound. Failures leave the mix dry for the session.
   */
  private scheduleReverb(): void {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (this.reverbBuild !== "idle" || this.muted || !ctx || !master) return;
    this.reverbBuild = "pending";
    const build = () => {
      if (this.muted) {
        this.reverbBuild = "idle";
        return;
      }
      // Torn down, replaced or closed meanwhile: nothing to attach to.
      this.reverbBuild = "done";
      if (this.ctx !== ctx || ctx.state === "closed") return;
      try {
        // Returns into the master, so mute silences the tail too and the
        // compressor/limiter still catch dry + wet together.
        this.reverb = createReverbBus(ctx, master);
        const musicSend = this.reverb?.send(MUSIC_REVERB_SEND_DB);
        if (musicSend) this.musicGain?.connect(musicSend);
      } catch (error) {
        console.warn("Reverb unavailable, mixing dry", error);
      }
    };
    try {
      this.defer(build);
    } catch (error) {
      console.warn("Reverb scheduling unavailable, mixing dry", error);
      this.reverbBuild = "done";
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
    }
    this.reconcileMusic(MUTE_FADE_SECONDS);
    if (!muted) this.scheduleReverb();
    // reconcileMusic re-ran the idle check: muted, the context suspends as
    // soon as anything in flight has rung out.
  }

  isMuted(): boolean {
    return this.muted;
  }

  resume(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // Called from user gestures: this resume is what unlocks the context on
    // iOS. Muted, the idle check suspends it again right away (unlocked);
    // otherwise the gesture counts as activity and gets the grace.
    this.wake(ctx);
    this.noteAudible(ctx.currentTime, 0);
  }

  getContextState(): AudioContextState | null {
    return this.ctx?.state ?? null;
  }

  // --- Idle suspension (rules in audio/idle.ts) --------------------------

  private canIdleSuspend(ctx: AudioContext): boolean {
    return this.idleSuspend && typeof ctx.suspend === "function" && !isOfflineContext(ctx);
  }

  /**
   * Audio stays live whatever is scheduled while the soundtrack runs or a run
   * is in progress (music off included): rhythm feedback such as the timing
   * cue must never wait for a resume.
   */
  private keepAwake(): boolean {
    if (this.muted) return false;
    const { active, paused } = this.musicIntent;
    return (active && !paused) || (this.music?.isRunning() ?? false);
  }

  /**
   * Resume a context we (or the autoplay policy) suspended, before scheduling
   * on it. Its clock is frozen meanwhile, so voices scheduled at
   * `currentTime` right after this play as soon as it runs again. A resume
   * queued behind a still-pending suspend wins: the calls apply in order.
   */
  private wake(ctx: AudioContext): void {
    if (isOfflineContext(ctx)) return;
    if (!this.idleSuspended && ctx.state !== "suspended") return;
    this.idleSuspended = false;
    const failed = (error: unknown) => console.warn("Audio resume failed", error);
    try {
      ctx.resume().catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  /**
   * Audio is scheduled on the context until `end` (audio clock, dry;
   * `tailSeconds` 0 for plain activity, e.g. a gesture that plays nothing yet).
   */
  private noteAudible(end: number, tailSeconds?: number): void {
    this.audibleUntil = extendAudibleUntil(this.audibleUntil, end, tailSeconds);
    this.checkIdle();
  }

  /**
   * (Re)arm the one idle timer, or suspend now when already idle. Runs on
   * sound, music, mute and resume events only, never per frame. Muted,
   * nothing can play: no grace, and no timer unless audio is still in flight
   * (suspending mid-tail would freeze it and replay the rest on unmute).
   */
  private checkIdle(clockAtLeast = -Infinity): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const ctx = this.ctx;
    if (!ctx || this.idleSuspended || ctx.state === "closed" || !this.canIdleSuspend(ctx)) {
      return;
    }
    const now = Math.max(ctx.currentTime, clockAtLeast);
    const wait = secondsUntilIdle({
      now,
      audibleUntil: this.audibleUntil,
      keepAwake: this.keepAwake(),
      graceSeconds: this.muted ? 0 : IDLE_SUSPEND_GRACE_SECONDS,
    });
    if (wait === null) return;
    if (wait === 0) {
      this.suspendForIdle(ctx);
      return;
    }
    // The wall-clock wait is a lower bound for the audio clock on fire: a
    // "running" context whose clock stalls (no output device) renders
    // nothing either, and must not re-arm forever.
    const due = now + wait;
    this.idleTimer = setTimeout(
      () => this.onIdleTimer(due),
      Math.ceil(wait * 1000) + IDLE_TIMER_SLACK_MS,
    );
  }

  private onIdleTimer(due: number): void {
    this.idleTimer = null;
    // Suspended or interrupted by the browser: nothing to save, and its
    // frozen clock must not re-arm us. The next sound wakes it and re-arms.
    if (this.ctx?.state !== "running") return;
    this.checkIdle(due);
  }

  private suspendForIdle(ctx: AudioContext): void {
    this.idleSuspended = true;
    const failed = (error: unknown) => console.warn("Audio idle suspend failed", error);
    try {
      ctx.suspend().catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  // --- Soundtrack -------------------------------------------------------

  startMusic(world: number): void {
    this.musicIntent = { active: true, paused: false, world, intensity: 0, tension: 0 };
    this.reconcileMusic(STOP_FADE_SECONDS);
  }

  setMusicIntensity(level: MusicIntensity): void {
    if (this.musicIntent.intensity === level) return;
    this.musicIntent.intensity = level;
    this.music?.setIntensity(level);
  }

  /**
   * Intent only, like the intensity: never wakes the context or rebuilds the
   * graph, so a tense clock cannot keep audio alive while the music is
   * paused, muted or off; a later rebuild (resume, unmute) picks it up.
   */
  setMusicTension(tension: number): void {
    const value = sanitizeTension(tension);
    if (this.musicIntent.tension === value) return;
    this.musicIntent.tension = value;
    this.music?.setTension(value);
  }

  setMusicWorld(world: number): void {
    if (this.musicIntent.world === world) return;
    this.musicIntent.world = world;
    this.music?.setWorld(world);
  }

  pauseMusic(): void {
    this.musicIntent.paused = true;
    this.reconcileMusic(PAUSE_FADE_SECONDS);
  }

  resumeMusic(): void {
    this.musicIntent.paused = false;
    this.reconcileMusic(PAUSE_FADE_SECONDS);
  }

  stopMusic(): void {
    this.musicIntent = { ...this.musicIntent, active: false, paused: false, tension: 0 };
    this.reconcileMusic(STOP_FADE_SECONDS);
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.reconcileMusic(PAUSE_FADE_SECONDS);
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  getMusicState(): MusicState {
    const { active, paused, intensity, world, tension } = this.musicIntent;
    return {
      active,
      paused,
      enabled: this.musicEnabled,
      playing: this.music?.isRunning() ?? false,
      intensity,
      world,
      tension,
    };
  }

  /**
   * Converge the engine to the desired state. Anything that should be silent
   * (stopped, paused, muted, disabled) tears the graph down entirely: no
   * oscillators, no scheduler timer. Audio failures never reach gameplay.
   */
  private reconcileMusic(fadeSeconds: number): void {
    const { active, paused, world, intensity, tension } = this.musicIntent;
    const shouldPlay = active && !paused && !this.muted && this.musicEnabled;
    try {
      if (!shouldPlay) {
        const fading = this.music?.isRunning() ?? false;
        this.music?.stop(fadeSeconds);
        // Never suspend mid-fade: the bed (and its reverb) rings out first.
        if (fading && this.ctx) {
          this.audibleUntil = extendAudibleUntil(
            this.audibleUntil,
            this.ctx.currentTime + fadeSeconds,
          );
        }
        return;
      }
      if (!this.ctx) this.init();
      if (!this.ctx || !this.musicGain) return;
      this.wake(this.ctx);
      this.music ??= new MusicEngine(this.ctx, this.musicGain);
      this.music.start(world, intensity, tension);
    } catch (error) {
      console.warn("Music unavailable", error);
      try {
        this.music?.stop(0);
      } catch {
        // Engine is already unusable; drop it below.
      }
      this.music = null;
    } finally {
      this.checkIdle();
    }
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.init();
    return this.ctx && this.masterGain ? this.ctx : null;
  }

  /**
   * Build the palette chain for one sound (lowpass -> tremolo, plus a shared
   * vibrato LFO), alive from `start` until `end`. Per sound, never per frame.
   * Any failure returns `null`: the sound then plays unshaped, never breaks.
   */
  private createFxChain(
    ctx: AudioContext,
    fx: VoiceFx,
    start: number,
    end: number,
  ): FxChain | null {
    const created: AudioNode[] = [];
    const lfos: OscillatorNode[] = [];
    const lfo = (rateHz: number, depth: number): GainNode => {
      const osc = ctx.createOscillator();
      created.push(osc);
      osc.type = "sine";
      osc.frequency.value = rateHz;
      const amount = ctx.createGain();
      created.push(amount);
      amount.gain.value = depth;
      osc.connect(amount);
      lfos.push(osc);
      return amount;
    };
    try {
      let filter: BiquadFilterNode | null = null;
      if (fx.lowpassHz !== null && typeof ctx.createBiquadFilter === "function") {
        filter = ctx.createBiquadFilter();
        created.push(filter);
        filter.type = "lowpass";
        filter.frequency.value = fx.lowpassHz;
        filter.Q.value = LOWPASS_Q;
      }
      let tremolo: GainNode | null = null;
      if (fx.tremolo) {
        // Gain swings within [1 - depth, 1]: the tremolo only ever dips, so it
        // cannot push a strike past its unshaped peak.
        tremolo = ctx.createGain();
        created.push(tremolo);
        tremolo.gain.value = 1 - fx.tremolo.depth / 2;
        lfo(fx.tremolo.rateHz, fx.tremolo.depth / 2).connect(tremolo.gain);
      }
      if (filter && tremolo) filter.connect(tremolo);
      const vibrato = fx.vibrato ? lfo(fx.vibrato.rateHz, fx.vibrato.depth) : null;
      for (const osc of lfos) {
        osc.start(start);
        osc.stop(end + 0.02);
      }
      return { input: filter ?? tremolo, output: tremolo ?? filter, vibrato };
    } catch (error) {
      console.warn("Sound palette unavailable, playing unshaped", error);
      safeDisconnect(created);
      return null;
    }
  }

  private play(
    sfx: SfxId,
    voices: Voice[],
    reverbBoostDb = 0,
    fx: VoiceFx | null = null,
  ): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.wake(ctx);
    const now = ctx.currentTime;
    const trim = dbToGain(SFX_TRIM_DB[sfx]);
    const reverbSend =
      this.reverb?.send(SFX_REVERB_SEND_DB[sfx] + reverbBoostDb) ?? null;
    const master = this.masterGain!;
    const lastEnd = voices.reduce(
      (latest, voice) => Math.max(latest, (voice.delay ?? 0) + voice.duration),
      0,
    );
    const chain = fx ? this.createFxChain(ctx, fx, now, now + lastEnd) : null;
    // Voices feed the palette chain when there is one, else the buses directly.
    const sink = chain?.input ?? null;
    if (chain?.output) {
      chain.output.connect(master);
      if (reverbSend) chain.output.connect(reverbSend);
    }

    for (const voice of voices) {
      const start = now + (voice.delay ?? 0);
      const end = start + voice.duration;
      const attack = voice.attack ?? DEFAULT_ATTACK_SECONDS;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = voice.type ?? "sine";
      osc.frequency.setValueAtTime(voice.freq, start);
      if (voice.glideTo) {
        osc.frequency.exponentialRampToValueAtTime(voice.glideTo, end);
      }
      if (voice.detune && osc.detune) {
        osc.detune.setValueAtTime(voice.detune, start);
      }

      gain.gain.setValueAtTime(SILENCE, start);
      gain.gain.linearRampToValueAtTime(voice.peak * trim, start + attack);
      gain.gain.exponentialRampToValueAtTime(SILENCE, end);

      osc.connect(gain);
      if (chain?.vibrato && osc.detune) chain.vibrato.connect(osc.detune);
      if (sink) {
        gain.connect(sink);
      } else {
        gain.connect(master);
        if (reverbSend) gain.connect(reverbSend);
      }
      osc.start(start);
      osc.stop(end + 0.02);
    }
    this.noteAudible(now + lastEnd + 0.02);
  }

  playStack(quality: StackQuality, streak: number, world: number): void {
    const palette = getWorldPalette(world);
    const base = getStackNoteHz(world, streak);
    const voices: Voice[] = [
      { freq: base, type: "triangle", duration: 0.32, peak: 0.42, role: "lead" },
      // Soft sub-octave body so notes feel "placed", not just beeped.
      { freq: base / 2, type: "sine", duration: 0.22, peak: 0.18, role: "body" },
    ];
    // A mirrored world inverts the intervals (fifths become fourths).
    paletteHarmony(QUALITY_HARMONY[quality], palette).forEach((interval, i) => {
      voices.push({
        freq: base * semitonesToRatio(interval),
        type: "sine",
        delay: 0.03 * (i + 1),
        duration: 0.45 + 0.1 * i,
        // Kept low: each extra interval adds loudness, and the quality
        // hierarchy should read as richer, not as much louder.
        peak: 0.07,
      });
    });
    if (quality === "PERFECT") {
      // Bell sparkle: detuned high partial.
      voices.push({
        freq: base * 4,
        type: "sine",
        delay: 0.06,
        duration: 0.6,
        peak: 0.045,
        detune: 7,
      });
    }
    this.play(
      "stack",
      shapeVoices(voices, palette),
      STACK_REVERB_BOOST_DB[quality],
      paletteFx(palette),
    );
  }

  playLevelUp(world: number): void {
    const palette = getWorldPalette(world);
    const root = getWorldRoot(world) * 2;
    const voices = LEVEL_UP_ARPEGGIO.map(
      (interval, i): Voice => ({
        freq: root * semitonesToRatio(interval),
        type: "triangle",
        // A mirrored world runs the arpeggio downward.
        delay: paletteOrder(i, LEVEL_UP_ARPEGGIO.length, palette) * 0.07,
        duration: 0.35,
        peak: 0.24,
        role: "lead",
      }),
    );
    this.play("levelUp", shapeVoices(voices, palette), 0, paletteFx(palette));
  }

  playWorldUp(world: number): void {
    const palette = getWorldPalette(world);
    const root = getWorldRoot(world);
    // The pad keeps its own saw + sines; the palette shapes envelope and space.
    const voices = WORLD_UP_CHORD.map(
      (interval, i): Voice => ({
        freq: root * semitonesToRatio(interval),
        type: i === 0 ? "sawtooth" : "sine",
        delay: paletteOrder(i, WORLD_UP_CHORD.length, palette) * 0.05,
        attack: 0.08,
        duration: 1.4,
        peak: i === 0 ? 0.08 : 0.16,
      }),
    );
    this.play("worldUp", shapeVoices(voices, palette), 0, paletteFx(palette));
  }

  playStackSound(score: number): void {
    const freq = 220 * semitonesToRatio(score % 12);
    this.play("ui", [
      { freq, type: "sine", duration: 0.3, peak: 0.4, glideTo: freq * 1.5 },
    ]);
  }

  playFailSound(): void {
    this.play("fail", [
      { freq: 180, type: "sawtooth", duration: 0.6, peak: 0.28, glideTo: 45 },
      { freq: 90, type: "square", duration: 0.5, peak: 0.12, glideTo: 30 },
    ]);
  }

  playMissSound(): void {
    this.play("miss", [
      { freq: 330, type: "triangle", duration: 0.28, peak: 0.25, glideTo: 196 },
    ]);
  }

  playEarlyClickSound(): void {
    this.play("early", [
      { freq: 400, type: "triangle", duration: 0.15, peak: 0.25, glideTo: 300 },
    ]);
  }

  playTick(urgent: boolean, soft = false): void {
    // Wood-block style: a sine body plus a short click partial. Square waves
    // at this level were harsh, and at the old level inaudible.
    const freq = urgent ? 1320 : 880;
    // Soft (resume countdown): the same voice a few dB down.
    const gain = soft ? dbToGain(SOFT_TICK_DB) : 1;
    this.play("tick", [
      { freq, type: "sine", duration: 0.12, peak: (urgent ? 1 : 0.55) * gain, attack: 0.002 },
      { freq: freq * 2.5, type: "triangle", duration: 0.03, peak: 0.12 * gain, attack: 0.001 },
    ]);
  }

  playComboMilestone(tier: number, world: number): void {
    // A quick rising pentatonic run, one octave above the world root, longer
    // for higher tiers, closing on a held top note.
    const root = getWorldRoot(world) * 2;
    const notes = Math.min(3 + Math.max(1, Math.floor(tier)), 8);
    const voices: Voice[] = [];
    for (let i = 0; i < notes; i += 1) {
      const last = i === notes - 1;
      voices.push({
        freq: root * semitonesToRatio(pentatonicSemitones(i * 2)),
        type: "triangle",
        delay: i * 0.055,
        duration: last ? 0.5 : 0.16,
        peak: last ? 0.3 : 0.22,
      });
    }
    this.play("combo", voices);
  }

  playUi(kind: UiSoundKind): void {
    // Quiet, short and in the A-major pentatonic family used by the game.
    const voices: Voice[] =
      kind === "confirm"
        ? [
            { freq: 659.25, type: "triangle", duration: 0.09, peak: 0.22, attack: 0.003 },
            { freq: 987.77, type: "triangle", delay: 0.06, duration: 0.14, peak: 0.22, attack: 0.003 },
          ]
        : kind === "back"
          ? [
              { freq: 659.25, type: "triangle", duration: 0.08, peak: 0.18, attack: 0.003 },
              { freq: 493.88, type: "triangle", delay: 0.05, duration: 0.12, peak: 0.18, attack: 0.003 },
            ]
          : [
              { freq: 880, type: "triangle", duration: 0.14, peak: 0.85, attack: 0.002 },
              { freq: 1760, type: "sine", duration: 0.05, peak: 0.12, attack: 0.001 },
            ];
    this.play("menu", voices);
  }

  playChime(): void {
    // Glockenspiel-like cascade up the A-major pentatonic (the menu family):
    // each strike is a sine plus a faint inharmonic partial (x2.76, the
    // "bar" overtone) that dies fast, so it reads as a bell, not a beep.
    const notes = [880, 1108.73, 1318.51, 1760, 2217.46];
    const voices: Voice[] = [];
    notes.forEach((freq, i) => {
      const last = i === notes.length - 1;
      const delay = i * 0.07;
      voices.push(
        { freq, type: "sine", delay, duration: last ? 0.9 : 0.42, peak: last ? 0.2 : 0.16, attack: 0.002 },
        { freq: freq * 2.76, type: "sine", delay, duration: 0.12, peak: 0.035, attack: 0.001 },
      );
    });
    this.play("chime", voices);
  }

  playRecord(world: number): void {
    // "Ta-da": a short pickup on the fifth, then a held major chord an octave
    // up with a bell partial on top. In the world's key but unshaped by the
    // palette (like the combo fanfare), so it reads the same in every world.
    const root = getWorldRoot(world) * 2;
    const at = (semitones: number) => root * semitonesToRatio(semitones);
    const chord = RECORD_DELAY + 0.12;
    this.play("record", [
      { freq: at(7), type: "triangle", delay: RECORD_DELAY, duration: 0.1, peak: 0.2, attack: 0.004 },
      { freq: at(12), type: "triangle", delay: chord, duration: 0.75, peak: 0.26 },
      { freq: at(16), type: "sine", delay: chord + 0.015, duration: 0.7, peak: 0.11 },
      { freq: at(19), type: "sine", delay: chord + 0.03, duration: 0.65, peak: 0.09 },
      { freq: at(24), type: "sine", delay: chord + 0.04, duration: 0.5, peak: 0.04, detune: 6 },
      { freq: at(24) * 2.76, type: "sine", delay: chord, duration: 0.1, peak: 0.025, attack: 0.001 },
    ]);
  }

  playAchievement(world: number): void {
    // Unlock "ding-ding": two bell strikes rising a fourth, then a soft
    // shimmer. Its own voice (it used to borrow the level up arpeggio, so an
    // unlock on a level up just sounded like one level up). In the world's
    // key, unshaped by the palette like the other rewards, an octave above
    // the record so the two never read as the same moment.
    const root = getWorldRoot(world) * 4;
    const at = (semitones: number) => root * semitonesToRatio(semitones);
    const voices: Voice[] = [];
    [
      { semitones: 7, delay: ACHIEVEMENT_DELAY, duration: 0.4, peak: 0.2 },
      { semitones: 12, delay: ACHIEVEMENT_DELAY + 0.11, duration: 0.85, peak: 0.24 },
    ].forEach(({ semitones, delay, duration, peak }) => {
      const freq = at(semitones);
      voices.push(
        { freq, type: "sine", delay, duration, peak, attack: 0.002 },
        // Bar overtone: rings like a bell, not a beep; dies fast.
        { freq: freq * 2.76, type: "sine", delay, duration: 0.12, peak: peak * 0.18, attack: 0.001 },
        // Body an octave down for small phone speakers.
        { freq: freq / 2, type: "triangle", delay, duration: duration * 0.6, peak: peak * 0.35 },
      );
    });
    voices.push({
      freq: at(16),
      type: "sine",
      delay: ACHIEVEMENT_DELAY + 0.2,
      duration: 0.6,
      peak: 0.05,
      detune: 7,
    });
    this.play("achievement", voices);
  }

  playTimeUp(world: number, medal: Medal | null): void {
    // In the world's key but unshaped by the palette (like the record and
    // combo fanfares): the result must read the same in every world, and a
    // mirrored world would invert the medal's major third, a swelling one
    // blur the strike. `tests/audio-levels.spec.ts` keeps every world's key
    // within ±2 dB of world 1 instead.
    const root = getWorldRoot(world) * 2;
    const at = (semitones: number) => root * semitonesToRatio(semitones);
    const bell = at(24);
    const cadence = getTimeUpCadence(medal);
    const voices: Voice[] = [
      // "TIME!": a struck bell two octaves over the chord root. The bar's
      // inharmonic partials (x2.76, x5.4) die fast so it rings, not beeps;
      // a soft hum under the chord gives it body on small speakers.
      { freq: bell, type: "sine", duration: 1.1, peak: 0.22, attack: 0.002 },
      { freq: bell * 2.76, type: "sine", duration: 0.2, peak: 0.06, attack: 0.001 },
      { freq: bell * 5.4, type: "sine", duration: 0.07, peak: 0.025, attack: 0.001 },
      { freq: at(-12), type: "sine", duration: 0.8, peak: 0.1, attack: 0.004 },
    ];
    // Every result lands its chord at the same moment (a longer run starts
    // earlier), so tiers differ by the chord, not by where it falls.
    const pickups = cadence.pickup.length;
    cadence.pickup.forEach((semitones, i) => {
      voices.push({
        freq: at(semitones),
        type: "triangle",
        delay: TIME_UP_CHORD_AT - (pickups - i) * TIME_UP_PICKUP_STEP,
        duration: TIME_UP_PICKUP_STEP + 0.03,
        peak: 0.18,
        attack: 0.004,
      });
    });
    const chordAt = TIME_UP_CHORD_AT;
    cadence.chord.forEach((semitones, i) => {
      voices.push({
        freq: at(semitones),
        // The root leads (triangle); the upper notes are soft sines, so a
        // richer chord reads fuller, not much louder.
        type: i === 0 ? "triangle" : "sine",
        delay: chordAt + i * 0.012,
        duration: cadence.hold - i * 0.02,
        peak: i === 0 ? 0.24 : 0.08,
      });
    });
    if (cadence.sparkle) {
      voices.push(
        { freq: at(24) * 2.76, type: "sine", delay: chordAt, duration: 0.12, peak: 0.025, attack: 0.001 },
        { freq: at(28), type: "sine", delay: chordAt + 0.05, duration: 0.6, peak: 0.03, detune: 6 },
      );
    }
    this.play("timeUp", voices);
  }

  playHeartbeat(): void {
    // Low "lub" with a falling pitch plus a soft click for definition on
    // small phone speakers that cannot reproduce the sub frequency.
    this.play("heartbeat", [
      { freq: 110, type: "sine", duration: 0.18, peak: 0.55, attack: 0.004, glideTo: 55 },
      { freq: 900, type: "triangle", duration: 0.025, peak: 0.06, attack: 0.001 },
    ]);
  }

  playCue(step: number, inWindow: boolean): void {
    const freq = getCueNoteHz(step, inWindow);
    // Approach: a short, soft sine "tock" with a faint click partial so it
    // stays defined on phone speakers. PERFECT: a brighter, slightly longer
    // triangle with a fifth on top, an audible "now" rather than a louder tick.
    this.play(
      "cue",
      inWindow
        ? [
            { freq, type: "triangle", duration: 0.14, peak: 0.6, attack: 0.002 },
            { freq: freq * 1.5, type: "sine", delay: 0.012, duration: 0.1, peak: 0.14, attack: 0.002 },
          ]
        : [
            { freq, type: "sine", duration: 0.08, peak: 0.7, attack: 0.002 },
            { freq: freq * 3, type: "sine", duration: 0.015, peak: 0.06, attack: 0.001 },
          ],
    );
  }

  playTimeBonus(): void {
    this.play("timeBonus", [
      { freq: 784, type: "sine", duration: 0.18, peak: 0.2 },
      { freq: 1175, type: "sine", delay: 0.08, duration: 0.3, peak: 0.2 },
    ]);
  }
}

export const createAudioManager = (options?: AudioManagerOptions): IAudioService =>
  new AudioManager(options);

export const audioManager: IAudioService = createAudioManager();
