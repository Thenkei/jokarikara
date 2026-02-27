import { describe, it, expect } from "vitest";
import {
  getWorldMechanics,
  getZoomForLevel,
  getUnlockedShapes,
} from "./selectors";
import {
  DEFAULT_MECHANICS,
  GameplayBuilder,
  LevelBuilder,
  WorldBuilder,
} from "./builder";

// ---------------------------------------------------------------------------
// Selectors (existing tests – kept in place)
// ---------------------------------------------------------------------------

describe("gameplay config selectors", () => {
  it("preserves world mechanics progression", () => {
    expect(getWorldMechanics(1).breathingEffect).toBe(false);
    expect(getWorldMechanics(2).breathingEffect).toBe(true);
    expect(getWorldMechanics(3).growthPattern).toBe("accelerating");
    expect(getWorldMechanics(4).waveEffect).toBe(true);
    expect(getWorldMechanics(5).colorShift).toBe(true);
    expect(getWorldMechanics(6).eclipseEffect).toBe(true);
  });

  it("falls back to the highest defined world for out-of-range world numbers", () => {
    const fallback = getWorldMechanics(99);
    expect(fallback.gravityDrift).toBe(true);
    expect(fallback.rotationInvertByLevel).toBe(true);
  });

  it("exposes level zooms and shape unlocks", () => {
    expect(getZoomForLevel(1)).toBe(1.0);
    expect(getZoomForLevel(99)).toBe(12);

    expect(getUnlockedShapes(3)).toEqual([
      "circle",
      "octagon",
      "pentagon",
      "hexagon",
      "square",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helper: minimal valid GameplayBuilder config (levelsPerWorld = 1 so only
// level 1 needs to be provided, keeping the fixture concise)
// ---------------------------------------------------------------------------

const buildMinimalValid = () =>
  new GameplayBuilder()
    .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
    .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
    .scoring({
      qualityThresholds: {
        perfectMinRatio: 0.97,
        greatMinRatio: 0.92,
        goodMinRatio: 0.82,
      },
      qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
      streakBonusPerStack: 5,
    })
    .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
    .modeZen({ minClickRatio: 0.3, maxLives: 10 })
    .colors(["#ff0000"])
    .level(1, { zoom: 1.0 })
    .world(1, (w) => w.mechanics(DEFAULT_MECHANICS));

// ---------------------------------------------------------------------------
// WorldBuilder
// ---------------------------------------------------------------------------

describe("WorldBuilder", () => {
  it("applies partial mechanics overrides while keeping unset defaults", () => {
    const config = new WorldBuilder(DEFAULT_MECHANICS)
      .mechanics({ breathingEffect: true, breathingAmplitude: 0.05 })
      .build();

    expect(config.mechanics.breathingEffect).toBe(true);
    expect(config.mechanics.breathingAmplitude).toBe(0.05);
    expect(config.mechanics.waveEffect).toBe(false); // untouched default
  });

  it("sets the world name", () => {
    const config = new WorldBuilder(DEFAULT_MECHANICS).name("Cosmos").build();

    expect(config.name).toBe("Cosmos");
  });

  it("merges visual profile properties", () => {
    const config = new WorldBuilder(DEFAULT_MECHANICS)
      .visualProfile({ hueCenter: 200, neonBias: 0.5 })
      .build();

    expect(config.visualProfile?.hueCenter).toBe(200);
    expect(config.visualProfile?.neonBias).toBe(0.5);
  });

  it("build() returns a deep copy – mutating the result does not corrupt a subsequent build", () => {
    const builder = new WorldBuilder(DEFAULT_MECHANICS).mechanics({
      breathingEffect: true,
    });

    const first = builder.build();
    first.mechanics.breathingEffect = false; // mutate the returned copy

    expect(builder.build().mechanics.breathingEffect).toBe(true);
  });

  it("throws when inheritFrom is called without a world registry", () => {
    expect(() => new WorldBuilder(DEFAULT_MECHANICS).inheritFrom(1)).toThrow(
      "inheritFrom is not available without a world registry.",
    );
  });
});

// ---------------------------------------------------------------------------
// LevelBuilder
// ---------------------------------------------------------------------------

describe("LevelBuilder", () => {
  it("sets zoom and returns the builder for chaining", () => {
    const builder = new LevelBuilder();
    const returned = builder.zoom(2.5);

    expect(returned).toBe(builder);
    expect(builder.build().zoom).toBe(2.5);
  });

  it("sets unlocks and returns the builder for chaining", () => {
    const builder = new LevelBuilder().zoom(1.0);
    const returned = builder.unlocks(["circle", "square"]);

    expect(returned).toBe(builder);
    expect(builder.build().unlocks).toEqual(["circle", "square"]);
  });

  it("build() returns a copy – mutating the unlocks array does not affect a rebuild", () => {
    const builder = new LevelBuilder().zoom(1.0).unlocks(["circle"]);

    const first = builder.build();
    first.unlocks!.push("square"); // mutate the copy

    expect(builder.build().unlocks).toEqual(["circle"]);
  });
});

// ---------------------------------------------------------------------------
// GameplayBuilder
// ---------------------------------------------------------------------------

describe("GameplayBuilder", () => {
  it("all configuration methods return the builder for fluent chaining", () => {
    const b = new GameplayBuilder();

    expect(
      b.progression({ stacksPerLevel: 3, levelsPerWorld: 1 }),
    ).toBe(b);
    expect(
      b.growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 }),
    ).toBe(b);
    expect(
      b.scoring({
        qualityThresholds: {
          perfectMinRatio: 0.97,
          greatMinRatio: 0.92,
          goodMinRatio: 0.82,
        },
        qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
        streakBonusPerStack: 5,
      }),
    ).toBe(b);
    expect(b.modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })).toBe(b);
    expect(b.modeZen({ minClickRatio: 0.3, maxLives: 10 })).toBe(b);
    expect(b.colors(["#ff0000"])).toBe(b);
    expect(b.level(1, { zoom: 1.0 })).toBe(b);
    expect(b.world(1, (w) => w.mechanics(DEFAULT_MECHANICS))).toBe(b);
  });

  it("level() accepts a LevelBuilder callback", () => {
    const config = buildMinimalValid()
      .level(1, (lb) => lb.zoom(3.0).unlocks(["circle"]))
      .build();

    expect(config.levels[1].zoom).toBe(3.0);
    expect(config.levels[1].unlocks).toEqual(["circle"]);
  });

  it("world() allows a later world to inherit mechanics from an earlier one", () => {
    const config = buildMinimalValid()
      .world(2, (w) => w.inheritFrom(1).mechanics({ breathingEffect: true }))
      .build();

    expect(config.worlds[2].mechanics.breathingEffect).toBe(true);
    expect(config.worlds[2].mechanics.waveEffect).toBe(false); // inherited from world 1
  });

  it("boss() registers a boss config for the given score", () => {
    const config = buildMinimalValid()
      .boss(5, {
        type: "circle",
        growthSpeedMultiplier: 1.5,
        rotationSpeedMultiplier: 2,
        hueShift: true,
      })
      .build();

    expect(config.bosses[5]).toMatchObject({
      type: "circle",
      growthSpeedMultiplier: 1.5,
    });
  });

  it("boss() throws when the same score slot is registered twice", () => {
    expect(() =>
      buildMinimalValid()
        .boss(5, {
          type: "circle",
          growthSpeedMultiplier: 1,
          rotationSpeedMultiplier: 1,
          hueShift: false,
        })
        .boss(5, {
          type: "square",
          growthSpeedMultiplier: 2,
          rotationSpeedMultiplier: 2,
          hueShift: false,
        }),
    ).toThrow("Boss config already defined for score 5.");
  });

  describe("build() validation", () => {
    it("throws when progression config is missing", () => {
      expect(() =>
        new GameplayBuilder()
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors(["#ff0000"])
          .level(1, { zoom: 1.0 })
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("Progression config is required.");
    });

    it("throws when growth config is missing", () => {
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors(["#ff0000"])
          .level(1, { zoom: 1.0 })
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("Growth config is required.");
    });

    it("throws when mode configs are missing", () => {
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .colors(["#ff0000"])
          .level(1, { zoom: 1.0 })
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("Mode configs for timeAttack and zen are required.");
    });

    it("throws when scoring config is missing", () => {
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors(["#ff0000"])
          .level(1, { zoom: 1.0 })
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("Scoring config is required.");
    });

    it("throws when the colors array is empty", () => {
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors([])
          .level(1, { zoom: 1.0 })
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("At least one color is required.");
    });

    it("throws when a level required by levelsPerWorld is missing", () => {
      // levelsPerWorld: 2 requires both level 1 and level 2 to be defined
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 2 })
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors(["#ff0000"])
          .level(1, { zoom: 1.0 })
          // level 2 intentionally omitted
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("Missing level config for level 2.");
    });

    it("throws when a level has no finite zoom value", () => {
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors(["#ff0000"])
          .level(1, (lb) => lb /* zoom intentionally not set */)
          .world(1, (w) => w.mechanics(DEFAULT_MECHANICS))
          .build(),
      ).toThrow("Missing zoom for level 1.");
    });

    it("throws when world 1 is not defined", () => {
      expect(() =>
        new GameplayBuilder()
          .progression({ stacksPerLevel: 3, levelsPerWorld: 1 })
          .growth({ minSpeed: 30, maxSpeed: 80, referenceInitialSize: 360 })
          .scoring({
            qualityThresholds: {
              perfectMinRatio: 0.97,
              greatMinRatio: 0.92,
              goodMinRatio: 0.82,
            },
            qualityPoints: { perfect: 100, great: 70, good: 40, ok: 20 },
            streakBonusPerStack: 5,
          })
          .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
          .modeZen({ minClickRatio: 0.3, maxLives: 10 })
          .colors(["#ff0000"])
          .level(1, { zoom: 1.0 })
          // world 1 intentionally omitted
          .build(),
      ).toThrow("World 1 mechanics must be defined.");
    });

    it("succeeds and returns a complete GameplayConfig for a valid configuration", () => {
      const config = buildMinimalValid().build();

      expect(config.progression.stacksPerLevel).toBe(3);
      expect(config.growth.minSpeed).toBe(30);
      expect(config.modes.timeAttack.startTime).toBe(60);
      expect(config.modes.zen.maxLives).toBe(10);
      expect(config.colors).toEqual(["#ff0000"]);
      expect(config.levels[1].zoom).toBe(1.0);
      expect(config.worlds[1].mechanics).toMatchObject(DEFAULT_MECHANICS);
    });
  });
});
