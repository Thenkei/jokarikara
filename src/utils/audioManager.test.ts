import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAudioManager } from "./audioManager";

const param = () => ({
  value: 0,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

const makeContext = () => {
  const oscillators: Array<{ type: string; start: ReturnType<typeof vi.fn> }> = [];
  const gains: Array<{ gain: ReturnType<typeof param> }> = [];
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => {
      const osc = {
        type: "sine",
        frequency: param(),
        detune: param(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const node = { gain: param(), connect: vi.fn() };
      gains.push(node);
      return node;
    }),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: { value: 0 },
      ratio: { value: 0 },
      connect: vi.fn(),
    })),
  };
  return { ctx, oscillators, gains };
};

describe("audioManager", () => {
  let mock: ReturnType<typeof makeContext>;

  beforeEach(() => {
    mock = makeContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return mock.ctx;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initialises lazily once and routes through a compressor", () => {
    const audio = createAudioManager();
    audio.init();
    audio.init();
    expect(AudioContext).toHaveBeenCalledTimes(1);
    expect(mock.ctx.createDynamicsCompressor).toHaveBeenCalledTimes(1);
  });

  it("plays more voices for a PERFECT stack than an OK one", () => {
    const audio = createAudioManager();
    audio.playStack("OK", 1, 1);
    const okVoices = mock.oscillators.length;
    audio.playStack("PERFECT", 1, 1);
    const perfectVoices = mock.oscillators.length - okVoices;
    expect(perfectVoices).toBeGreaterThan(okVoices);
  });

  it("starts every scheduled oscillator", () => {
    const audio = createAudioManager();
    audio.playLevelUp(1);
    audio.playWorldUp(2);
    audio.playTick(true);
    audio.playTimeBonus();
    audio.playMissSound();
    audio.playFailSound();
    audio.playEarlyClickSound();
    audio.playStackSound(3);
    expect(mock.oscillators.length).toBeGreaterThan(0);
    mock.oscillators.forEach((osc) => expect(osc.start).toHaveBeenCalled());
  });

  it("is silent and allocates nothing while muted", () => {
    const audio = createAudioManager();
    audio.setMuted(true);
    audio.playStack("PERFECT", 3, 1);
    expect(audio.isMuted()).toBe(true);
    expect(mock.ctx.createOscillator).not.toHaveBeenCalled();
  });

  it("zeroes master gain when muted after init and restores it", () => {
    const audio = createAudioManager();
    audio.init();
    const master = mock.gains[0];
    expect(master.gain.value).toBeGreaterThan(0);
    audio.setMuted(true);
    expect(master.gain.value).toBe(0);
    audio.setMuted(false);
    expect(master.gain.value).toBeGreaterThan(0);
  });

  it("resumes a suspended context", () => {
    const audio = createAudioManager();
    audio.init();
    mock.ctx.state = "suspended";
    audio.resume();
    expect(mock.ctx.resume).toHaveBeenCalled();
  });

  it("degrades silently when Web Audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const audio = createAudioManager();
    expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
  });
});
