/**
 * Audio service interface for Dependency Inversion Principle.
 * Allows mocking in tests and swapping implementations.
 */
export interface IAudioService {
  /**
   * Initialize the audio context.
   */
  init(): void;

  /**
   * Play a sound when a shape is successfully stacked.
   * @param score - Current score, used to vary the sound pitch.
   */
  playStackSound(score: number): void;

  /**
   * Play a sound when the game ends (shape overlap).
   */
  playFailSound(): void;

  /**
   * Resume the audio context if suspended (required by browsers).
   */
  resume(): void;
}
