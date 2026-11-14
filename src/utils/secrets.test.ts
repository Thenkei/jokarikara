import { describe, expect, it } from "vitest";
import {
  MONO_SEQUENCE,
  registerTap,
  stepSequence,
  TITLE_TAP_COUNT,
  TITLE_TAP_WINDOW_MS,
  type SequenceKeyEvent,
} from "./secrets";

/** Feeds keys in order; returns the final progress and how many matches. */
const feed = (events: readonly (string | SequenceKeyEvent)[], start = 0) => {
  let progress = start;
  let matches = 0;
  for (const raw of events) {
    const event = typeof raw === "string" ? { key: raw } : raw;
    const step = stepSequence(MONO_SEQUENCE, progress, event);
    progress = step.progress;
    if (step.matched) matches += 1;
  }
  return { progress, matches };
};

describe("stepSequence", () => {
  it("matches the full arrow sequence once, then starts over", () => {
    expect(feed(MONO_SEQUENCE)).toEqual({ progress: 0, matches: 1 });
    expect(feed([...MONO_SEQUENCE, ...MONO_SEQUENCE])).toEqual({ progress: 0, matches: 2 });
  });

  it("reports progress without matching on a partial sequence", () => {
    expect(feed(MONO_SEQUENCE.slice(0, 5))).toEqual({ progress: 5, matches: 0 });
  });

  it("resets on a wrong key", () => {
    expect(feed(["ArrowUp", "ArrowUp", "ArrowDown", "a"])).toEqual({ progress: 0, matches: 0 });
    // A wrong key in the middle means the rest no longer completes it.
    expect(feed(["ArrowUp", "ArrowUp", "Enter", ...MONO_SEQUENCE.slice(2)]).matches).toBe(0);
  });

  it("keeps a wrong key that can start the sequence again", () => {
    // Third ↑ instead of ↓: the last two ↑ are still a valid start.
    expect(feed(["ArrowUp", "ArrowUp", "ArrowUp"]).progress).toBe(2);
    expect(feed(["ArrowUp", "ArrowUp", "ArrowUp", ...MONO_SEQUENCE.slice(2)]).matches).toBe(1);
    // Mistake late in the sequence, then the player starts over cleanly.
    expect(feed(["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowUp"]).progress).toBe(1);
  });

  it("ignores auto-repeat and lone modifier keys", () => {
    const withNoise: SequenceKeyEvent[] = [
      { key: "ArrowUp" },
      { key: "ArrowUp", repeat: true },
      { key: "Shift" },
      { key: "ArrowUp" },
      { key: "Control" },
      { key: "Meta" },
      { key: "Alt" },
      { key: "CapsLock" },
      ...MONO_SEQUENCE.slice(2).map((key) => ({ key })),
    ];
    expect(feed(withNoise)).toEqual({ progress: 0, matches: 1 });
    // A held arrow does not count as several presses.
    expect(feed([{ key: "ArrowUp" }, { key: "ArrowUp", repeat: true }]).progress).toBe(1);
  });

  it("treats Ctrl/Meta/Alt chords as a reset, not as arrows", () => {
    expect(feed(["ArrowUp", "ArrowUp", { key: "ArrowDown", ctrlKey: true }]).progress).toBe(0);
    expect(feed(["ArrowUp", { key: "ArrowUp", metaKey: true }]).progress).toBe(0);
    expect(feed(["ArrowUp", { key: "ArrowUp", altKey: true }]).progress).toBe(0);
  });

  it("works on event.key, accepting legacy arrow names", () => {
    expect(feed(["Up", "Up", "Down", "Down", "Left", "Right", "Left", "Right"]).matches).toBe(1);
    // Physical codes are not keys: "KeyW" never advances it.
    expect(feed(["KeyW"]).progress).toBe(0);
  });

  it("clamps out-of-range progress and tolerates an empty sequence", () => {
    expect(stepSequence(MONO_SEQUENCE, -3, { key: "ArrowUp" }).progress).toBe(1);
    expect(stepSequence(MONO_SEQUENCE, 99, { key: "ArrowRight" })).toEqual({
      progress: 0,
      matched: true,
    });
    expect(stepSequence([], 0, { key: "ArrowUp" })).toEqual({ progress: 0, matched: false });
  });
});

describe("registerTap", () => {
  const tapAt = (times: readonly number[]) => {
    let taps: readonly number[] = [];
    let triggers = 0;
    for (const t of times) {
      const step = registerTap(taps, t);
      taps = step.taps;
      if (step.triggered) triggers += 1;
    }
    return { taps, triggers };
  };

  it(`triggers on the ${TITLE_TAP_COUNT}th tap inside the window and clears`, () => {
    const times = Array.from({ length: TITLE_TAP_COUNT }, (_, i) => 1000 + i * 300);
    expect(tapAt(times)).toEqual({ taps: [], triggers: 1 });
    expect(tapAt(times.slice(0, -1)).triggers).toBe(0);
  });

  it("does not trigger when the taps are spread over more than the window", () => {
    const spacing = TITLE_TAP_WINDOW_MS / (TITLE_TAP_COUNT - 1) + 1;
    const times = Array.from({ length: TITLE_TAP_COUNT }, (_, i) => i * spacing);
    expect(tapAt(times).triggers).toBe(0);
  });

  it("slides the window: old taps expire, recent ones still count", () => {
    const slow = [0, 1000, 2000];
    const burst = Array.from({ length: TITLE_TAP_COUNT - 1 }, (_, i) => 5000 + i * 100);
    // The slow taps expired; the burst alone is one short.
    expect(tapAt([...slow, ...burst]).triggers).toBe(0);
    expect(tapAt([...slow, ...burst, 5700]).triggers).toBe(1);
  });

  it("needs a fresh burst after a trigger", () => {
    const burst = Array.from({ length: TITLE_TAP_COUNT }, (_, i) => i * 100);
    const again = burst.map((t) => t + 1000);
    expect(tapAt([...burst, ...again.slice(0, -1)]).triggers).toBe(1);
    expect(tapAt([...burst, ...again]).triggers).toBe(2);
  });

  it("drops taps from the future if the clock goes backwards", () => {
    const step = registerTap([5000, 5100], 100);
    expect(step.taps).toEqual([100]);
  });
});
