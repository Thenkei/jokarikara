import { describe, expect, it } from "vitest";
import {
  ATLAS_WORLD_COUNT,
  buildAtlasEntries,
  countRevealedWorlds,
} from "./atlas";
import { getGameplayConfig } from "./selectors";
import { getWorldHowTo, getWorldName, getWorldTagline } from "./worldText";
import { getTranslator } from "../i18n";

const EN = getTranslator("en");

describe("world atlas", () => {
  it("lists every configured world", () => {
    expect(ATLAS_WORLD_COUNT).toBe(Object.keys(getGameplayConfig().worlds).length);
    expect(ATLAS_WORLD_COUNT).toBe(10);
    expect(buildAtlasEntries(EN, 1).map((entry) => entry.world)).toEqual(
      Array.from({ length: ATLAS_WORLD_COUNT }, (_, index) => index + 1),
    );
  });

  it("has a one-sentence how-to line for every world", () => {
    for (let world = 1; world <= ATLAS_WORLD_COUNT; world += 1) {
      const line = getWorldHowTo(EN, world);
      expect(line, `world ${world}`).toBeTruthy();
      expect(line.endsWith("."), `world ${world}`).toBe(true);
      // One sentence: no sentence break before the final full stop.
      expect(line.slice(0, -1), `world ${world}`).not.toMatch(/[.!?]\s/);
      expect(line.length, `world ${world}`).toBeLessThanOrEqual(140);
    }
  });

  it("reveals worlds up to the best world and locks the rest without names", () => {
    const entries = buildAtlasEntries(EN, 4);
    expect(entries.filter((entry) => entry.kind === "revealed")).toHaveLength(4);
    const fourth = entries[3];
    expect(fourth).toMatchObject({
      kind: "revealed",
      world: 4,
      name: getWorldName(EN, 4),
      tagline: getWorldTagline(EN, 4),
      howTo: getWorldHowTo(EN, 4),
      canPractice: true,
    });
    expect(entries[4]).toEqual({ kind: "locked", world: 5 });
  });

  it("offers practice from world 2 only (world 1 is the regular run)", () => {
    const practicable = buildAtlasEntries(EN, ATLAS_WORLD_COUNT).filter(
      (entry) => entry.kind === "revealed" && entry.canPractice,
    );
    expect(practicable.map((entry) => entry.world)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("caps the revealed count to the configured worlds and floors bad input", () => {
    expect(countRevealedWorlds(1)).toBe(1);
    expect(countRevealedWorlds(7)).toBe(7);
    expect(countRevealedWorlds(14)).toBe(ATLAS_WORLD_COUNT);
    expect(countRevealedWorlds(0)).toBe(1);
    expect(countRevealedWorlds(Number.NaN)).toBe(1);
    expect(buildAtlasEntries(EN, 14).every((entry) => entry.kind === "revealed")).toBe(true);
  });
});
