import type { Translator } from "../i18n";
import { getWorldCount } from "./selectors";
import { getWorldHowTo, getWorldName, getWorldTagline } from "./worldText";

/**
 * World atlas: what each world changes, in plain words, and which worlds a
 * player may see. Pure rules; the words come from the catalog (`world.<n>.*`,
 * see worldText.ts) and `WorldAtlas.tsx` only renders them.
 */

/** Number of worlds the atlas lists (every configured world). */
export const ATLAS_WORLD_COUNT = getWorldCount();

/** Practice (a Zen run from a later world) starts at world 2. */
export const MIN_PRACTICE_WORLD = 2;

export type AtlasEntry =
  | {
      kind: "revealed";
      world: number;
      name: string;
      tagline: string;
      howTo: string;
      /** A Zen practice run may start here (reached, and not world 1). */
      canPractice: boolean;
    }
  | {
      /** Not reached yet: only the number is known (no spoilers). */
      kind: "locked";
      world: number;
    };

/**
 * Worlds revealed for a lifetime best world. `bestWorld` keeps counting past
 * the last configured world (the game loops on its rules), so it is capped.
 */
export const countRevealedWorlds = (bestWorld: number): number =>
  Math.min(ATLAS_WORLD_COUNT, Math.max(1, Math.floor(bestWorld) || 1));

/** One entry per world, 1..ATLAS_WORLD_COUNT, locked above `bestWorld`. */
export const buildAtlasEntries = (i18n: Translator, bestWorld: number): AtlasEntry[] => {
  const revealed = countRevealedWorlds(bestWorld);
  return Array.from({ length: ATLAS_WORLD_COUNT }, (_, index): AtlasEntry => {
    const world = index + 1;
    if (world > revealed) return { kind: "locked", world };
    return {
      kind: "revealed",
      world,
      name: getWorldName(i18n, world),
      tagline: getWorldTagline(i18n, world),
      howTo: getWorldHowTo(i18n, world),
      canPractice: world >= MIN_PRACTICE_WORLD,
    };
  });
};
