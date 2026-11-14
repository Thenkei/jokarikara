import { describe, it, expect } from "vitest";
import {
  DEFAULT_IMPULSE_RESPONSE,
  generateImpulseResponse,
  unitEnergyGain,
  type ImpulseResponseOptions,
} from "./reverb";

const SR = 44100;
const options = (overrides: Partial<ImpulseResponseOptions> = {}): ImpulseResponseOptions => ({
  ...DEFAULT_IMPULSE_RESPONSE,
  sampleRate: SR,
  ...overrides,
});

const rms = (data: Float32Array, from: number, to: number): number => {
  let acc = 0;
  for (let i = from; i < to; i += 1) acc += data[i] * data[i];
  return Math.sqrt(acc / Math.max(1, to - from));
};

const correlation = (a: Float32Array, b: Float32Array): number => {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return ab / Math.sqrt(aa * bb);
};

describe("generateImpulseResponse", () => {
  const ir = generateImpulseResponse(options());

  it("has the requested length and channel count", () => {
    expect(ir).toHaveLength(2);
    ir.forEach((channel) => expect(channel.length).toBe(Math.round(1.5 * SR)));
    expect(DEFAULT_IMPULSE_RESPONSE.seconds).toBeGreaterThanOrEqual(1.2);
    expect(DEFAULT_IMPULSE_RESPONSE.seconds).toBeLessThanOrEqual(1.8);
  });

  it("contains only finite samples, peak-normalised to 1", () => {
    let peak = 0;
    let nonFinite = 0;
    for (const channel of ir) {
      for (const sample of channel) {
        if (!Number.isFinite(sample)) nonFinite += 1;
        peak = Math.max(peak, Math.abs(sample));
      }
    }
    expect(nonFinite).toBe(0);
    expect(peak).toBeCloseTo(1, 6);
  });

  it("stays silent during the pre-delay", () => {
    const preDelay = Math.round(DEFAULT_IMPULSE_RESPONSE.preDelaySeconds * SR);
    ir.forEach((channel) => {
      expect(channel.subarray(0, preDelay).every((sample) => sample === 0)).toBe(true);
      expect(rms(channel, preDelay, preDelay + 2048)).toBeGreaterThan(0);
    });
  });

  it("decays (roughly) monotonically to near silence", () => {
    const preDelay = Math.round(DEFAULT_IMPULSE_RESPONSE.preDelaySeconds * SR);
    const windows = 12;
    const span = Math.floor((ir[0].length - preDelay) / windows);
    for (const channel of ir) {
      const levels = Array.from({ length: windows }, (_, w) =>
        rms(channel, preDelay + w * span, preDelay + (w + 1) * span),
      );
      // Noise wobbles a little window to window, never upwards by much.
      for (let w = 1; w < windows; w += 1) {
        expect(levels[w]).toBeLessThanOrEqual(levels[w - 1] * 1.1);
      }
      // ≥ 50 dB down from the first window to the last.
      expect(levels[windows - 1]).toBeLessThan(levels[0] * 0.00316);
    }
  });

  it("damps highs faster than lows (the tail darkens)", () => {
    // Mean absolute first difference relative to RMS is a cheap brightness proxy.
    const brightness = (data: Float32Array, from: number, to: number) => {
      let diff = 0;
      for (let i = from + 1; i < to; i += 1) diff += Math.abs(data[i] - data[i - 1]);
      return diff / (to - from) / rms(data, from, to);
    };
    const [left] = ir;
    const early = brightness(left, Math.round(0.02 * SR), Math.round(0.2 * SR));
    const late = brightness(left, Math.round(1.1 * SR), Math.round(1.4 * SR));
    expect(late).toBeLessThan(early * 0.6);
  });

  it("is slightly decorrelated between channels for width", () => {
    const rho = correlation(ir[0], ir[1]);
    expect(rho).toBeGreaterThan(0.1);
    expect(rho).toBeLessThan(0.7);
  });

  it("is deterministic per seed", () => {
    const again = generateImpulseResponse(options());
    expect(again[0]).toEqual(ir[0]);
    expect(again[1]).toEqual(ir[1]);
    const other = generateImpulseResponse(options({ seed: 42 }));
    expect(other[0]).not.toEqual(ir[0]);
  });

  it("supports mono and other sample rates", () => {
    const mono = generateImpulseResponse(options({ channels: 1, sampleRate: 48000 }));
    expect(mono).toHaveLength(1);
    expect(mono[0].length).toBe(Math.round(1.5 * 48000));
    expect(mono[0].every((sample) => Number.isFinite(sample))).toBe(true);
  });

  it("rejects invalid options instead of producing NaN", () => {
    expect(() => generateImpulseResponse(options({ sampleRate: 0 }))).toThrow(RangeError);
    expect(() => generateImpulseResponse(options({ seconds: Number.NaN }))).toThrow(RangeError);
    expect(() => generateImpulseResponse(options({ channels: 0 }))).toThrow(RangeError);
    expect(() => generateImpulseResponse(options({ preDelaySeconds: 2 }))).toThrow(RangeError);
    expect(() => generateImpulseResponse(options({ stereoCorrelation: 1.5 }))).toThrow(
      RangeError,
    );
    expect(() => generateImpulseResponse(options({ darkHz: -1 }))).toThrow(RangeError);
  });
});

describe("unitEnergyGain", () => {
  it("scales the response to unit energy", () => {
    const ir = generateImpulseResponse(options());
    const gain = unitEnergyGain(ir);
    const energy =
      ir.reduce(
        (sum, channel) => sum + channel.reduce((acc, s) => acc + (s * gain) ** 2, 0),
        0,
      ) / ir.length;
    expect(energy).toBeCloseTo(1, 3);
    // A peak-normalised noise tail carries far more than unit energy.
    expect(gain).toBeLessThan(0.1);
  });

  it("is neutral on empty or silent input", () => {
    expect(unitEnergyGain([])).toBe(1);
    expect(unitEnergyGain([new Float32Array(16)])).toBe(1);
  });
});
