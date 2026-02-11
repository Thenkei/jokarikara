import { DEFAULT_MECHANICS, GameplayBuilder } from "./builder";

export const gameplayConfig = new GameplayBuilder()
  .progression({ stacksPerLevel: 3, levelsPerWorld: 5 })
  .growth({ minSpeed: 35, maxSpeed: 80, referenceInitialSize: 360 })
  .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
  .modeZen({ minClickRatio: 0.3, maxLives: 10 })
  .colors([
    "#3b82f6", // blue
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
  ])
  .level(1, { zoom: 1.0, unlocks: ["circle", "octagon"] })
  .level(2, { zoom: 1.25, unlocks: ["pentagon", "hexagon"] })
  .level(3, { zoom: 2.0, unlocks: ["square"] })
  .level(4, { zoom: 4.5, unlocks: ["triangle"] })
  .level(5, { zoom: 12, unlocks: ["rectangle"] })
  .world(1, (w) =>
    w.name("Baseline")
      .mechanics(DEFAULT_MECHANICS)
      .visualProfile({
        hueCenter: 215,
        hueSpread: 24,
        saturationMin: 55,
        saturationMax: 75,
        lightnessMin: 48,
        lightnessMax: 62,
        neonBias: 0.1,
        glowIntensity: 0.22,
        contrastFloor: 2.4,
      }),
  )
  .world(2, (w) =>
    w
      .inheritFrom(1)
      .name("Breathing")
      .visualProfile({
        hueCenter: 150,
        hueSpread: 30,
        saturationMin: 58,
        saturationMax: 78,
        lightnessMin: 46,
        lightnessMax: 62,
        neonBias: 0.2,
        glowIntensity: 0.3,
      })
      .mechanics({
        breathingEffect: true,
        breathingAmplitude: 0.03,
        breathingSpeed: 2,
      }),
  )
  .world(3, (w) =>
    w
      .inheritFrom(2)
      .name("Accelerating Growth")
      .visualProfile({
        hueCenter: 36,
        hueSpread: 42,
        saturationMin: 62,
        saturationMax: 82,
        lightnessMin: 44,
        lightnessMax: 60,
        neonBias: 0.3,
        glowIntensity: 0.38,
      })
      .mechanics({ growthPattern: "accelerating" }),
  )
  .world(4, (w) =>
    w
      .inheritFrom(3)
      .name("Wave")
      .visualProfile({
        hueCenter: 330,
        hueSpread: 55,
        saturationMin: 64,
        saturationMax: 85,
        lightnessMin: 43,
        lightnessMax: 60,
        neonBias: 0.45,
        glowIntensity: 0.44,
      })
      .mechanics({
        waveEffect: true,
        waveAmplitude: 15,
        waveSpeed: 3,
      }),
  )
  .world(5, (w) =>
    w
      .inheritFrom(4)
      .name("Color Shift")
      .visualProfile({
        hueCenter: 290,
        hueSpread: 170,
        saturationMin: 78,
        saturationMax: 98,
        lightnessMin: 48,
        lightnessMax: 66,
        neonBias: 0.75,
        glowIntensity: 0.62,
        contrastFloor: 2.8,
      })
      .mechanics({
        colorShift: true,
        colorShiftSpeed: 30,
      }),
  )
  .world(6, (w) =>
    w
      .inheritFrom(5)
      .name("The Eclipse")
      .visualProfile({
        hueCenter: 205,
        hueSpread: 160,
        saturationMin: 74,
        saturationMax: 96,
        lightnessMin: 45,
        lightnessMax: 62,
        neonBias: 0.85,
        glowIntensity: 0.72,
      })
      .mechanics({
        eclipseEffect: true,
        eclipsePulseSpeed: 0.5,
      }),
  )
  .world(7, (w) =>
    w
      .inheritFrom(6)
      .name("Gravity Drift")
      .visualProfile({
        hueCenter: 128,
        hueSpread: 180,
        saturationMin: 75,
        saturationMax: 98,
        lightnessMin: 44,
        lightnessMax: 63,
        neonBias: 0.9,
        glowIntensity: 0.76,
      })
      .mechanics({
        gravityDrift: true,
        gravityDriftSpeed: 12,
      }),
  )
  .world(8, (w) =>
    w
      .inheritFrom(7)
      .name("Rotation Inversion")
      .visualProfile({
        hueCenter: 18,
        hueSpread: 180,
        saturationMin: 76,
        saturationMax: 100,
        lightnessMin: 42,
        lightnessMax: 60,
        neonBias: 1,
        glowIntensity: 0.82,
      })
      .mechanics({
        rotationInvertByLevel: true,
        rotationFlipOnBoss: true,
      }),
  )
  .boss(5, {
    type: "hexagon",
    growthSpeedMultiplier: 1.5,
    rotationSpeedMultiplier: 2.0,
    hueShift: true,
    pulseEnabled: true,
  })
  .boss(10, {
    type: "octagon",
    growthSpeedMultiplier: 2.0,
    rotationSpeedMultiplier: 2.5,
    hueShift: true,
    erraticRotationEnabled: true,
  })
  .boss(15, {
    type: "diamond",
    growthSpeedMultiplier: 2.2,
    rotationSpeedMultiplier: 3.0,
    hueShift: true,
    pulseEnabled: true,
  })
  .boss(20, {
    type: "star",
    growthSpeedMultiplier: 2.5,
    rotationSpeedMultiplier: 3.5,
    hueShift: true,
    pulseEnabled: true,
    erraticRotationEnabled: true,
  })
  .build();
