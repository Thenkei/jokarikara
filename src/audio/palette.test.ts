import { describe, it, expect } from "vitest";
import {
  DEFAULT_ATTACK_SECONDS,
  envelopeEnergy,
  getWorldPalette,
  invertInterval,
  PALETTE_LIMITS,
  paletteFx,
  paletteHarmony,
  paletteOrder,
  shapeVoices,
  WORLD_PALETTES,
  type WorldPalette,
} from "./palette";
import { dbToGain } from "./mix";
import { QUALITY_HARMONY, semitonesToRatio } from "./music";
import type { Voice } from "./types";

const WORLDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** A stack-like sound: lead strike, sub-octave body, harmony, sparkle. */
const stackVoices: readonly Voice[] = [
  { freq: 220, type: "triangle", duration: 0.32, peak: 0.42, role: "lead" },
  { freq: 110, type: "sine", duration: 0.22, peak: 0.18, role: "body" },
  { freq: 330, type: "sine", delay: 0.03, duration: 0.45, peak: 0.07 },
  { freq: 880, type: "sine", delay: 0.06, duration: 0.6, peak: 0.045, detune: 7 },
];

const inRange = (value: number, [min, max]: readonly [number, number]) => {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
};

describe("world sound palettes", () => {
  it("defines a distinct palette for every world 1..10", () => {
    expect(WORLD_PALETTES).toHaveLength(10);
    const palettes = WORLDS.map(getWorldPalette);
    palettes.forEach((palette) => expect(palette.character).toMatch(/\w+: /));
    // Every world must actually sound different from every other one.
    const fingerprints = palettes.map((palette) =>
      JSON.stringify({ ...palette, character: undefined }),
    );
    expect(new Set(fingerprints).size).toBe(10);
  });

  it("keeps every parameter in a safe range", () => {
    for (const palette of WORLD_PALETTES) {
      expect(["sine", "triangle", "square", "sawtooth"]).toContain(palette.lead);
      inRange(palette.gainDb, PALETTE_LIMITS.gainDb);
      inRange(palette.bodyDb, PALETTE_LIMITS.bodyDb);
      inRange(palette.attackScale, PALETTE_LIMITS.attackScale);
      inRange(palette.swell, PALETTE_LIMITS.swell);
      inRange(palette.durationScale, PALETTE_LIMITS.durationScale);
      inRange(palette.chorusCents, PALETTE_LIMITS.chorusCents);
      inRange(palette.glideSemitones, PALETTE_LIMITS.glideSemitones);
      if (palette.lowpassHz !== null) inRange(palette.lowpassHz, PALETTE_LIMITS.lowpassHz);
      if (palette.vibrato) {
        inRange(palette.vibrato.rateHz, PALETTE_LIMITS.vibratoRateHz);
        inRange(palette.vibrato.depth, PALETTE_LIMITS.vibratoDepthCents);
      }
      if (palette.tremolo) {
        inRange(palette.tremolo.rateHz, PALETTE_LIMITS.tremoloRateHz);
        inRange(palette.tremolo.depth, PALETTE_LIMITS.tremoloDepth);
      }
    }
  });

  it("keeps world 1 exactly as before palettes (regression baseline)", () => {
    const origin = getWorldPalette(1);
    expect(origin).toMatchObject({
      lead: "triangle",
      gainDb: 0,
      bodyDb: 0,
      attackScale: 1,
      swell: 0,
      durationScale: 1,
      lowpassHz: null,
      chorusCents: 0,
      glideSemitones: 0,
      vibrato: null,
      tremolo: null,
      mirror: false,
    });
    expect(shapeVoices(stackVoices, origin)).toEqual(stackVoices);
    expect(paletteFx(origin)).toBeNull();
    expect(paletteHarmony(QUALITY_HARMONY.PERFECT, origin)).toEqual(QUALITY_HARMONY.PERFECT);
    expect([0, 1, 2, 3].map((i) => paletteOrder(i, 4, origin))).toEqual([0, 1, 2, 3]);
  });

  it("clamps out-of-range and invalid worlds", () => {
    expect(getWorldPalette(0)).toBe(getWorldPalette(1));
    expect(getWorldPalette(-3)).toBe(getWorldPalette(1));
    expect(getWorldPalette(Number.NaN)).toBe(getWorldPalette(1));
    expect(getWorldPalette(11)).toBe(getWorldPalette(10));
    expect(getWorldPalette(Number.POSITIVE_INFINITY)).toBe(getWorldPalette(10));
    expect(getWorldPalette(Number.NEGATIVE_INFINITY)).toBe(getWorldPalette(1));
    expect(getWorldPalette(4.7)).toBe(getWorldPalette(4));
  });

  it("does not mutate the input voices", () => {
    const voices = stackVoices.map((v) => ({ ...v }));
    for (const world of WORLDS) shapeVoices(voices, getWorldPalette(world));
    expect(voices).toEqual(stackVoices);
  });

  it("gives the lead the palette waveform and leaves other voices alone", () => {
    const shaped = shapeVoices(stackVoices, getWorldPalette(3));
    expect(shaped[0].type).toBe("sawtooth");
    expect(shaped.slice(1).map((v) => v.type)).toEqual(["sine", "sine", "sine"]);
  });

  it("applies gain, body weight and envelope scaling", () => {
    const heartbeat = getWorldPalette(10);
    const [lead, body] = shapeVoices(stackVoices, heartbeat);
    expect(lead.peak).toBeCloseTo(0.42 * dbToGain(heartbeat.gainDb), 10);
    expect(body.peak).toBeCloseTo(
      0.18 * dbToGain(heartbeat.gainDb) * dbToGain(heartbeat.bodyDb),
      10,
    );
    expect(lead.attack).toBeCloseTo(DEFAULT_ATTACK_SECONDS * heartbeat.attackScale, 10);
    expect(lead.duration).toBeCloseTo(0.32 * heartbeat.durationScale, 10);
  });

  it("glides every voice down in the gravity world", () => {
    const gravity = getWorldPalette(7);
    expect(gravity.glideSemitones).toBeLessThan(0);
    for (const [shaped, source] of shapeVoices(stackVoices, gravity).map(
      (v, i) => [v, stackVoices[i]] as const,
    )) {
      expect(shaped.glideTo).toBeCloseTo(source.freq * semitonesToRatio(gravity.glideSemitones), 6);
    }
  });

  it("detunes alternate voices for the chorus shimmer", () => {
    const shift = getWorldPalette(5);
    const detunes = shapeVoices(stackVoices, shift).map((v) => v.detune);
    expect(detunes).toEqual([
      shift.chorusCents,
      -shift.chorusCents,
      shift.chorusCents,
      7 - shift.chorusCents,
    ]);
  });

  it("swells only the unmarked voices, with their energy preserved", () => {
    const reverse = getWorldPalette(9);
    expect(reverse.swell).toBeGreaterThan(0);
    const shaped = shapeVoices(stackVoices, reverse);
    // The strike stays instant.
    expect(shaped[0].attack).toBeUndefined();
    expect(shaped[1].attack).toBeUndefined();
    for (const i of [2, 3]) {
      const voice = shaped[i];
      expect(voice.attack).toBeCloseTo(voice.duration * reverse.swell, 10);
      const struck =
        envelopeEnergy(DEFAULT_ATTACK_SECONDS, voice.duration) *
        (stackVoices[i].peak * dbToGain(reverse.gainDb)) ** 2;
      const swelled = envelopeEnergy(voice.attack!, voice.duration) * voice.peak ** 2;
      expect(swelled).toBeCloseTo(struck, 12);
      expect(voice.peak).toBeLessThan(stackVoices[i].peak);
    }
  });

  it("models the envelope energy of a linear rise and an 80 dB fall", () => {
    expect(envelopeEnergy(0, 1)).toBeCloseTo(1 / (2 * Math.log(1e4)), 12);
    expect(envelopeEnergy(1, 1)).toBeCloseTo(1 / 3, 12);
    // A longer attack carries more energy; attack is clamped to the note.
    expect(envelopeEnergy(0.2, 0.5)).toBeGreaterThan(envelopeEnergy(0.01, 0.5));
    expect(envelopeEnergy(2, 1)).toBe(envelopeEnergy(1, 1));
  });

  it("inverts intervals musically in the mirrored world", () => {
    expect(invertInterval(7)).toBe(5); // fifth -> fourth
    expect(invertInterval(4)).toBe(8); // major third -> minor sixth
    expect(invertInterval(12)).toBe(12); // octave stays
    expect(invertInterval(19)).toBe(17); // twelfth -> eleventh
    expect(invertInterval(0)).toBe(0);
    const mirror = getWorldPalette(8);
    expect(mirror.mirror).toBe(true);
    expect(paletteHarmony(QUALITY_HARMONY.PERFECT, mirror)).toEqual([5, 12, 17]);
    // Same number of voices: the quality hierarchy is unchanged.
    expect(paletteHarmony(QUALITY_HARMONY.OK, mirror)).toEqual([]);
    expect([0, 1, 2, 3].map((i) => paletteOrder(i, 4, mirror))).toEqual([3, 2, 1, 0]);
  });

  it("exposes a signal chain only for worlds that need one", () => {
    const withFx = WORLDS.filter((w) => paletteFx(getWorldPalette(w)) !== null);
    for (const world of withFx) {
      const p: WorldPalette = getWorldPalette(world);
      expect(p.lowpassHz !== null || p.vibrato !== null || p.tremolo !== null).toBe(true);
    }
    expect(paletteFx(getWorldPalette(2))?.tremolo).not.toBeNull();
    expect(paletteFx(getWorldPalette(4))?.vibrato).not.toBeNull();
    expect(paletteFx(getWorldPalette(6))?.lowpassHz).toBeLessThan(
      paletteFx(getWorldPalette(3))!.lowpassHz!,
    );
    expect(paletteFx(getWorldPalette(5))).toBeNull();
    expect(paletteFx(getWorldPalette(9))).toBeNull();
  });
});
