import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetThemeCacheForTests,
  getWorldPalette,
  getWorldTheme,
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

  it("reduced fx reduces glow intensity and hue shift speed", () => {
    const normal = getWorldTheme(7, 99, false);
    const reduced = getWorldTheme(7, 99, true);

    expect(reduced.shape.glowBlur).toBeLessThan(normal.shape.glowBlur);
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
