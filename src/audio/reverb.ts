import { nextRngState, seedRng } from "../utils/random";

/**
 * Procedural room impulse response for the reverb send bus.
 *
 * Pure and deterministic (seeded xorshift32): the same options always yield
 * the same samples, so the "room" is identical on every device and session,
 * and the shape is unit-testable without Web Audio.
 *
 * Model (a cheap stand-in for a real room, Schroeder/Moorer-style):
 *   - silence for `preDelaySeconds` (keeps the dry transient clear),
 *   - white noise under an exponential envelope that falls 60 dB over the
 *     remaining length (an RT60 equal to the tail length),
 *   - a one-pole low-pass whose cutoff glides from `brightHz` to `darkHz`, so
 *     highs decay faster than lows like air and soft walls absorb them,
 *   - L/R built from a shared and a per-channel noise stream mixed to a target
 *     correlation: wide, but not so decorrelated that it sounds hollow.
 * The result is peak-normalised to 1; use `unitEnergyGain` to calibrate the
 * return level so send amounts read as "tail energy relative to the dry".
 */

export interface ImpulseResponseOptions {
  sampleRate: number;
  /** Total length, pre-delay included. */
  seconds: number;
  channels: number;
  seed: number;
  /** Leading silence before the first reflection. */
  preDelaySeconds: number;
  /** Damping low-pass cutoff at the start of the tail. */
  brightHz: number;
  /** Damping low-pass cutoff at the end of the tail (darker). */
  darkHz: number;
  /** Target Pearson correlation between channels, 0 (wide) … 1 (mono). */
  stereoCorrelation: number;
}

/** A small, soft room: present on hits, never washy on fast play. */
export const DEFAULT_IMPULSE_RESPONSE: Omit<ImpulseResponseOptions, "sampleRate"> = {
  seconds: 1.5,
  channels: 2,
  seed: 0x5eed,
  preDelaySeconds: 0.012,
  brightHz: 7000,
  darkHz: 1200,
  stereoCorrelation: 0.35,
};

/** Envelope fall over the tail: -60 dB, the usual RT60 definition. */
const TAIL_DECAY_DB = 60;
/** Short fade-in on the first reflection so the onset never clicks. */
const ONSET_FADE_SECONDS = 0.004;
/** Extra seed offset per channel so each gets an independent stream. */
const CHANNEL_SEED_STRIDE = 0x85ebca6b;

const assertOptions = (o: ImpulseResponseOptions): void => {
  const positive = (value: number, name: string) => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`impulse response: ${name} must be > 0 (got ${value})`);
    }
  };
  positive(o.sampleRate, "sampleRate");
  positive(o.seconds, "seconds");
  positive(o.brightHz, "brightHz");
  positive(o.darkHz, "darkHz");
  if (!Number.isInteger(o.channels) || o.channels < 1) {
    throw new RangeError(`impulse response: channels must be an integer >= 1 (got ${o.channels})`);
  }
  if (
    !Number.isFinite(o.preDelaySeconds) ||
    o.preDelaySeconds < 0 ||
    o.preDelaySeconds >= o.seconds
  ) {
    throw new RangeError(
      `impulse response: preDelaySeconds must be in [0, seconds) (got ${o.preDelaySeconds})`,
    );
  }
  if (!(o.stereoCorrelation >= 0 && o.stereoCorrelation <= 1)) {
    throw new RangeError(
      `impulse response: stereoCorrelation must be in [0, 1] (got ${o.stereoCorrelation})`,
    );
  }
  if (!Number.isFinite(o.seed)) {
    throw new RangeError(`impulse response: seed must be finite (got ${o.seed})`);
  }
};

/** Samples between damping-coefficient updates (the glide is slow). */
const CUTOFF_UPDATE_SAMPLES = 64;

/**
 * Uniform noise source in [-1, 1). Steps xorshift32 directly (no per-sample
 * allocation): this runs ~200k times on the first sound of a session.
 */
const makeNoise = (seed: number): (() => number) => {
  let state = seedRng(seed);
  // Warm up: xorshift streams from nearby seeds are correlated at first.
  for (let i = 0; i < 16; i += 1) state = nextRngState(state);
  return () => {
    state = nextRngState(state);
    return (state / 4294967296) * 2 - 1;
  };
};

/**
 * Build the impulse response, one Float32Array per channel, peak-normalised
 * to 1 across all channels. Throws `RangeError` on invalid options.
 */
export const generateImpulseResponse = (
  options: ImpulseResponseOptions,
): Float32Array[] => {
  assertOptions(options);
  const {
    sampleRate,
    seconds,
    channels,
    seed,
    preDelaySeconds,
    brightHz,
    darkHz,
    stereoCorrelation,
  } = options;

  const length = Math.max(1, Math.round(seconds * sampleRate));
  const preDelay = Math.min(length - 1, Math.round(preDelaySeconds * sampleRate));
  const tailLength = length - preDelay;
  const tailSeconds = tailLength / sampleRate;
  const decayPerSecond = (TAIL_DECAY_DB / 20) * Math.LN10 / tailSeconds;
  const onsetSamples = Math.max(1, Math.round(ONSET_FADE_SECONDS * sampleRate));
  // Cutoff never above Nyquist-ish, where the one-pole coefficient saturates.
  const nyquistSafe = sampleRate * 0.45;
  const fromHz = Math.min(brightHz, nyquistSafe);
  const toHz = Math.min(darkHz, nyquistSafe);

  // Mono has nothing to decorrelate: the shared stream is the signal.
  const sharedWeight = channels === 1 ? 1 : Math.sqrt(stereoCorrelation);
  const ownWeight = channels === 1 ? 0 : Math.sqrt(1 - stereoCorrelation);

  const shared = makeNoise(seed);
  const own = Array.from({ length: channels }, (_, ch) =>
    makeNoise(seed + (ch + 1) * CHANNEL_SEED_STRIDE),
  );
  const out = Array.from({ length: channels }, () => new Float32Array(length));
  const lowpassState = new Float64Array(channels);

  // Exponential decay as a per-sample multiplier (exact, no exp per sample).
  const decayStep = Math.exp(-decayPerSecond / sampleRate);
  let decay = 1;
  let coefficient = 0;
  let peak = 0;
  for (let i = preDelay; i < length; i += 1) {
    const n = i - preDelay;
    if (n % CUTOFF_UPDATE_SAMPLES === 0) {
      const progress = tailLength > 1 ? n / (tailLength - 1) : 0;
      // Geometric glide: perceptually even darkening over the tail.
      const cutoff = fromHz * Math.pow(toHz / fromHz, progress);
      coefficient = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    }
    const envelope = decay * Math.min(1, (n + 1) / onsetSamples);
    decay *= decayStep;
    const common = shared();

    for (let ch = 0; ch < channels; ch += 1) {
      const raw = sharedWeight * common + ownWeight * own[ch]();
      lowpassState[ch] += coefficient * (raw - lowpassState[ch]);
      const sample = lowpassState[ch] * envelope;
      out[ch][i] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  }

  if (peak > 0) {
    const scale = 1 / peak;
    for (const channel of out) {
      for (let i = 0; i < channel.length; i += 1) channel[i] *= scale;
    }
  }
  return out;
};

/**
 * Linear gain that brings the response to unit energy (mean over channels).
 * Applied on the return, it makes a send of X dB produce a tail whose energy
 * sits roughly X dB under the dry signal's, independent of IR length.
 */
export const unitEnergyGain = (channels: readonly Float32Array[]): number => {
  if (channels.length === 0) return 1;
  let energy = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) energy += channel[i] * channel[i];
  }
  energy /= channels.length;
  return energy > 0 && Number.isFinite(energy) ? 1 / Math.sqrt(energy) : 1;
};
