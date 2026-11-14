import type { StackQuality } from "../types";

/**
 * Soundtrack layers: 0 = drone only, 1 = + bass pulse, 2 = + arpeggio.
 */
export type MusicIntensity = 0 | 1 | 2;

/** Snapshot of the soundtrack, for UI, diagnostics and tests. */
export interface MusicState {
  /** A run requested music (between startMusic and stopMusic). */
  active: boolean;
  /** Paused with the game (overlay / auto-pause). */
  paused: boolean;
  /** Player preference (independent from the global mute). */
  enabled: boolean;
  /** Audio nodes and scheduler are live right now. */
  playing: boolean;
  intensity: MusicIntensity;
  world: number;
}

/**
 * Audio service interface for Dependency Inversion Principle.
 * Allows mocking in tests and swapping implementations.
 */
export interface IAudioService {
  /** Initialize the audio context (must follow a user gesture). */
  init(): void;

  /**
   * Legacy pitched blip; kept for UI feedback (restart/undo in Zen).
   * @param score - Value used to vary the pitch.
   */
  playStackSound(score: number): void;

  /**
   * Musical note for a successful stack: pitch follows the combo streak in
   * the current world's key, harmony richness follows the stack quality.
   */
  playStack(quality: StackQuality, streak: number, world: number): void;

  /** Ascending arpeggio on level up. */
  playLevelUp(world: number): void;

  /** Sustained chord on entering a new world. */
  playWorldUp(world: number): void;

  /** Run-ending failure sound. */
  playFailSound(): void;

  /** Softer, non-terminal miss (Zen life lost). */
  playMissSound(): void;

  /** Too-early tap feedback in Zen mode. */
  playEarlyClickSound(): void;

  /** Countdown tick for the final seconds of Time Attack. */
  playTick(urgent: boolean): void;

  /** Bonus time gained in Time Attack. */
  playTimeBonus(): void;

  /** Heartbeat worlds: a soft thump on each beat of the growth pulse. */
  playHeartbeat(): void;

  /** Combo milestone fanfare; `tier` 1..5 lengthens the run of notes. */
  playComboMilestone(tier: number, world: number): void;

  setMuted(muted: boolean): void;
  isMuted(): boolean;

  /** Resume the audio context if suspended (required by browsers). */
  resume(): void;

  /**
   * Start the ambient soundtrack for a new run (drone only, in the world's
   * key). Idempotent: an already playing bed is re-targeted, not restarted.
   */
  startMusic(world: number): void;

  /** Fade rhythmic layers in/out to match the player's momentum. */
  setMusicIntensity(level: MusicIntensity): void;

  /** Crossfade the drone (and layer notes) to the new world's key. */
  setMusicWorld(world: number): void;

  /** Fade out and release all music nodes/timers; resumeMusic rebuilds. */
  pauseMusic(): void;
  resumeMusic(): void;

  /** End of run: fade out and release every music node and timer. */
  stopMusic(): void;

  /** Player preference for background music (SFX unaffected). */
  setMusicEnabled(enabled: boolean): void;
  isMusicEnabled(): boolean;

  getMusicState(): MusicState;
}
