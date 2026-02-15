/**
 * Seeded deterministic PRNG utilities for gameplay state.
 * Uses xorshift32 for speed and reproducibility.
 */

const DEFAULT_NON_ZERO_SEED = 0x6d2b79f5;

/**
 * Normalize an arbitrary seed into a valid non-zero xorshift32 state.
 */
export const seedRng = (seed: number): number => {
  const normalized = (seed ^ 0x9e3779b9) >>> 0;
  return normalized === 0 ? DEFAULT_NON_ZERO_SEED : normalized;
};

/**
 * Compute the next xorshift32 state.
 */
export const nextRngState = (state: number): number => {
  let x = state >>> 0;
  if (x === 0) {
    x = DEFAULT_NON_ZERO_SEED;
  }
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
};

/**
 * Consume one random value in [0, 1).
 */
export const nextRandomUnit = (
  state: number,
): { nextState: number; value: number } => {
  const nextState = nextRngState(state);
  return {
    nextState,
    value: nextState / 4294967296,
  };
};
