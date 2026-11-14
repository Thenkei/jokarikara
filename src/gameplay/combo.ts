/**
 * Combo milestones: streak values that get a dedicated celebration (sound,
 * banner, haptic). Zen has no combo, so it never reaches one.
 */
export const COMBO_MILESTONES = [5, 10, 20, 30, 50] as const;

/** Beyond the last listed milestone, celebrate every this many stacks. */
export const COMBO_MILESTONE_EVERY = 25;

export const isComboMilestone = (streak: number): boolean => {
  if (!Number.isInteger(streak) || streak <= 0) return false;
  const last = COMBO_MILESTONES[COMBO_MILESTONES.length - 1];
  if (streak > last) return (streak - last) % COMBO_MILESTONE_EVERY === 0;
  return (COMBO_MILESTONES as readonly number[]).includes(streak);
};

/** 1-based tier of a milestone (drives how big the celebration is). */
export const getComboTier = (streak: number): number => {
  const index = (COMBO_MILESTONES as readonly number[]).indexOf(streak);
  return index >= 0 ? index + 1 : COMBO_MILESTONES.length;
};
