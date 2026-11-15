import { getWorldConfig, getWorldCount } from "./selectors";

/**
 * World atlas: what each world changes, in plain words, and which worlds a
 * player may see. Pure data + rules; `WorldAtlas.tsx` only renders them.
 *
 * Each line describes the actual mechanic in `config.ts` (and `fracture.ts`,
 * `reverse.ts`, `heartbeat.ts`), so keep them in sync when a world changes.
 * One sentence each: the card is read on a phone between runs.
 */
export const WORLD_HOW_TO: Readonly<Record<number, string>> = Object.freeze({
  1: "Your shape grows inside the last one: tap just before it touches the edge, and the closer the fit, the more it scores.",
  2: "Stacked shapes gently swell and shrink, but only on screen, so time your tap against their resting size.",
  3: "Shapes grow faster through each level, and outside Zen two red sectors sweep the rim: tapping while a corner sits in one is a miss.",
  4: "The stack sways side to side while your shape stays centred; the sway is only visual, so keep your eyes on the size.",
  5: "Stacked shapes keep cycling through colours, which changes nothing else, so read the outline, not the colour.",
  6: "The stack fades almost to black and only the last shape's pulsing outline shows where to stop.",
  7: "Your shape sinks while it grows, so it reaches the bottom of the last one sooner: tap a little earlier.",
  8: "The stack's spin flips direction every other level and on boss shapes, so corners line up at new moments.",
  9: "Shapes now grow outward: tap once yours fully wraps the last one, before it touches the ring around the arena.",
  10: "Growth surges on every beat (90 BPM) and slows in between, so aim your tap for the calm before the next beat.",
});

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
export const buildAtlasEntries = (bestWorld: number): AtlasEntry[] => {
  const revealed = countRevealedWorlds(bestWorld);
  return Array.from({ length: ATLAS_WORLD_COUNT }, (_, index): AtlasEntry => {
    const world = index + 1;
    if (world > revealed) return { kind: "locked", world };
    const config = getWorldConfig(world);
    return {
      kind: "revealed",
      world,
      name: config.name ?? `World ${world}`,
      tagline: config.tagline ?? "",
      howTo: WORLD_HOW_TO[world] ?? "",
      canPractice: world >= MIN_PRACTICE_WORLD,
    };
  });
};
