import { dbToGain } from "./mix";
import { semitonesToRatio } from "./music";
import type { Voice } from "./types";

/**
 * Per-world sound palettes for gameplay feedback (stack, level up, world up).
 *
 * The key already moves with the world (`music.ts`); the palette moves the
 * timbre so each world's mechanic is also *heard*. Pure data plus pure voice
 * transforms: `audioManager` builds its usual voices, passes them through
 * `shapeVoices`, and routes them through the (optional) `paletteFx` chain.
 *
 * World 1 is the neutral palette: shaping is the identity and there is no fx
 * chain, so it renders exactly as before palettes existed (the mix baseline).
 * Every other world keeps its loudest-300 ms RMS within ±2 dB of world 1
 * through `gainDb`, tuned on offline renders by `tests/audio-levels.spec.ts`.
 */

/** Envelope attack used when a voice does not set its own. */
export const DEFAULT_ATTACK_SECONDS = 0.008;

/** Low-frequency oscillator: rate in Hz, depth in the modulated unit. */
export interface Lfo {
  readonly rateHz: number;
  readonly depth: number;
}

export interface WorldPalette {
  /** Short description, for docs and the PR table. */
  readonly character: string;
  /** Waveform of `lead` voices (the stack note, the level-up arpeggio). */
  readonly lead: OscillatorType;
  /** Trim on every voice (dB): keeps each world's loudness on world 1's. */
  readonly gainDb: number;
  /** Extra trim on `body` voices (dB): weight of the sub-octave. */
  readonly bodyDb: number;
  /** Multiplier on each voice's attack (ignored when `swell` > 0). */
  readonly attackScale: number;
  /**
   * "Reversed" envelope: the attack takes this fraction of the note (0 =
   * off), so it swells in and cuts off instead of striking and fading.
   * Applies to unmarked voices only (the lead/body strike stays instant) and
   * is energy-matched to the struck envelope, so it reshapes, never boosts.
   */
  readonly swell: number;
  /** Multiplier on every voice's duration (and so its decay). */
  readonly durationScale: number;
  /** Lowpass cutoff over the whole sound (Hz), `null` = unfiltered. */
  readonly lowpassHz: number | null;
  /** Chorus: alternate voices detuned by ±this many cents. */
  readonly chorusCents: number;
  /** Pitch glide over each voice (semitones, negative = down). */
  readonly glideSemitones: number;
  /** Pitch vibrato, depth in cents. */
  readonly vibrato: Lfo | null;
  /** Amplitude tremolo, depth as a fraction of the gain (0..1). */
  readonly tremolo: Lfo | null;
  /** Harmony intervals inverted (fifths become fourths), arpeggios run down. */
  readonly mirror: boolean;
}

/** Signal-chain effects that cannot be expressed per voice. */
export interface VoiceFx {
  readonly lowpassHz: number | null;
  readonly vibrato: Lfo | null;
  readonly tremolo: Lfo | null;
}

/** Safe ranges, enforced by the palette unit tests. */
export const PALETTE_LIMITS = {
  gainDb: [-6, 6],
  bodyDb: [0, 8],
  attackScale: [0.25, 4],
  swell: [0, 0.6],
  durationScale: [0.6, 1.5],
  lowpassHz: [600, 8000],
  chorusCents: [0, 15],
  glideSemitones: [-2, 2],
  vibratoRateHz: [0.5, 8],
  vibratoDepthCents: [0, 25],
  tremoloRateHz: [0.5, 8],
  tremoloDepth: [0, 0.5],
} as const;

const NEUTRAL: WorldPalette = {
  character: "Origin: clean triangle bell (baseline)",
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
};

/**
 * Index 0 = world 1. Worlds beyond the last reuse it (as gameplay does).
 *
 * Tuning notes (offline renders through the real bus): the 300 ms loudness
 * barely follows peak level. The glue compressor flattens the 8 ms strike
 * and its makeup gain lifts the tail, so it is the *envelope* that moves
 * loudness: longer attacks and decays, or a darker filter, read louder; an
 * unbalanced swell added up to +12 dB. Hence the strike never swells, the
 * swell is energy-matched, tremolo only dips, and `gainDb` absorbs the rest.
 */
export const WORLD_PALETTES: readonly WorldPalette[] = [
  NEUTRAL,
  {
    ...NEUTRAL,
    // ~1 s per breath: a stack note inhales, the world-up chord breathes once.
    character: "Breathing: slow 1 Hz breath (tremolo) on every voice",
    tremolo: { rateHz: 1, depth: 0.5 },
    gainDb: 0.8,
  },
  {
    ...NEUTRAL,
    character: "Accelerating: bright filtered saw, snappy and short",
    lead: "sawtooth",
    attackScale: 0.5,
    durationScale: 0.85,
    lowpassHz: 3200,
    gainDb: 2,
  },
  {
    ...NEUTRAL,
    character: "Wave: gentle 5 Hz vibrato, a little more sustain",
    durationScale: 1.15,
    vibrato: { rateHz: 5, depth: 14 },
    gainDb: -0.5,
  },
  {
    ...NEUTRAL,
    character: "Color shift: chorus shimmer between voices",
    durationScale: 1.1,
    chorusCents: 9,
    gainDb: 0,
  },
  {
    ...NEUTRAL,
    character: "Eclipse: dark lowpass, softer and longer",
    attackScale: 1.25,
    durationScale: 1.25,
    lowpassHz: 1000,
    bodyDb: 1,
    gainDb: -2,
  },
  {
    ...NEUTRAL,
    character: "Gravity: notes sag a semitone, heavier and firmer",
    glideSemitones: -1,
    attackScale: 0.7,
    bodyDb: 1,
    lowpassHz: 2200,
    gainDb: -0.5,
  },
  {
    ...NEUTRAL,
    character: "Rotation inversion: inverted intervals, falling arpeggio, hollow tone",
    lead: "square",
    attackScale: 0.5,
    lowpassHz: 1200,
    mirror: true,
    gainDb: -2.75,
  },
  {
    ...NEUTRAL,
    character: "Reverse: the strike stays, harmony and pads swell in and cut off",
    swell: 0.4,
    durationScale: 1.1,
    gainDb: 0.25,
  },
  {
    ...NEUTRAL,
    character: "Heartbeat: punchy attack, short, low body",
    attackScale: 0.5,
    durationScale: 0.8,
    bodyDb: 5,
    lowpassHz: 2400,
    gainDb: 0.5,
  },
];

/** Palette for a world; out-of-range or invalid worlds clamp to 1..10. */
export const getWorldPalette = (world: number): WorldPalette => {
  if (Number.isNaN(world)) return WORLD_PALETTES[0];
  const clamped = Math.min(Math.max(Math.floor(world), 1), WORLD_PALETTES.length);
  return WORLD_PALETTES[clamped - 1];
};

/** The signal-chain part of a palette, or `null` when it needs none. */
export const paletteFx = (palette: WorldPalette): VoiceFx | null =>
  palette.lowpassHz === null && palette.vibrato === null && palette.tremolo === null
    ? null
    : { lowpassHz: palette.lowpassHz, vibrato: palette.vibrato, tremolo: palette.tremolo };

/**
 * Musical interval inversion, keeping compound octaves: a fifth (7) becomes a
 * fourth (5), a twelfth (19) an eleventh (17); octaves and unisons stay.
 */
export const invertInterval = (semitones: number): number => {
  const remainder = ((semitones % 12) + 12) % 12;
  if (remainder === 0) return semitones;
  return semitones - remainder + (12 - remainder);
};

/** Harmony intervals for a palette (inverted in a mirrored world). */
export const paletteHarmony = (
  intervals: readonly number[],
  palette: WorldPalette,
): readonly number[] => (palette.mirror ? intervals.map(invertInterval) : intervals);

/** Onset order of the i-th of `count` notes: reversed in a mirrored world. */
export const paletteOrder = (index: number, count: number, palette: WorldPalette): number =>
  palette.mirror ? count - 1 - index : index;

/** Decay depth of `play()`'s envelope: peak down to 1e-4 (-80 dB). */
const DECAY_NEPERS = Math.log(1e4);

/**
 * Energy (per unit peak²) of `play()`'s envelope: a linear rise over `attack`
 * (∫(t/A)² = A/3), then an exponential fall to -80 dB over the rest
 * (∫e^(-2t/τ) ≈ τ/2 with τ = D / ln 1e4).
 */
export const envelopeEnergy = (attack: number, duration: number): number => {
  const rise = Math.min(Math.max(attack, 0), duration);
  return rise / 3 + (duration - rise) / (2 * DECAY_NEPERS);
};

/**
 * Apply a palette's per-voice parameters. Pure; only fields the palette
 * actually changes are written, so the neutral palette returns voices equal
 * to its input (world 1 stays bit-for-bit what it was).
 */
export const shapeVoices = (voices: readonly Voice[], palette: WorldPalette): Voice[] => {
  const gain = dbToGain(palette.gainDb);
  const bodyGain = dbToGain(palette.bodyDb);
  const glide = semitonesToRatio(palette.glideSemitones);
  return voices.map((voice, i) => {
    const shaped: Voice = { ...voice };
    if (voice.role === "lead") shaped.type = palette.lead;
    if (palette.durationScale !== 1) shaped.duration = voice.duration * palette.durationScale;
    let peak = voice.peak;
    // The strike (lead + body) never swells: tap feedback must stay instant.
    if (palette.swell > 0 && voice.role === undefined) {
      const struck = voice.attack ?? DEFAULT_ATTACK_SECONDS;
      shaped.attack = shaped.duration * palette.swell;
      // Same energy as the struck envelope: a swell reshapes, never boosts
      // (else richer qualities, which carry more swelled voices, jump ahead).
      peak *= Math.sqrt(
        envelopeEnergy(struck, shaped.duration) / envelopeEnergy(shaped.attack, shaped.duration),
      );
    } else if (palette.attackScale !== 1) {
      shaped.attack = (voice.attack ?? DEFAULT_ATTACK_SECONDS) * palette.attackScale;
    }
    if (palette.gainDb !== 0) peak *= gain;
    if (palette.bodyDb !== 0 && voice.role === "body") peak *= bodyGain;
    if (peak !== voice.peak) shaped.peak = peak;
    if (palette.glideSemitones !== 0) {
      shaped.glideTo = (voice.glideTo ?? voice.freq) * glide;
    }
    if (palette.chorusCents !== 0) {
      const sign = i % 2 === 0 ? 1 : -1;
      shaped.detune = (voice.detune ?? 0) + sign * palette.chorusCents;
    }
    return shaped;
  });
};
