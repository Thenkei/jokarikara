import type { IAudioService, MusicIntensity, MusicState } from "../audio/types";
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
  getWorldRoot,
  LEVEL_UP_ARPEGGIO,
  QUALITY_HARMONY,
  semitonesToRatio,
  WORLD_UP_CHORD,
} from "../audio/music";

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const MASTER_VOLUME = 0.32;
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

    const compressor =
      typeof this.ctx.createDynamicsCompressor === "function"
        ? this.ctx.createDynamicsCompressor()
        : null;
    if (compressor) {
      compressor.threshold.value = -18;
      compressor.ratio.value = 4;
      this.masterGain.connect(compressor);
      compressor.connect(this.ctx.destination);
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

  private play(voices: Voice[]): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

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
      gain.gain.linearRampToValueAtTime(voice.peak, start + attack);
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
        peak: 0.16,
      });
    });
    if (quality === "PERFECT") {
      // Bell sparkle: detuned high partial.
      voices.push({
        freq: base * 4,
        type: "sine",
        delay: 0.06,
        duration: 0.6,
        peak: 0.07,
        detune: 7,
      });
    }
    this.play(voices);
  }

  playLevelUp(world: number): void {
    const root = getWorldRoot(world) * 2;
    this.play(
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
    this.play([
      { freq, type: "sine", duration: 0.3, peak: 0.4, glideTo: freq * 1.5 },
    ]);
  }

  playFailSound(): void {
    this.play([
      { freq: 180, type: "sawtooth", duration: 0.6, peak: 0.28, glideTo: 45 },
      { freq: 90, type: "square", duration: 0.5, peak: 0.12, glideTo: 30 },
    ]);
  }

  playMissSound(): void {
    this.play([
      { freq: 330, type: "triangle", duration: 0.28, peak: 0.25, glideTo: 196 },
    ]);
  }

  playEarlyClickSound(): void {
    this.play([
      { freq: 400, type: "triangle", duration: 0.15, peak: 0.25, glideTo: 300 },
    ]);
  }

  playTick(urgent: boolean): void {
    this.play([
      {
        freq: urgent ? 1320 : 880,
        type: "square",
        duration: 0.05,
        peak: urgent ? 0.12 : 0.07,
        attack: 0.002,
      },
    ]);
  }

  playTimeBonus(): void {
    this.play([
      { freq: 784, type: "sine", duration: 0.18, peak: 0.2 },
      { freq: 1175, type: "sine", delay: 0.08, duration: 0.3, peak: 0.2 },
    ]);
  }
}

export const createAudioManager = (): IAudioService => new AudioManager();

export const audioManager: IAudioService = createAudioManager();
