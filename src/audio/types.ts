import type { StackQuality } from "../types";

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

  setMuted(muted: boolean): void;
  isMuted(): boolean;

  /** Resume the audio context if suspended (required by browsers). */
  resume(): void;
}
