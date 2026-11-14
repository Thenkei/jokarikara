/**
 * Start screen easter eggs: pure input matchers (no DOM, no timers).
 *
 * Both are tiny state machines the caller keeps in a ref and feeds with
 * events, so they are trivially unit-testable and never re-render React.
 */

// ---------------------------------------------------------------------------
// Key sequence
// ---------------------------------------------------------------------------

/** ↑ ↑ ↓ ↓ ← → ← → toggles the session-only "Mono" look. */
export const MONO_SEQUENCE: readonly string[] = Object.freeze([
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
]);

/** The subset of `KeyboardEvent` the matcher reads. */
export interface SequenceKeyEvent {
  key: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface SequenceStep {
  /** Keys of the sequence matched so far (feed it back on the next key). */
  progress: number;
  /** True on the key that completes the sequence (progress is then 0). */
  matched: boolean;
}

/** Pressing or releasing these alone is not an attempt at the next key. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "NumLock",
  "ScrollLock",
  "Symbol",
  "SymbolLock",
]);

/** Legacy `event.key` values (old Edge/IE) for the arrows. */
const LEGACY_KEYS: Readonly<Record<string, string>> = {
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
};

const normalizeKey = (key: string): string => LEGACY_KEYS[key] ?? key;

/**
 * Longest prefix of `sequence` that is a suffix of the last `matched` keys
 * plus `key` (KMP-style fallback): ↑ ↑ ↑ ↓ … still matches, because the
 * extra ↑ keeps the last two ↑ as a valid start.
 */
const fallbackProgress = (
  sequence: readonly string[],
  matched: number,
  key: string,
): number => {
  const typed = [...sequence.slice(0, matched), key];
  for (let length = Math.min(typed.length, sequence.length - 1); length > 0; length -= 1) {
    let isPrefix = true;
    for (let i = 0; i < length; i += 1) {
      if (typed[typed.length - length + i] !== sequence[i]) {
        isPrefix = false;
        break;
      }
    }
    if (isPrefix) return length;
  }
  return 0;
};

/**
 * Advance the matcher by one keydown. Auto-repeat and lone modifier keys are
 * ignored (progress unchanged); a chord with Ctrl/Meta/Alt or any other wrong
 * key resets, keeping only what can still start the sequence.
 */
export const stepSequence = (
  sequence: readonly string[],
  progress: number,
  event: SequenceKeyEvent,
): SequenceStep => {
  if (sequence.length === 0) return { progress: 0, matched: false };
  const current = Math.min(Math.max(0, Math.floor(progress)), sequence.length - 1);
  if (event.repeat || MODIFIER_KEYS.has(event.key)) {
    return { progress: current, matched: false };
  }
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return { progress: 0, matched: false };
  }

  const key = normalizeKey(event.key);
  if (sequence[current] === key) {
    const next = current + 1;
    return next === sequence.length
      ? { progress: 0, matched: true }
      : { progress: next, matched: false };
  }
  return { progress: fallbackProgress(sequence, current, key), matched: false };
};

// ---------------------------------------------------------------------------
// Rapid taps
// ---------------------------------------------------------------------------

/** Taps on the title that trigger the backdrop flourish... */
export const TITLE_TAP_COUNT = 7;
/** ...when they all land within this window. */
export const TITLE_TAP_WINDOW_MS = 3000;

export interface TapStep {
  /** Recent tap times (ms), oldest first; feed it back on the next tap. */
  taps: readonly number[];
  /** True on the tap that completes the burst (taps are then cleared). */
  triggered: boolean;
}

/**
 * Record one tap at `now` (any monotonic ms clock). Taps older than the
 * window are dropped, so the burst is "N taps within W ms", not "N taps
 * ever". A clock going backwards (should not happen) starts over.
 */
export const registerTap = (
  taps: readonly number[],
  now: number,
  count: number = TITLE_TAP_COUNT,
  windowMs: number = TITLE_TAP_WINDOW_MS,
): TapStep => {
  const recent = taps.filter((t) => t <= now && now - t < windowMs);
  const next = [...recent, now].slice(-count);
  if (next.length >= count) return { taps: [], triggered: true };
  return { taps: next, triggered: false };
};
