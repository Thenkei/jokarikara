import type {
  BossConfig,
  GameplayConfig,
  LevelConfig,
  WorldConfig,
  WorldMechanics,
  WorldVisualProfile,
} from "./types";

export const DEFAULT_MECHANICS: WorldMechanics = {
  breathingEffect: false,
  breathingAmplitude: 0,
  breathingSpeed: 0,
  growthPattern: "linear",
  waveEffect: false,
  waveAmplitude: 0,
  waveSpeed: 0,
  colorShift: false,
  colorShiftSpeed: 0,
  eclipseEffect: false,
  eclipsePulseSpeed: 0,
  gravityDrift: false,
  gravityDriftSpeed: 0,
  rotationInvertByLevel: false,
  rotationFlipOnBoss: false,
  reverseStacking: false,
};

export class WorldBuilder {
  private config: WorldConfig;
  private getWorldMechanics?: (
    worldNumber: number,
  ) => WorldMechanics | undefined;

  constructor(
    baseMechanics: WorldMechanics,
    getWorldMechanics?: (worldNumber: number) => WorldMechanics | undefined,
  ) {
    this.config = { mechanics: { ...baseMechanics } };
    this.getWorldMechanics = getWorldMechanics;
  }

  mechanics(partial: Partial<WorldMechanics>): this {
    this.config.mechanics = { ...this.config.mechanics, ...partial };
    return this;
  }

  inheritFrom(worldNumber: number): this {
    if (!this.getWorldMechanics) {
      throw new Error("inheritFrom is not available without a world registry.");
    }
    const mechanics = this.getWorldMechanics(worldNumber);
    if (!mechanics) {
      throw new Error(`World ${worldNumber} is not defined yet.`);
    }
    this.config.mechanics = { ...mechanics };
    return this;
  }

  name(name: string): this {
    this.config.name = name;
    return this;
  }

  visualProfile(profile: Partial<WorldVisualProfile>): this {
    this.config.visualProfile = {
      ...(this.config.visualProfile ?? {}),
      ...profile,
    };
    return this;
  }

  build(): WorldConfig {
    return {
      ...this.config,
      mechanics: { ...this.config.mechanics },
      visualProfile: this.config.visualProfile
        ? { ...this.config.visualProfile }
        : undefined,
    };
  }
}

export class LevelBuilder {
  private config: LevelConfig;

  constructor() {
    this.config = { zoom: Number.NaN };
  }

  zoom(value: number): this {
    this.config.zoom = value;
    return this;
  }

  unlocks(values: LevelConfig["unlocks"]): this {
    this.config.unlocks = values;
    return this;
  }

  build(): LevelConfig {
    return {
      ...this.config,
      unlocks: this.config.unlocks ? [...this.config.unlocks] : undefined,
    };
  }
}

type LevelConfigInput = LevelConfig | ((builder: LevelBuilder) => void);

export class GameplayBuilder {
  private progressionConfig?: GameplayConfig["progression"];
  private growthConfig?: GameplayConfig["growth"];
  private scoringConfig?: GameplayConfig["scoring"];
  private modesConfig?: Partial<GameplayConfig["modes"]>;
  private colorsConfig?: GameplayConfig["colors"];
  private levelsConfig: GameplayConfig["levels"] = {};
  private worldsConfig: GameplayConfig["worlds"] = {};
  private bossesConfig: GameplayConfig["bosses"] = {};
  private baseMechanics: WorldMechanics;

  constructor(baseMechanics: WorldMechanics = DEFAULT_MECHANICS) {
    this.baseMechanics = baseMechanics;
  }

  progression(config: GameplayConfig["progression"]): this {
    this.progressionConfig = config;
    return this;
  }

  growth(config: GameplayConfig["growth"]): this {
    this.growthConfig = config;
    return this;
  }

  scoring(config: GameplayConfig["scoring"]): this {
    this.scoringConfig = config;
    return this;
  }

  modeTimeAttack(config: GameplayConfig["modes"]["timeAttack"]): this {
    this.modesConfig = {
      ...(this.modesConfig ?? {}),
      timeAttack: config,
    };
    return this;
  }

  modeZen(config: GameplayConfig["modes"]["zen"]): this {
    this.modesConfig = {
      ...(this.modesConfig ?? {}),
      zen: config,
    };
    return this;
  }

  colors(colors: GameplayConfig["colors"]): this {
    this.colorsConfig = colors;
    return this;
  }

  level(levelNumber: number, config: LevelConfigInput): this {
    if (typeof config === "function") {
      const builder = new LevelBuilder();
      config(builder);
      this.levelsConfig[levelNumber] = builder.build();
      return this;
    }
    this.levelsConfig[levelNumber] = { ...config };
    return this;
  }

  world(worldNumber: number, builderFn: (builder: WorldBuilder) => void): this {
    const builder = new WorldBuilder(this.baseMechanics, (world) => {
      return this.worldsConfig[world]?.mechanics;
    });
    builderFn(builder);
    this.worldsConfig[worldNumber] = builder.build();
    return this;
  }

  boss(scorePlusOne: number, config: BossConfig): this {
    if (this.bossesConfig[scorePlusOne]) {
      throw new Error(`Boss config already defined for score ${scorePlusOne}.`);
    }
    this.bossesConfig[scorePlusOne] = { ...config };
    return this;
  }

  build(): GameplayConfig {
    if (!this.progressionConfig) {
      throw new Error("Progression config is required.");
    }
    if (!this.growthConfig) {
      throw new Error("Growth config is required.");
    }
    if (!this.modesConfig?.timeAttack || !this.modesConfig?.zen) {
      throw new Error("Mode configs for timeAttack and zen are required.");
    }
    if (!this.scoringConfig) {
      throw new Error("Scoring config is required.");
    }
    if (!this.colorsConfig || this.colorsConfig.length === 0) {
      throw new Error("At least one color is required.");
    }
    const levelsPerWorld = this.progressionConfig.levelsPerWorld;
    for (let level = 1; level <= levelsPerWorld; level += 1) {
      if (!this.levelsConfig[level]) {
        throw new Error(`Missing level config for level ${level}.`);
      }
      if (!Number.isFinite(this.levelsConfig[level].zoom)) {
        throw new Error(`Missing zoom for level ${level}.`);
      }
    }
    if (!this.worldsConfig[1]) {
      throw new Error("World 1 mechanics must be defined.");
    }

    return {
      progression: this.progressionConfig,
      growth: this.growthConfig,
      scoring: this.scoringConfig,
      modes: this.modesConfig as GameplayConfig["modes"],
      colors: this.colorsConfig,
      levels: this.levelsConfig,
      worlds: this.worldsConfig,
      bosses: this.bossesConfig,
    };
  }
}
