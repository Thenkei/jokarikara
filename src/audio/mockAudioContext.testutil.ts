import { vi, type Mock } from "vitest";

/**
 * Minimal in-memory AudioContext for unit tests (jsdom has no Web Audio).
 * Records every node so tests can assert on allocation, start/stop and
 * disconnection (leaks), and lets tests drive the audio clock by hand.
 */

export interface MockParam {
  value: number;
  setValueAtTime: Mock;
  linearRampToValueAtTime: Mock;
  exponentialRampToValueAtTime: Mock;
  setTargetAtTime: Mock;
}

export interface MockNode {
  kind: "oscillator" | "gain" | "filter" | "compressor";
  connect: Mock;
  disconnect: Mock;
}

export interface MockOscillator extends MockNode {
  kind: "oscillator";
  type: string;
  frequency: MockParam;
  detune: MockParam;
  start: Mock;
  stop: Mock;
  onended: (() => void) | null;
}

export interface MockGain extends MockNode {
  kind: "gain";
  gain: MockParam;
}

const param = (value = 0): MockParam => ({
  value,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  setTargetAtTime: vi.fn(),
});

export const makeMockAudioContext = () => {
  const nodes: MockNode[] = [];
  const oscillators: MockOscillator[] = [];
  const gains: MockGain[] = [];

  const track = <T extends MockNode>(node: T): T => {
    nodes.push(node);
    return node;
  };

  const ctx = {
    currentTime: 0,
    state: "running" as AudioContextState,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createOscillator: vi.fn(() => {
      const osc: MockOscillator = track({
        kind: "oscillator",
        type: "sine",
        frequency: param(),
        detune: param(),
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      });
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const node: MockGain = track({
        kind: "gain",
        gain: param(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      });
      gains.push(node);
      return node;
    }),
    createBiquadFilter: vi.fn(() =>
      track({
        kind: "filter" as const,
        type: "lowpass",
        frequency: param(350),
        Q: param(1),
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
    ),
    createDynamicsCompressor: vi.fn(() =>
      track({
        kind: "compressor" as const,
        threshold: { value: 0 },
        ratio: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
    ),
  };

  /** Simulate the audio thread finishing every oscillator that was stopped. */
  const endStoppedOscillators = () => {
    for (const osc of oscillators) {
      if (osc.stop.mock.calls.length > 0 && osc.onended) {
        const handler = osc.onended;
        osc.onended = null;
        handler();
      }
    }
  };

  return {
    ctx,
    nodes,
    oscillators,
    gains,
    endStoppedOscillators,
    /** Cast for code under test that expects real Web Audio types. */
    asAudioContext: () => ctx as unknown as AudioContext,
  };
};

export type MockAudioContext = ReturnType<typeof makeMockAudioContext>;
