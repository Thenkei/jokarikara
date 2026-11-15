import { getWorldConfig } from "../gameplay/selectors";
import type { WorldVisualProfile } from "../gameplay/types";

const PALETTE_SIZE = 6;
/** Rim widths in CSS px (the canvas is scaled by the device pixel ratio). */
const SHAPE_RIM_WIDTH = 1.25;
const ACTIVE_RIM_WIDTH = 2;

const DEFAULT_PROFILE: WorldVisualProfile = {
  hueCenter: 220,
  hueSpread: 40,
  saturationMin: 58,
  saturationMax: 80,
  lightnessMin: 46,
  lightnessMax: 62,
  neonBias: 0.2,
  glowIntensity: 0.35,
  contrastFloor: 2.4,
};

export interface WorldTheme {
  id: string;
  world: number;
  runSeed: number;
  reducedFx: boolean;
  /**
   * Session-only "Mono" look: every colour is a shade of one tint. The
   * renderer maps colours it does not own (shape fills, effects) through
   * `toMonoColor` when this is set.
   */
  mono: boolean;
  palette: string[];
  background: {
    base: string;
    innerGlow: string;
    outerGlow: string;
    vignette: string;
  };
  hud: {
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    subtleText: string;
  };
  /**
   * Layer material: each shape is an opaque cut-out with a lit rim, lifted
   * off the layer below by a cast shadow (see CAST_SHADOW in the renderer).
   */
  shape: {
    /** Lit rim of a stacked layer. */
    stroke: string;
    lineWidth: number;
    /** Brighter, heavier rim of the growing shape: the edge the player times. */
    activeStroke: string;
    activeLineWidth: number;
    /** Cast shadow colour; the renderer scales its alpha per pass. */
    shadow: string;
    /** Cast shadow distance in CSS px (0 = flat). */
    depth: number;
  };
  fx: {
    hueShiftMultiplier: number;
    breathingMultiplier: number;
    waveMultiplier: number;
    flashMultiplier: number;
  };
  /** Danger signals keep their own hue, Mono included (see `DangerColors`). */
  danger: DangerColors;
}

/**
 * Colours of the canvas danger signals: fracture windows (world 3), the
 * Reverse Stack arena warning (world 9) and the fail flash. They are semantic,
 * not decorative, so the Mono look does not fold them into its tint: it swaps
 * them for a hot red-orange that still reads as danger next to the phosphor
 * green (a brighter green would read as "good"). Precomputed once per look:
 * the renderer only picks strings, never builds them per frame.
 */
export interface DangerColors {
  fracture: {
    stroke: string;
    glow: string;
    /** Single stroke used with reduced effects (no glow pass). */
    reduced: string;
  };
  /**
   * Opaque arena rim colours from calm (index 0) to full danger (last index,
   * `ARENA_RAMP_STEPS`). The renderer applies the rim alpha via `globalAlpha`.
   */
  arenaRamp: readonly string[];
  /** Fill of the fail flash. */
  flash: string;
}

type HslColor = {
  h: number;
  s: number;
  l: number;
};

const cache = new Map<string, WorldTheme>();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toInteger = (value: number): number => Math.round(value);

const hashSeed = (runSeed: number, world: number): number => {
  let hash = (runSeed | 0) ^ ((world * 0x9e3779b9) | 0);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return (hash ^ (hash >>> 16)) >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomBetween = (rng: () => number, min: number, max: number): number =>
  min + rng() * (max - min);

const normalizeHue = (hue: number): number => {
  const mod = hue % 360;
  return mod < 0 ? mod + 360 : mod;
};

const hslToHex = ({ h, s, l }: HslColor): string => {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hPrime = normalizeHue(h) / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hPrime >= 0 && hPrime < 1) {
    r1 = c;
    g1 = x;
  } else if (hPrime < 2) {
    r1 = x;
    g1 = c;
  } else if (hPrime < 3) {
    g1 = c;
    b1 = x;
  } else if (hPrime < 4) {
    g1 = x;
    b1 = c;
  } else if (hPrime < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = light - c / 2;
  const r = toInteger((r1 + m) * 255)
    .toString(16)
    .padStart(2, "0");
  const g = toInteger((g1 + m) * 255)
    .toString(16)
    .padStart(2, "0");
  const b = toInteger((b1 + m) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${r}${g}${b}`;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const sanitized = hex.replace("#", "");
  const value =
    sanitized.length === 3
      ? sanitized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : sanitized;

  return {
    r: parseInt(value.substring(0, 2), 16),
    g: parseInt(value.substring(2, 4), 16),
    b: parseInt(value.substring(4, 6), 16),
  };
};

const relativeLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (n: number) => {
    const normalized = n / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  const rLin = channel(r);
  const gLin = channel(g);
  const bLin = channel(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
};

const contrastRatio = (hexA: string, hexB: string): number => {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
};

const withAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex);
  const normalized = clamp(alpha, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${normalized})`;
};

const resolveProfile = (
  world: number,
  reducedFx: boolean,
): WorldVisualProfile => {
  const worldConfig = getWorldConfig(world);
  const merged: WorldVisualProfile = {
    ...DEFAULT_PROFILE,
    ...(worldConfig.visualProfile ?? {}),
  };

  if (world >= 5) {
    merged.saturationMin = Math.max(merged.saturationMin, 76);
    merged.saturationMax = Math.max(merged.saturationMax, 94);
    merged.neonBias = Math.max(merged.neonBias, 0.75);
    merged.contrastFloor = Math.max(merged.contrastFloor, 2.8);
  }

  if (reducedFx) {
    merged.saturationMin *= 0.85;
    merged.saturationMax *= 0.88;
    merged.lightnessMin += 4;
    merged.lightnessMax += 4;
    merged.glowIntensity *= 0.55;
    merged.neonBias *= 0.65;
  }

  return {
    ...merged,
    saturationMin: clamp(merged.saturationMin, 20, 98),
    saturationMax: clamp(merged.saturationMax, merged.saturationMin, 100),
    lightnessMin: clamp(merged.lightnessMin, 10, 80),
    lightnessMax: clamp(merged.lightnessMax, merged.lightnessMin, 90),
    glowIntensity: clamp(merged.glowIntensity, 0, 1),
    neonBias: clamp(merged.neonBias, 0, 1),
    contrastFloor: clamp(merged.contrastFloor, 1.6, 5),
  };
};

/**
 * Ground under the stack: a deep tone of the world's own hue, so the world
 * reads as "the blue one" or "the amber one" before a single shape lands.
 * (It used to be the darkened complement, which turned to maroon and olive.)
 */
const createGround = (profile: WorldVisualProfile): { base: HslColor; lift: HslColor } => {
  const hue = normalizeHue(profile.hueCenter);
  const saturation = groundSaturationScale(hue);
  return {
    base: {
      h: hue,
      s: clamp(34 + profile.neonBias * 8, 20, 50) * saturation,
      l: clamp(8 + profile.neonBias * 1.5, 6, 11),
    },
    /** Centre of the ground, lit from above the stack. */
    lift: {
      h: hue,
      s: clamp(44 + profile.neonBias * 8, 25, 60) * saturation,
      l: clamp(16 + profile.neonBias * 3, 12, 21),
    },
  };
};

/** A dark, saturated yellow is olive: the ground greys out around this hue. */
const OLIVE_HUE = 65;
const OLIVE_BAND = 45;
const OLIVE_DESATURATION = 0.55;

/** Saturation multiplier for the ground: 1 away from yellow, lower inside it. */
const groundSaturationScale = (hue: number): number => {
  const distance = Math.abs(((hue - OLIVE_HUE + 540) % 360) - 180);
  const yellowness = Math.max(0, 1 - distance / OLIVE_BAND);
  return 1 - OLIVE_DESATURATION * yellowness;
};

const FULL_WHEEL = 360;
/** A profile spread at or above this is a full-spectrum world. */
const FULL_WHEEL_SPREAD = 90;
/** Narrowest sweep: six slots this far apart are still six distinct colours. */
const MIN_PALETTE_ARC = 120;

/**
 * Width (degrees) of the hue sweep the palette slots are spread across.
 * Worlds 1-4 sweep a wide but one-sided arc around their hue (a cool world,
 * a warm world) that widens with the profile's spread; the neon worlds
 * (spread >= FULL_WHEEL_SPREAD) take the whole wheel.
 */
export const getPaletteArc = (profile: Pick<WorldVisualProfile, "hueSpread">): number =>
  profile.hueSpread >= FULL_WHEEL_SPREAD
    ? FULL_WHEEL
    : MIN_PALETTE_ARC + Math.max(0, profile.hueSpread);

/**
 * Share of the world's lightness range per slot, indexed by the slot's rank
 * along the sweep. Neighbouring hues never share a tone, so two layers stay
 * apart by tone as well as hue.
 */
const SLOT_TONES: readonly number[] = [0.74, 0.39, 0.17, 0.61, 1, 0];
/** Extra lightness range around the profile's bounds, for the tone steps. */
const TONE_MARGIN = { below: 4, above: 5 } as const;
/**
 * Rank along the sweep of each palette index. An arc lists its two central
 * slots first and its two ends at indices 2 and 4, so the HUD colours
 * (palette[0], [2], [4]) are the world's own hue and both ends of its range.
 */
const ARC_SLOT_RANK: readonly number[] = [2, 3, 0, 4, 5, 1];
const WHEEL_SLOT_RANK: readonly number[] = [0, 1, 2, 3, 4, 5];
/** Seeded hue wobble per slot, as a share of the gap between slots. */
const SLOT_HUE_JITTER = 0.18;
/** Seeded shift of the whole sweep, capped so a world keeps its temperature. */
const MAX_ARC_ANCHOR_JITTER = 18;
const WHEEL_ANCHOR_JITTER = 30;
/**
 * Pure hues differ a lot in brightness (yellow ~0.93, blue ~0.07): nudging
 * lightness against it keeps yellows from glaring and blues from sinking.
 */
const HUE_LUMINANCE_PIVOT = 0.35;
const HUE_LUMINANCE_GAIN = 13;

const hueLuminance = (hue: number): number =>
  relativeLuminance(hslToHex({ h: hue, s: 100, l: 50 }));

const ensureContrast = (
  color: HslColor,
  backgroundHex: string,
  contrastFloor: number,
): HslColor => {
  const candidate = { ...color };
  for (let i = 0; i < 8; i += 1) {
    const ratio = contrastRatio(hslToHex(candidate), backgroundHex);
    if (ratio >= contrastFloor) {
      return candidate;
    }
    const backgroundLum = relativeLuminance(backgroundHex);
    if (backgroundLum < 0.35) {
      candidate.l = clamp(candidate.l + 4, 12, 90);
    } else {
      candidate.l = clamp(candidate.l - 4, 10, 88);
    }
  }
  return candidate;
};

/**
 * Six colours swept across the world's hue arc (see getPaletteArc), each on
 * its own tone step. The run seed shifts the sweep and wobbles each slot, so
 * two runs of a world are siblings, not copies.
 */
const createPalette = (
  world: number,
  profile: WorldVisualProfile,
  seed: number,
): { palette: string[]; groundBase: string; groundLift: string } => {
  const rng = mulberry32(seed);
  const arc = getPaletteArc(profile);
  const fullWheel = arc >= FULL_WHEEL;
  const anchorJitter = fullWheel
    ? WHEEL_ANCHOR_JITTER
    : Math.min(profile.hueSpread * 0.5, MAX_ARC_ANCHOR_JITTER);
  const anchor = profile.hueCenter + randomBetween(rng, -anchorJitter, anchorJitter);
  const step = arc / PALETTE_SIZE;
  // An arc is centred on the anchor; the wheel starts on it.
  const firstHue = fullWheel ? anchor : anchor - (arc - step) / 2;
  const ranks = fullWheel ? WHEEL_SLOT_RANK : ARC_SLOT_RANK;

  const ground = createGround(profile);
  const groundBase = hslToHex(ground.base);
  const toneMin = profile.lightnessMin - TONE_MARGIN.below;
  const toneMax = profile.lightnessMax + TONE_MARGIN.above;
  const neonKick = world >= 5 ? profile.neonBias * 12 : profile.neonBias * 5;
  const palette: string[] = [];

  for (let i = 0; i < PALETTE_SIZE; i += 1) {
    const rank = ranks[i % ranks.length];
    const hue = normalizeHue(
      firstHue + rank * step + randomBetween(rng, -step, step) * SLOT_HUE_JITTER,
    );
    const saturation = clamp(
      randomBetween(
        rng,
        (profile.saturationMin + profile.saturationMax) / 2,
        profile.saturationMax,
      ) + neonKick,
      15,
      100,
    );
    const lightness =
      toneMin +
      (toneMax - toneMin) * SLOT_TONES[rank % SLOT_TONES.length] +
      (HUE_LUMINANCE_PIVOT - hueLuminance(hue)) * HUE_LUMINANCE_GAIN;

    palette.push(
      hslToHex(
        ensureContrast(
          { h: hue, s: saturation, l: clamp(lightness, 20, 82) },
          groundBase,
          profile.contrastFloor,
        ),
      ),
    );
  }

  return { palette, groundBase, groundLift: hslToHex(ground.lift) };
};

// ---------------------------------------------------------------------------
// Mono look
// ---------------------------------------------------------------------------

/** Phosphor green, the hue of every colour in the Mono look. */
export const MONO_HUE = 140;
const MONO_SATURATION = 90;
const MONO_LIGHTNESS = { min: 20, max: 82 } as const;
/**
 * Relative luminance range stretched onto MONO_LIGHTNESS. World palettes
 * cluster in ~0.15-0.6 (contrast floor + saturated hues), so mapping the
 * full 0-1 range would flatten every shape into the same green.
 */
const MONO_LUMINANCE = { min: 0.08, max: 0.68 } as const;
/** For non-hex input (e.g. the boss shape's per-frame rainbow hsl). */
const MONO_HIGHLIGHT = hslToHex({ h: MONO_HUE, s: 100, l: 76 });
/** Same bound as the renderer's hsl cache: palettes are small, fixed sets. */
const MONO_CACHE_LIMIT = 256;
const monoCache = new Map<string, string>();

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Maps any colour to the Mono tint, keeping its perceived brightness (a blue
 * stays a dark green, a yellow a bright one), so neighbouring shapes stay
 * distinguishable. Memoised: palette colours are parsed once, and a render
 * frame only does map lookups (no allocation). Non-hex colours, such as the
 * boss shape's rainbow, map to a fixed highlight without touching the cache.
 */
export const toMonoColor = (color: string): string => {
  const cached = monoCache.get(color);
  if (cached) return cached;
  if (!HEX_COLOR.test(color)) return MONO_HIGHLIGHT;
  const luminance = relativeLuminance(color.length === 9 ? color.slice(0, 7) : color);
  const t = clamp(
    (luminance - MONO_LUMINANCE.min) / (MONO_LUMINANCE.max - MONO_LUMINANCE.min),
    0,
    1,
  );
  const mapped = hslToHex({
    h: MONO_HUE,
    s: MONO_SATURATION,
    l: MONO_LIGHTNESS.min + (MONO_LIGHTNESS.max - MONO_LIGHTNESS.min) * t,
  });
  if (monoCache.size >= MONO_CACHE_LIMIT) monoCache.clear();
  monoCache.set(color, mapped);
  return mapped;
};

/** A shade of the Mono tint (lightness/saturation in %). */
export const monoShade = (lightness: number, saturation = MONO_SATURATION): string =>
  hslToHex({ h: MONO_HUE, s: saturation, l: lightness });

// ---------------------------------------------------------------------------
// Danger colours
// ---------------------------------------------------------------------------

/** Resolution of the arena warning ramp (danger 0..1 in this many steps). */
export const ARENA_RAMP_STEPS = 32;

/**
 * Hot red-orange for danger in the Mono look: far enough from MONO_HUE to
 * never read as part of the tint, warm enough to sit with phosphor green.
 */
export const MONO_DANGER_HUE = 14;

const buildRamp = (colorAt: (t: number) => string): readonly string[] =>
  Object.freeze(
    Array.from({ length: ARENA_RAMP_STEPS + 1 }, (_, i) => colorAt(i / ARENA_RAMP_STEPS)),
  );

const freezeDanger = (danger: DangerColors): DangerColors =>
  Object.freeze({ ...danger, fracture: Object.freeze({ ...danger.fracture }) });

/** Regular look: white rim turning red, red fracture windows and flash. */
export const DEFAULT_DANGER: DangerColors = freezeDanger({
  fracture: {
    stroke: "rgba(255, 108, 108, 0.78)",
    glow: "rgba(255, 90, 90, 0.28)",
    reduced: "rgba(255, 130, 130, 0.36)",
  },
  arenaRamp: buildRamp((t) => {
    const gb = toInteger(255 - t * 165)
      .toString(16)
      .padStart(2, "0");
    return `#ff${gb}${gb}`;
  }),
  flash: "#ff2a2a",
});

const monoDanger = (lightness: number): string =>
  hslToHex({ h: MONO_DANGER_HUE, s: 100, l: lightness });

/**
 * Mono look: the arena rim starts as a pale tint and warms through yellow and
 * amber to the danger red-orange. The hue is interpolated (an RGB mix would
 * pass through a muddy olive) with an ease-out, so the rim already reads as
 * red-orange in the last stretch before the limit, like the regular look's
 * red, rather than lingering in amber.
 */
export const MONO_DANGER: DangerColors = freezeDanger({
  fracture: {
    stroke: withAlpha(monoDanger(60), 0.88),
    glow: withAlpha(monoDanger(55), 0.32),
    reduced: withAlpha(monoDanger(64), 0.45),
  },
  arenaRamp: buildRamp((t) => {
    const warmth = 1 - (1 - t) * (1 - t);
    return hslToHex({
      h: MONO_HUE + (MONO_DANGER_HUE - MONO_HUE) * warmth,
      s: 100,
      l: 70 - 12 * warmth,
    });
  }),
  flash: monoDanger(52),
});

/** Arena rim colour for a danger level in [0, 1] (clamped; no allocation). */
export const arenaDangerColor = (danger: DangerColors, level: number): string =>
  danger.arenaRamp[
    Number.isFinite(level) ? Math.round(clamp(level, 0, 1) * ARENA_RAMP_STEPS) : 0
  ];

/** Derives the Mono variant of a theme: same structure, one tint. */
const toMonoTheme = (base: WorldTheme): WorldTheme => {
  const primary = toMonoColor(base.hud.primary);
  const secondary = toMonoColor(base.hud.secondary);
  const { reducedFx } = base;
  return {
    ...base,
    id: `${base.id}:mono`,
    mono: true,
    palette: base.palette.map(toMonoColor),
    background: {
      base: monoShade(4, 60),
      innerGlow: withAlpha(primary, reducedFx ? 0.1 : 0.16),
      outerGlow: withAlpha(secondary, reducedFx ? 0.05 : 0.1),
      vignette: base.background.vignette,
    },
    hud: {
      primary,
      secondary,
      accent: toMonoColor(base.hud.accent),
      text: monoShade(92, 100),
      subtleText: monoShade(74, 60),
    },
    shape: {
      ...base.shape,
      stroke: withAlpha(monoShade(88, 100), reducedFx ? 0.26 : 0.4),
      activeStroke: withAlpha(monoShade(92, 100), 0.9),
    },
    // Colour shift would rotate shapes out of the tint.
    fx: { ...base.fx, hueShiftMultiplier: 0 },
    danger: MONO_DANGER,
  };
};

export const getWorldTheme = (
  world: number,
  runSeed: number,
  reducedFx: boolean = false,
  mono: boolean = false,
): WorldTheme => {
  const id = `${world}:${runSeed}:${reducedFx ? 1 : 0}${mono ? ":mono" : ""}`;
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }
  if (mono) {
    const monoTheme = toMonoTheme(getWorldTheme(world, runSeed, reducedFx));
    cache.set(id, monoTheme);
    return monoTheme;
  }

  const profile = resolveProfile(world, reducedFx);
  const themeSeed = hashSeed(runSeed, world);
  const { palette, groundBase, groundLift } = createPalette(world, profile, themeSeed);

  const primary = palette[0] ?? "#3b82f6";
  const secondary = palette[2] ?? "#ec4899";
  const accent = palette[4] ?? "#10b981";

  const baseTheme: WorldTheme = {
    id,
    world,
    runSeed,
    reducedFx,
    mono: false,
    palette,
    background: {
      base: groundBase,
      innerGlow: withAlpha(groundLift, reducedFx ? 0.6 : 0.8),
      outerGlow: withAlpha(groundLift, 0),
      vignette: withAlpha("#000000", reducedFx ? 0.24 : 0.36),
    },
    hud: {
      primary,
      secondary,
      accent,
      text: "#f5f8ff",
      subtleText: "#c7cedb",
    },
    shape: {
      // Translucent white over the fill reads as a lighter tint of that fill:
      // a lit rim in any palette colour, with no per-colour string to derive.
      stroke: withAlpha("#ffffff", reducedFx ? 0.26 : 0.3 + profile.neonBias * 0.12),
      lineWidth: SHAPE_RIM_WIDTH,
      activeStroke: withAlpha("#ffffff", 0.88),
      activeLineWidth: ACTIVE_RIM_WIDTH,
      shadow: withAlpha("#000000", reducedFx ? 0.2 : 0.26),
      depth: reducedFx ? 2.5 : 3.5 + profile.glowIntensity * 3,
    },
    fx: {
      hueShiftMultiplier: reducedFx ? 0.55 : 1 + profile.neonBias * 0.25,
      breathingMultiplier: reducedFx ? 0.65 : 1,
      waveMultiplier: reducedFx ? 0.6 : 1,
      flashMultiplier: reducedFx ? 0.5 : 1,
    },
    danger: DEFAULT_DANGER,
  };

  cache.set(id, baseTheme);
  return baseTheme;
};

export const getWorldPalette = (
  world: number,
  runSeed: number,
  reducedFx: boolean = false,
  mono: boolean = false,
): string[] => getWorldTheme(world, runSeed, reducedFx, mono).palette;

export const __resetThemeCacheForTests = (): void => {
  cache.clear();
  monoCache.clear();
};
