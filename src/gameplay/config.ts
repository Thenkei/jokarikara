import { DEFAULT_MECHANICS, GameplayBuilder } from "./builder";

export const gameplayConfig = new GameplayBuilder()
  .progression({ stacksPerLevel: 3, levelsPerWorld: 5 })
  .growth({ minSpeed: 35, maxSpeed: 80, referenceInitialSize: 360 })
  .modeTimeAttack({ startTime: 60, perfectStackBonus: 5 })
  .modeZen({ minClickRatio: 0.3 })
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
  .world(1, (w) => w.name("Baseline").mechanics(DEFAULT_MECHANICS))
  .world(2, (w) =>
    w
      .inheritFrom(1)
      .name("Breathing")
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
      .mechanics({ growthPattern: "accelerating" }),
  )
  .world(4, (w) =>
    w
      .inheritFrom(3)
      .name("Wave")
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
      .mechanics({
        colorShift: true,
        colorShiftSpeed: 30,
      }),
  )
  .world(6, (w) =>
    w
      .inheritFrom(5)
      .name("The Eclipse")
      .mechanics({
        eclipseEffect: true,
        eclipsePulseSpeed: 0.5,
      }),
  )
  .world(7, (w) =>
    w
      .inheritFrom(6)
      .name("Gravity Drift")
      .mechanics({
        gravityDrift: true,
        gravityDriftSpeed: 12,
      }),
  )
  .world(8, (w) =>
    w
      .inheritFrom(7)
      .name("Rotation Inversion")
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
