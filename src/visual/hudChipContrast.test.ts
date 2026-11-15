/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getWorldTheme, type WorldTheme } from "./theme";

/**
 * HUD chips tint their background with the run's seeded palette and carry
 * light text. The E2E axe audit only sees one seed, so this sweeps worlds,
 * seeds, reduced FX and Mono against the exact `color-mix()` rules in App.css
 * (parsed, not copied) and requires WCAG AA (4.5:1) for every chip label.
 */

type Rgba = { r: number; g: number; b: number; a: number };
type HudVar = keyof WorldTheme["hud"];

// Read from disk: Vitest stubs CSS imports (even `?raw`) to empty strings.
// Vitest runs from the repo root; under jsdom import.meta.url is not a file URL.
const CSS = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");
const AA = 4.5;

const HUD_VARS: Record<string, HudVar> = {
  "--world-hud-primary": "primary",
  "--world-hud-secondary": "secondary",
  "--world-hud-accent": "accent",
};

const parseColor = (token: string, theme: WorldTheme): Rgba => {
  const variable = /^var\((--[\w-]+)\)$/.exec(token);
  if (variable) {
    const key = HUD_VARS[variable[1]];
    if (!key) throw new Error(`Unknown HUD variable ${variable[1]}`);
    return parseColor(theme.hud[key], theme);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(token);
  if (hex) {
    const value = hex[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(token);
  if (rgba) {
    return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: +rgba[4] };
  }
  throw new Error(`Unsupported colour "${token}"`);
};

type MixStop = { color: string; percent: number | null };

/** The `background: color-mix(in srgb, A p%, B q%)` of one exact selector. */
const mixRule = (selector: string): [MixStop, MixStop] => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`^${escaped} \\{[^}]*?background: color-mix\\(in srgb, (.+)\\);`, "m");
  const match = rule.exec(CSS);
  if (!match) throw new Error(`No color-mix background for ${selector} in App.css`);
  // Split on the top-level comma (rgba() has its own commas).
  let depth = 0;
  let split = -1;
  for (let i = 0; i < match[1].length; i += 1) {
    const char = match[1][i];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) split = i;
  }
  const stop = (part: string): MixStop => {
    const pct = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(part.trim());
    return pct
      ? { color: pct[1].trim(), percent: Number(pct[2]) / 100 }
      : { color: part.trim(), percent: null };
  };
  return [stop(match[1].slice(0, split)), stop(match[1].slice(split + 1))];
};

/** CSS Color 5 `color-mix(in srgb, …)` (premultiplied), then over `under`. */
const mixOver = ([first, second]: [MixStop, MixStop], theme: WorldTheme, under: Rgba): Rgba => {
  const p1 = first.percent ?? 1 - (second.percent ?? 0.5);
  const p2 = second.percent ?? 1 - p1;
  const total = p1 + p2;
  const [w1, w2] = [p1 / total, p2 / total];
  const c1 = parseColor(first.color, theme);
  const c2 = parseColor(second.color, theme);
  const alpha = w1 * c1.a + w2 * c2.a;
  const channel = (k: "r" | "g" | "b") => {
    const mixed = (w1 * c1.a * c1[k] + w2 * c2.a * c2[k]) / alpha;
    return alpha * mixed + (1 - alpha) * under[k];
  };
  return { r: channel("r"), g: channel("g"), b: channel("b"), a: 1 };
};

const luminance = ({ r, g, b }: Rgba) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

const contrast = (a: Rgba, b: Rgba) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Each chip and the HUD band it sits in (row 1 pill, row 2 meta, row 3). */
const CHIPS: { chip: string; band: string }[] = [
  { chip: ".world-badge", band: ".hud-meta" },
  { chip: ".level-badge", band: ".hud-meta" },
  { chip: ".style-badge", band: ".hud-secondary" },
  { chip: ".streak-badge.active", band: ".hud-secondary" },
  { chip: ".timer-badge", band: ".hud-primary" },
  { chip: ".lives-badge", band: ".hud-primary" },
];

const SEEDS = 200;

describe("HUD chip contrast (App.css × seeded world palettes)", () => {
  it.each(CHIPS)("$chip keeps its label at WCAG AA on every palette", ({ chip, band }) => {
    const chipMix = mixRule(chip);
    const bandMix = mixRule(band);
    let worst = { ratio: Infinity, id: "" };
    for (const mono of [false, true]) {
      for (const reducedFx of [false, true]) {
        for (let world = 1; world <= 10; world += 1) {
          for (let seed = 0; seed < SEEDS; seed += 1) {
            const theme = getWorldTheme(world, seed * 7919 + 13, reducedFx, mono);
            const page = parseColor(theme.background.base, theme);
            const bandColor = mixOver(bandMix, theme, page);
            const ratio = contrast(
              parseColor(theme.hud.text, theme),
              mixOver(chipMix, theme, bandColor),
            );
            if (ratio < worst.ratio) worst = { ratio, id: theme.id };
          }
        }
      }
    }
    expect(worst.ratio, `worst ${worst.ratio.toFixed(2)}:1 on theme ${worst.id}`).toBeGreaterThanOrEqual(AA);
  });
});
