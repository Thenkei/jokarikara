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
  STOP_FADE_SECONDS,
} from "../audio/soundtrack";
import type { StackQuality } from "../types";
import {
  getCueNoteHz,
  getStackNoteHz,
  pentatonicSemitones,
  getWorldRoot,
  LEVEL_UP_ARPEGGIO,
  QUALITY_HARMONY,
  semitonesToRatio,
  WORLD_UP_CHORD,
} from "../audio/music";

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

export interface AudioManagerOptions {
  /**
   * Schedules non-urgent setup (the reverb IR). Defaults to an idle callback;
   * offline renders and tests inject a synchronous or manual one.
   */
  defer?: DeferTask;
}
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

  constructor(options: AudioManagerOptions = {}) {
    this.defer = options.defer ?? deferToIdle;
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
  } = { active: false, paused: false, world: 1, intensity: 0 };

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
  }

  isMuted(): boolean {
    return this.muted;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  // --- Soundtrack -------------------------------------------------------

  startMusic(world: number): void {
    this.musicIntent = { active: true, paused: false, world, intensity: 0 };
    this.reconcileMusic(STOP_FADE_SECONDS);
  }

  setMusicIntensity(level: MusicIntensity): void {
    if (this.musicIntent.intensity === level) return;
    this.musicIntent.intensity = level;
    this.music?.setIntensity(level);
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
    this.musicIntent = { ...this.musicIntent, active: false, paused: false };
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
    const { active, paused, intensity, world } = this.musicIntent;
    return {
      active,
      paused,
      enabled: this.musicEnabled,
      playing: this.music?.isRunning() ?? false,
      intensity,
      world,
    };
  }

  /**
   * Converge the engine to the desired state. Anything that should be silent
   * (stopped, paused, muted, disabled) tears the graph down entirely: no
   * oscillators, no scheduler timer. Audio failures never reach gameplay.
   */
  private reconcileMusic(fadeSeconds: number): void {
    const { active, paused, world, intensity } = this.musicIntent;
    const shouldPlay = active && !paused && !this.muted && this.musicEnabled;
    try {
      if (!shouldPlay) {
        this.music?.stop(fadeSeconds);
        return;
      }
      if (!this.ctx) this.init();
      if (!this.ctx || !this.musicGain) return;
      this.music ??= new MusicEngine(this.ctx, this.musicGain);
      this.music.start(world, intensity);
    } catch (error) {
      console.warn("Music unavailable", error);
      try {
        this.music?.stop(0);
      } catch {
        // Engine is already unusable; drop it below.
      }
      this.music = null;
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

  playTick(urgent: boolean): void {
    // Wood-block style: a sine body plus a short click partial. Square waves
    // at this level were harsh, and at the old level inaudible.
    const freq = urgent ? 1320 : 880;
    this.play("tick", [
      { freq, type: "sine", duration: 0.12, peak: urgent ? 1 : 0.55, attack: 0.002 },
      { freq: freq * 2.5, type: "triangle", duration: 0.03, peak: 0.12, attack: 0.001 },
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
