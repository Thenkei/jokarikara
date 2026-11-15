import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  ATLAS_WORLD_COUNT,
  buildAtlasEntries,
  countRevealedWorlds,
} from "../gameplay/atlas";
import { getWorldTheme } from "../visual/theme";

interface WorldAtlasProps {
  /** Lifetime best world (`lifetime.bestWorld`): worlds above it stay locked. */
  bestWorld: number;
  /** Matches the game's look (reduced effects soften the palette). */
  reducedFx: boolean;
  /** Starts a Zen practice run from that world (the start screen's path). */
  onPractice: (world: number) => void;
  onClose: () => void;
}

/** Fixed seed, like the start backdrop: a world's accent never changes. */
const ATLAS_THEME_SEED = 0;

/**
 * Menu sub-screen listing the worlds: number, name, rule and how to play it,
 * with a PRACTICE shortcut for reached worlds. Worlds not reached yet only
 * show their number (no spoilers).
 */
export function WorldAtlas({ bestWorld, reducedFx, onPractice, onClose }: WorldAtlasProps) {
  const entries = useMemo(() => buildAtlasEntries(bestWorld), [bestWorld]);
  const revealedCount = countRevealedWorlds(bestWorld);
  const accents = useMemo(
    () =>
      entries.map(({ world }) => {
        const { hud } = getWorldTheme(world, ATLAS_THEME_SEED, reducedFx);
        return {
          "--world-a": hud.primary,
          "--world-b": hud.accent,
        } as CSSProperties;
      }),
    [entries, reducedFx],
  );
  // Same as the achievements panel: keyboard focus starts on BACK without
  // scrolling to it, so a phone opens the panel at the heading.
  const backButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="screen world-atlas-screen" aria-labelledby="world-atlas-heading">
      <h2 id="world-atlas-heading" className="achievements-heading">
        WORLDS
      </h2>
      <p className="achievements-count world-atlas-count">
        {revealedCount} / {ATLAS_WORLD_COUNT} DISCOVERED
      </p>
      <p className="world-atlas-intro">Each world adds a new twist to the ones before.</p>
      <ul className="world-atlas-list">
        {entries.map((entry, index) => {
          const { world } = entry;
          if (entry.kind === "locked") {
            return (
              <li
                key={world}
                className="world-card locked"
                data-world={world}
              >
                <span className="world-card-badge" aria-hidden="true">
                  {world}
                </span>
                <div className="world-card-body">
                  <h3 className="world-card-title">
                    <span className="world-card-number">WORLD {world}</span>
                    <span className="world-card-name" aria-hidden="true">
                      ???
                    </span>
                    <span className="visually-hidden">, locked</span>
                  </h3>
                  <p className="world-card-hint">Reach world {world} to reveal</p>
                </div>
              </li>
            );
          }
          return (
            <li
              key={world}
              className="world-card revealed"
              data-world={world}
              style={accents[index]}
            >
              <span className="world-card-badge" aria-hidden="true">
                {world}
              </span>
              <div className="world-card-body">
                <h3 className="world-card-title">
                  <span className="world-card-number">WORLD {world}</span>{" "}
                  <span className="world-card-name">{entry.name}</span>
                </h3>
                <p className="world-card-tagline">{entry.tagline}</p>
                <p className="world-card-howto">{entry.howTo}</p>
                {entry.canPractice && (
                  <button
                    type="button"
                    className="world-card-practice"
                    data-ui-sound="confirm"
                    onClick={() => onPractice(world)}
                    aria-label={`Practice world ${world}, ${entry.name}`}
                  >
                    PRACTICE
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        ref={backButtonRef}
        type="button"
        className="achievements-back-btn world-atlas-back-btn"
        data-ui-sound="back"
        onClick={onClose}
      >
        BACK
      </button>
    </section>
  );
}
