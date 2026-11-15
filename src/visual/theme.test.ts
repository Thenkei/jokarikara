import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetThemeCacheForTests,
  ARENA_RAMP_STEPS,
  arenaDangerColor,
  DEFAULT_DANGER,
  getPaletteArc,
  getWorldPalette,
  getWorldTheme,
  MONO_DANGER,
  MONO_DANGER_HUE,
  MONO_HUE,
  toMonoColor,
} from "./theme";

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.substring(0, 2), 16),
    g: parseInt(normalized.substring(2, 4), 16),
    b: parseInt(normalized.substring(4, 6), 16),
  };
};

const rgbToHsl = ({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): { h: number; s: number; l: number } => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
  }

  const l = (max + min) / 2;
  const s =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: h * 60,
    s: s * 100,
    l: l * 100,
  };
};

describe("world theme", () => {
  beforeEach(() => {
    __resetThemeCacheForTests();
  });

  it("returns deterministic theme for same world/seed/settings", () => {
    const a = getWorldTheme(5, 123456, false);
    const b = getWorldTheme(5, 123456, false);

    expect(a).toEqual(b);
    expect(a.id).toBe("5:123456:0");
  });

  it("returns varied palettes between worlds", () => {
    const world1 = getWorldPalette(1, 123456, false);
    const world6 = getWorldPalette(6, 123456, false);

    expect(world1).not.toEqual(world6);
  });

  it("biases world 5+ palettes toward higher saturation", () => {
    const world3 = getWorldPalette(3, 777, false);
    const world5 = getWorldPalette(5, 777, false);

    const avgSat = (palette: string[]) =>
      palette.reduce((sum, color) => {
        const hsl = rgbToHsl(hexToRgb(color));
        return sum + hsl.s;
      }, 0) / palette.length;

    expect(avgSat(world5)).toBeGreaterThan(avgSat(world3));
  });

  it("reduced fx flattens the relief and slows the hue shift", () => {
    const normal = getWorldTheme(7, 99, false);
    const reduced = getWorldTheme(7, 99, true);

    expect(reduced.shape.depth).toBeLessThan(normal.shape.depth);
    expect(reduced.shape.depth).toBeGreaterThan(0);
    expect(reduced.fx.hueShiftMultiplier).toBeLessThan(
      normal.fx.hueShiftMultiplier,
    );
  });

  it("ensures palette colors stay visible against background", () => {
    const theme = getWorldTheme(8, 1, false);
    expect(theme.palette.length).toBe(6);
    theme.palette.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe("palette arc and ground", () => {
  beforeEach(() => {
    __resetThemeCacheForTests();
  });

  const hueOf = (hex: string) => (rgbToHsl(hexToRgb(hex)).h + 360) % 360;
  const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  /** Degrees of the wheel a palette covers: 360 minus its widest empty gap. */
  const hueSpan = (palette: string[]) => {
    const hues = palette.map(hueOf).sort((a, b) => a - b);
    const gaps = hues.map((hue, i) => (hues[(i + 1) % hues.length] - hue + 360) % 360);
    return 360 - Math.max(...gaps);
  };
  const luminance = (hex: string) => {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const SEEDS = [0, 1, 42, 777, 123456, 4242, 99, 31337];

  it("widens with the world's hue spread and takes the whole wheel from 90", () => {
    expect(getPaletteArc({ hueSpread: 24 })).toBe(144);
    expect(getPaletteArc({ hueSpread: 55 })).toBe(175);
    expect(getPaletteArc({ hueSpread: 89 })).toBeLessThan(360);
    expect(getPaletteArc({ hueSpread: 90 })).toBe(360);
    expect(getPaletteArc({ hueSpread: 200 })).toBe(360);
  });

  it("worlds 1-4 keep a wide but one-sided sweep of six distinct colours", () => {
    for (const world of [1, 2, 3, 4]) {
      for (const seed of SEEDS) {
        const palette = getWorldPalette(world, seed, false);
        expect(new Set(palette).size).toBe(6);
        const span = hueSpan(palette);
        // Rich (well beyond one hue family) yet never the full wheel.
        expect(span, `world ${world} seed ${seed}`).toBeGreaterThan(90);
        expect(span, `world ${world} seed ${seed}`).toBeLessThan(210);
      }
    }
  });

  it("worlds 5+ spread their colours around the whole wheel", () => {
    for (const world of [5, 6, 7, 8, 9, 10]) {
      for (const seed of SEEDS) {
        // Six slots 60 degrees apart (plus jitter): no gap near a third of the wheel.
        expect(hueSpan(getWorldPalette(world, seed, false)), `world ${world} seed ${seed}`).toBeGreaterThan(250);
      }
    }
  });

  it("keeps an arc world's HUD colour on the world's own hue", () => {
    const worldHue: Record<number, number> = { 1: 215, 2: 150, 3: 36, 4: 330 };
    for (const [world, hue] of Object.entries(worldHue)) {
      for (const seed of SEEDS) {
        const { hud } = getWorldTheme(Number(world), seed, false);
        expect(hueDistance(hueOf(hud.primary), hue), `world ${world} seed ${seed}`).toBeLessThan(45);
      }
    }
  });

  it("puts neighbouring hues on different tones", () => {
    const lightnessOf = (hex: string) => rgbToHsl(hexToRgb(hex)).l;
    for (const world of [1, 5, 9]) {
      const byHue = [...getWorldPalette(world, 42, false)].sort((a, b) => hueOf(a) - hueOf(b));
      for (let i = 0; i + 1 < byHue.length; i += 1) {
        const apart =
          Math.abs(lightnessOf(byHue[i]) - lightnessOf(byHue[i + 1])) +
          hueDistance(hueOf(byHue[i]), hueOf(byHue[i + 1]));
        expect(apart, `world ${world} slots ${i}/${i + 1}`).toBeGreaterThan(20);
      }
    }
  });

  it("grounds each world in a deep tone of its own hue", () => {
    const worldHue: Record<number, number> = { 1: 215, 4: 330, 5: 290, 10: 350 };
    for (const [world, hue] of Object.entries(worldHue)) {
      const { background } = getWorldTheme(Number(world), 42, false);
      const ground = rgbToHsl(hexToRgb(background.base));
      expect(hueDistance((ground.h + 360) % 360, hue), `world ${world}`).toBeLessThan(12);
      expect(ground.l).toBeLessThan(12);
    }
  });

  it("greys the ground out near yellow, where a dark tone turns olive", () => {
    const saturationOf = (world: number) =>
      rgbToHsl(hexToRgb(getWorldTheme(world, 42, false).background.base)).s;
    // World 9 sits on yellow (hue 60); world 5 (hue 290) is far from it.
    expect(saturationOf(9)).toBeLessThan(saturationOf(5) * 0.7);
  });

  it("keeps every shape colour clear of the ground", () => {
    for (let world = 1; world <= 10; world += 1) {
      for (const seed of SEEDS) {
        for (const reducedFx of [false, true]) {
          const theme = getWorldTheme(world, seed, reducedFx);
          for (const color of theme.palette) {
            expect(contrast(color, theme.background.base), theme.id).toBeGreaterThanOrEqual(2.4);
          }
        }
      }
    }
  });
});

describe("mono look", () => {
  beforeEach(() => {
    __resetThemeCacheForTests();
  });

  const hueOf = (hex: string) => rgbToHsl(hexToRgb(hex)).h;
  const lightnessOf = (hex: string) => rgbToHsl(hexToRgb(hex)).l;

  it("tints the whole palette and HUD with one hue", () => {
    for (const world of [1, 5, 9]) {
      const theme = getWorldTheme(world, 4242, false, true);
      expect(theme.mono).toBe(true);
      for (const color of [...theme.palette, theme.hud.primary, theme.hud.text]) {
        expect(Math.abs(hueOf(color) - MONO_HUE)).toBeLessThan(3);
      }
    }
  });

  it("keeps brightness differences so neighbouring shapes stay distinct", () => {
    const palette = getWorldPalette(3, 777, false, true);
    expect(new Set(palette.map((c) => Math.round(lightnessOf(c)))).size).toBeGreaterThan(2);
    // Brighter in, brighter out.
    expect(lightnessOf(toMonoColor("#ffff00"))).toBeGreaterThan(
      lightnessOf(toMonoColor("#0000ff")),
    );
  });

  it("is a separate, cached variant that leaves the regular theme intact", () => {
    const regular = getWorldTheme(5, 1, false);
    const mono = getWorldTheme(5, 1, false, true);
    expect(mono).not.toBe(regular);
    expect(getWorldTheme(5, 1, false, true)).toBe(mono);
    expect(mono.id).toBe(`${regular.id}:mono`);
    expect(regular.mono).toBe(false);
    // Colour shift would rotate shapes out of the tint.
    expect(mono.fx.hueShiftMultiplier).toBe(0);
    expect(regular.fx.hueShiftMultiplier).toBeGreaterThan(0);
  });

  it("memoises colours and maps non-hex input to a fixed highlight", () => {
    expect(toMonoColor("#3b82f6")).toBe(toMonoColor("#3b82f6"));
    expect(toMonoColor("#fff")).toBe(toMonoColor("#ffffff"));
    const boss = toMonoColor("hsl(12.5, 80%, 60%)");
    expect(boss).toBe(toMonoColor("hsl(250, 80%, 60%)"));
    expect(Math.abs(hueOf(boss) - MONO_HUE)).toBeLessThan(3);
  });
});

describe("danger colours", () => {
  beforeEach(() => {
    __resetThemeCacheForTests();
  });

  const parse = (color: string): { r: number; g: number; b: number } => {
    const rgba = color.match(/^rgba\((\d+), (\d+), (\d+)/);
    return rgba
      ? { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) }
      : hexToRgb(color);
  };
  const hslOf = (color: string) => rgbToHsl(parse(color));
  /** Red to red-orange, never the Mono green. */
  const isDangerHue = (color: string) => {
    const { h, s } = hslOf(color);
    return s > 60 && (h <= 25 || h >= 345);
  };

  it("keeps the regular look's red signals", () => {
    const theme = getWorldTheme(3, 1, false);
    expect(theme.danger).toBe(DEFAULT_DANGER);
    expect(theme.danger.flash).toBe("#ff2a2a");
    expect(isDangerHue(theme.danger.fracture.stroke)).toBe(true);
    expect(theme.danger.arenaRamp[0]).toBe("#ffffff");
    expect(isDangerHue(theme.danger.arenaRamp[ARENA_RAMP_STEPS])).toBe(true);
  });

  it("Mono keeps danger semantically red: a hot red-orange, not the tint", () => {
    for (const world of [3, 9]) {
      for (const reducedFx of [false, true]) {
        const theme = getWorldTheme(world, 4242, reducedFx, true);
        expect(theme.danger).toBe(MONO_DANGER);
        const { fracture, flash, arenaRamp } = theme.danger;
        for (const color of [fracture.stroke, fracture.glow, fracture.reduced, flash]) {
          expect(isDangerHue(color)).toBe(true);
          expect(Math.abs(hslOf(color).h - MONO_DANGER_HUE)).toBeLessThan(3);
        }
        expect(isDangerHue(arenaRamp[ARENA_RAMP_STEPS])).toBe(true);
      }
    }
  });

  it("Mono arena ramp starts in the tint and warms monotonically to danger", () => {
    const ramp = MONO_DANGER.arenaRamp;
    expect(ramp).toHaveLength(ARENA_RAMP_STEPS + 1);
    expect(Math.abs(hslOf(ramp[0]).h - MONO_HUE)).toBeLessThan(3);
    const hues = ramp.map((c) => hslOf(c).h);
    for (let i = 1; i < hues.length; i += 1) {
      expect(hues[i]).toBeLessThanOrEqual(hues[i - 1] + 0.5);
    }
  });

  it("selects ramp colours by danger level without building strings", () => {
    expect(arenaDangerColor(MONO_DANGER, 0)).toBe(MONO_DANGER.arenaRamp[0]);
    expect(arenaDangerColor(MONO_DANGER, 1)).toBe(MONO_DANGER.arenaRamp[ARENA_RAMP_STEPS]);
    expect(arenaDangerColor(MONO_DANGER, 0.5)).toBe(
      MONO_DANGER.arenaRamp[ARENA_RAMP_STEPS / 2],
    );
    // Out of range and invalid levels clamp to a real colour.
    expect(arenaDangerColor(DEFAULT_DANGER, -1)).toBe(DEFAULT_DANGER.arenaRamp[0]);
    expect(arenaDangerColor(DEFAULT_DANGER, 7)).toBe(
      DEFAULT_DANGER.arenaRamp[ARENA_RAMP_STEPS],
    );
    expect(arenaDangerColor(DEFAULT_DANGER, Number.NaN)).toBe(DEFAULT_DANGER.arenaRamp[0]);
  });

  it("danger colours are frozen, shared constants", () => {
    expect(Object.isFrozen(MONO_DANGER)).toBe(true);
    expect(Object.isFrozen(MONO_DANGER.fracture)).toBe(true);
    expect(Object.isFrozen(MONO_DANGER.arenaRamp)).toBe(true);
    expect(getWorldTheme(9, 1, false, true).danger).toBe(getWorldTheme(3, 2, true, true).danger);
  });
});
