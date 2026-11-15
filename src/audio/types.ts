import type { StackQuality } from "../types";
import type { Medal } from "../modes/medals";

export type UiSoundKind = "select" | "confirm" | "back";

/**
 * What a voice does in a sound, so a world palette can reshape it: the
 * `lead` takes the palette's waveform, the `body` (sub-octave) its weight.
 * Unmarked voices (harmony, sparkle, pads) keep their own waveform.
 */
export type VoiceRole = "lead" | "body";

/** One oscillator with an attack/decay envelope, as scheduled by `play()`. */
export interface Voice {
  freq: number;
  type?: OscillatorType;
  /** Seconds from now. */
  delay?: number;
  duration: number;
  peak: number;
  /** Seconds to reach `peak` (default `DEFAULT_ATTACK_SECONDS`). */
  attack?: number;
  /** Target frequency at the end of the note (glide). */
  glideTo?: number;
  /** Cents. */
  detune?: number;
  role?: VoiceRole;
}

/**
 * Soundtrack layers: 0 = drone only, 1 = + bass pulse, 2 = + arpeggio.
 */
export type MusicIntensity = 0 | 1 | 2;

/** Snapshot of the soundtrack, for UI, diagnostics and tests. */
export interface MusicState {
  /** A run requested music (between startMusic and stopMusic). */
  active: boolean;
  /** Paused with the game (overlay / auto-pause). */
  paused: boolean;
  /** Player preference (independent from the global mute). */
  enabled: boolean;
  /** Audio nodes and scheduler are live right now. */
  playing: boolean;
  intensity: MusicIntensity;
  world: number;
  /**
   * Time Attack clock tension, 0 (calm) .. 1 (last second); always 0 in
   * other modes (see `getMusicTension`).
   */
  tension: number;
}

/**
 * Audio service interface for Dependency Inversion Principle.
 * Allows mocking in tests and swapping implementations.
 */
export interface IAudioService {
  /**
   * Initialize the audio context. Outside a user gesture it is created
   * suspended (autoplay policy) and the first gesture's sound resumes it.
   */
  init(): void;

  /**
   * Start screen warm-up, called when the page is idle: builds the context
   * (suspended until a gesture) and, idle too, the reverb, so the first tap
   * only resumes. No-op while muted (mute = no allocation) or once built.
   */
  prewarm(): void;

  /**
   * Legacy pitched blip; kept for UI feedback (restart/undo in Zen).
   * @param score - Value used to vary the pitch.
   */
  playStackSound(score: number): void;

  /**
   * Musical note for a successful stack: pitch follows the combo streak in
   * the current world's key, harmony richness follows the stack quality.
   */
  playStack(quality: StackQuality, streak: number, world: number): void;

  /** Ascending arpeggio on level up. */
  playLevelUp(world: number): void;

  /** Sustained chord on entering a new world. */
  playWorldUp(world: number): void;

  /** Achievement unlocked (toast): a rising two-strike bell in the world's key. */
  playAchievement(world: number): void;

  /** Run-ending failure sound. */
  playFailSound(): void;

  /** Softer, non-terminal miss (Zen life lost). */
  playMissSound(): void;

  /** Too-early tap feedback in Zen mode. */
  playEarlyClickSound(): void;

  /**
   * Countdown tick: the final seconds of Time Attack, and (`soft`, a few dB
   * quieter) the resume countdown after a pause (`urgent` = its "go").
   */
  playTick(urgent: boolean, soft?: boolean): void;

  /** Bonus time gained in Time Attack. */
  playTimeBonus(): void;

  /** Heartbeat worlds: a soft thump on each beat of the growth pulse. */
  playHeartbeat(): void;

  /**
   * Optional timing cue: a soft tick while the shape approaches the PERFECT
   * band (`step` raises the pitch slightly), a brighter one inside it.
   */
  playCue(step: number, inWindow: boolean): void;

  /** Short menu feedback: move/toggle, confirm/start, back/leave. */
  playUi(kind: UiSoundKind): void;

  /** Combo milestone fanfare; `tier` 1..5 lengthens the run of notes. */
  playComboMilestone(tier: number, world: number): void;

  /** Start screen secret found: a short sparkling bell cascade. */
  playChime(): void;

  /**
   * Personal best beaten mid-run: a short "ta-da" in the world's key (a
   * pickup note, then a held bright chord with a bell partial). Starts a
   * beat after the stack note it plays over, so both read.
   */
  playRecord(world: number): void;

  /**
   * Time Attack clock ran out (the mode's normal ending, never the fail
   * buzz): a bright bell strike, then a cadence in the world's key that
   * resolves by result, neutral without a medal and richer per medal
   * (`medal`: the run's final one, null for none). See `TIME_UP_CADENCE`.
   */
  playTimeUp(world: number, medal: Medal | null): void;

  setMuted(muted: boolean): void;
  isMuted(): boolean;

  /**
   * Resume the audio context if suspended (required by browsers; call it from
   * a user gesture). Sounds and music also resume an idle-suspended context
   * by themselves before scheduling.
   */
  resume(): void;

  /**
   * State of the underlying context (`null` before it exists). The service
   * suspends it once nothing is audible (see audio/idle.ts); diagnostics/E2E.
   */
  getContextState(): AudioContextState | null;

  /**
   * Start the ambient soundtrack for a new run (drone only, in the world's
   * key). Idempotent: an already playing bed is re-targeted, not restarted.
   */
  startMusic(world: number): void;

  /** Fade rhythmic layers in/out to match the player's momentum. */
  setMusicIntensity(level: MusicIntensity): void;

  /**
   * Time Attack tension (0..1) from the clock: the bed tightens (filter,
   * tremolo, pedal, forced pulse) and eases back out when it drops. Call it
   * when the quantised value changes, not per frame (deduplicated anyway).
   */
  setMusicTension(tension: number): void;

  /** Crossfade the drone (and layer notes) to the new world's key. */
  setMusicWorld(world: number): void;

  /** Fade out and release all music nodes/timers; resumeMusic rebuilds. */
  pauseMusic(): void;
  resumeMusic(): void;

  /** End of run: fade out and release every music node and timer. */
  stopMusic(): void;

  /** Player preference for background music (SFX unaffected). */
  setMusicEnabled(enabled: boolean): void;
  isMusicEnabled(): boolean;

  getMusicState(): MusicState;
}
