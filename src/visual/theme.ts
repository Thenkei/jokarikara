import { getWorldConfig } from "../gameplay/selectors";
import type { WorldVisualProfile } from "../gameplay/types";

const PALETTE_SIZE = 6;

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
  shape: {
    stroke: string;
    glow: string;
    glowBlur: number;
    lineWidth: number;
  };
  fx: {
    hueShiftMultiplier: number;
    breathingMultiplier: number;
    waveMultiplier: number;
    flashMultiplier: number;
  };
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

const mixHex = (from: string, to: string, ratio: number): string => {
  const clamped = clamp(ratio, 0, 1);
  const a = hexToRgb(from);
  const b = hexToRgb(to);

  const blend = (start: number, end: number) =>
    toInteger(start + (end - start) * clamped)
      .toString(16)
      .padStart(2, "0");

  return `#${blend(a.r, b.r)}${blend(a.g, b.g)}${blend(a.b, b.b)}`;
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

const createBackgroundBase = (profile: WorldVisualProfile): HslColor => ({
  h: normalizeHue(profile.hueCenter + 180),
  s: clamp(26 + profile.neonBias * 28, 20, 65),
  l: clamp(11 + profile.neonBias * 10, 8, 26),
});

const ensureContrast = (
  color: HslColor,
  backgroundHex: string,
  contrastFloor: number,
): HslColor => {
  let candidate = { ...color };
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

const createPalette = (
  world: number,
  profile: WorldVisualProfile,
  seed: number,
): { palette: string[]; backgroundBase: string } => {
  const rng = mulberry32(seed);
  const baseHue = normalizeHue(
    profile.hueCenter + randomBetween(rng, -profile.hueSpread, profile.hueSpread),
  );
  const backgroundBaseHex = hslToHex(createBackgroundBase(profile));
  const palette: string[] = [];

  for (let i = 0; i < PALETTE_SIZE; i += 1) {
    const slotHueNoise = randomBetween(
      rng,
      -profile.hueSpread * 0.35,
      profile.hueSpread * 0.35,
    );
    const slotHue = normalizeHue(baseHue + i * (360 / PALETTE_SIZE) + slotHueNoise);

    const neonKick = world >= 5 ? profile.neonBias * 12 : profile.neonBias * 5;
    const slotSaturation = clamp(
      randomBetween(rng, profile.saturationMin, profile.saturationMax) + neonKick,
      15,
      100,
    );
    const slotLightness = randomBetween(
      rng,
      profile.lightnessMin,
      profile.lightnessMax,
    );

    const adjusted = ensureContrast(
      {
        h: slotHue,
        s: slotSaturation,
        l: slotLightness,
      },
      backgroundBaseHex,
      profile.contrastFloor,
    );

    palette.push(hslToHex(adjusted));
  }

  return {
    palette,
    backgroundBase: backgroundBaseHex,
  };
};

export const getWorldTheme = (
  world: number,
  runSeed: number,
  reducedFx: boolean = false,
): WorldTheme => {
  const id = `${world}:${runSeed}:${reducedFx ? 1 : 0}`;
  const cached = cache.get(id);
  if (cached) {
    return cached;
  }

  const profile = resolveProfile(world, reducedFx);
  const themeSeed = hashSeed(runSeed, world);
  const { palette, backgroundBase } = createPalette(world, profile, themeSeed);

  const primary = palette[0] ?? "#3b82f6";
  const secondary = palette[2] ?? "#ec4899";
  const accent = palette[4] ?? "#10b981";

  const baseTheme: WorldTheme = {
    id,
    world,
    runSeed,
    reducedFx,
    palette,
    background: {
      base: mixHex(backgroundBase, "#050507", 0.35),
      innerGlow: withAlpha(primary, reducedFx ? 0.11 : 0.18),
      outerGlow: withAlpha(secondary, reducedFx ? 0.06 : 0.12),
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
      stroke: withAlpha("#ffffff", reducedFx ? 0.24 : 0.4),
      glow: withAlpha(primary, reducedFx ? 0.2 : 0.38),
      glowBlur: reducedFx ? 8 : 16 + profile.glowIntensity * 18,
      lineWidth: reducedFx ? 2 : 2.5 + profile.glowIntensity,
    },
    fx: {
      hueShiftMultiplier: reducedFx ? 0.55 : 1 + profile.neonBias * 0.25,
      breathingMultiplier: reducedFx ? 0.65 : 1,
      waveMultiplier: reducedFx ? 0.6 : 1,
      flashMultiplier: reducedFx ? 0.5 : 1,
    },
  };

  cache.set(id, baseTheme);
  return baseTheme;
};

export const getWorldPalette = (
  world: number,
  runSeed: number,
  reducedFx: boolean = false,
): string[] => getWorldTheme(world, runSeed, reducedFx).palette;

export const __resetThemeCacheForTests = (): void => {
  cache.clear();
};
