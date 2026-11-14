import type { IAudioService, UiSoundKind, MusicIntensity, MusicState } from "../audio/types";
import { MusicEngine } from "../audio/musicEngine";
import {
  MUSIC_VOLUME,
  MUTE_FADE_SECONDS,
  PAUSE_FADE_SECONDS,
  STOP_FADE_SECONDS,
} from "../audio/soundtrack";
import type { StackQuality } from "../types";
import {
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
  SFX_TRIM_DB,
  type SfxId,
} from "../audio/mix";
/** Exponential ramps cannot target 0; this is effectively silence. */
const SILENCE = 0.0001;

type Voice = {
  freq: number;
  type?: OscillatorType;
  /** Seconds from now. */
  delay?: number;
  duration: number;
  peak: number;
  attack?: number;
  /** Target frequency at the end of the note (glide). */
  glideTo?: number;
  detune?: number;
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
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
    }
    this.reconcileMusic(MUTE_FADE_SECONDS);
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

  private play(sfx: SfxId, voices: Voice[]): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const trim = dbToGain(SFX_TRIM_DB[sfx]);

    for (const voice of voices) {
      const start = now + (voice.delay ?? 0);
      const end = start + voice.duration;
      const attack = voice.attack ?? 0.008;

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
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }

  playStack(quality: StackQuality, streak: number, world: number): void {
    const base = getStackNoteHz(world, streak);
    const voices: Voice[] = [
      { freq: base, type: "triangle", duration: 0.32, peak: 0.42 },
      // Soft sub-octave body so notes feel "placed", not just beeped.
      { freq: base / 2, type: "sine", duration: 0.22, peak: 0.18 },
    ];
    QUALITY_HARMONY[quality].forEach((interval, i) => {
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
    this.play("stack", voices);
  }

  playLevelUp(world: number): void {
    const root = getWorldRoot(world) * 2;
    this.play(
      "levelUp",
      LEVEL_UP_ARPEGGIO.map((interval, i) => ({
        freq: root * semitonesToRatio(interval),
        type: "triangle" as OscillatorType,
        delay: i * 0.07,
        duration: 0.35,
        peak: 0.24,
      })),
    );
  }

  playWorldUp(world: number): void {
    const root = getWorldRoot(world);
    this.play(
      "worldUp",
      WORLD_UP_CHORD.map((interval, i) => ({
        freq: root * semitonesToRatio(interval),
        type: (i === 0 ? "sawtooth" : "sine") as OscillatorType,
        delay: i * 0.05,
        attack: 0.08,
        duration: 1.4,
        peak: i === 0 ? 0.08 : 0.16,
      })),
    );
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

  playTimeBonus(): void {
    this.play("timeBonus", [
      { freq: 784, type: "sine", duration: 0.18, peak: 0.2 },
      { freq: 1175, type: "sine", delay: 0.08, duration: 0.3, peak: 0.2 },
    ]);
  }
}

export const createAudioManager = (): IAudioService => new AudioManager();

export const audioManager: IAudioService = createAudioManager();
