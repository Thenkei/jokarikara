/**
 * Zen lives come back: every ZEN_LIFE_REGEN_STACKS stacks in a row without a
 * miss earn one life back, up to the mode's maximum. Zen is the relaxed
 * mode: a long session used to end on its tenth miss, however well the
 * player recovered. Pure; GameState keeps the progress (`zenRegenProgress`).
 *
 * - A miss resets the progress (the run has to be clean again).
 * - At full lives nothing is banked: the progress stays at 0.
 * - UNDO steps the progress back by one; a life already regained is kept
 *   (undoing then re-stacking is just playing the same stacks again).
 */

/** Clean stacks in a row that earn one life back. */
export const ZEN_LIFE_REGEN_STACKS = 10;

export interface ZenRegenStep {
  lives: number;
  progress: number;
  /** This stack earned a life back. */
  regained: boolean;
}

/** One clean stack. */
export const advanceZenRegen = (
  lives: number,
  progress: number,
  maxLives: number,
): ZenRegenStep => {
  if (lives >= maxLives) return { lives, progress: 0, regained: false };
  const next = Math.max(0, progress) + 1;
  if (next < ZEN_LIFE_REGEN_STACKS) return { lives, progress: next, regained: false };
  return { lives: Math.min(maxLives, lives + 1), progress: 0, regained: true };
};

/** UNDO of the last stack. */
export const rewindZenRegen = (progress: number): number => Math.max(0, progress - 1);
