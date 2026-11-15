import type { Translator } from "../i18n";
import { getWorldCount } from "./selectors";

/**
 * Player-facing text of a world (name, tagline, how-to line), read from the
 * catalog (`world.<n>.*`). Worlds past the last configured one reuse its
 * rules (see `getWorldConfig`), so they reuse its text too.
 */

/** Worlds with their own catalog entries (tested against the config). */
export const WORLD_TEXT_COUNT = 10;

type WorldTextNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const toTextWorld = (world: number): WorldTextNumber => {
  const last = Math.min(WORLD_TEXT_COUNT, getWorldCount());
  const whole = Number.isFinite(world) ? Math.floor(world) : 1;
  return Math.min(last, Math.max(1, whole)) as WorldTextNumber;
};

/** "Breathing" / "Respiration". */
export const getWorldName = ({ t }: Translator, world: number): string =>
  t(`world.${toTextWorld(world)}.name`);

/** One-line rule reminder shown when the world starts. */
export const getWorldTagline = ({ t }: Translator, world: number): string =>
  t(`world.${toTextWorld(world)}.tagline`);

/** One sentence of how-to (atlas card, first-visit intro). */
export const getWorldHowTo = ({ t }: Translator, world: number): string =>
  t(`world.${toTextWorld(world)}.howTo`);
