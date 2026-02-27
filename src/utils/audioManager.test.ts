import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IAudioService } from "../audio/types";

// These are rebuilt fresh before each test via beforeEach so that every
// test starts with a clean call history and a newly-initialised AudioManager.
let mockOscillator: {
  type: string;
  frequency: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

let mockGainNode: {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    value: number;
  };
  connect: ReturnType<typeof vi.fn>;
};

let mockMasterGain: {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
};

let mockAudioCtx: {
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  destination: object;
  currentTime: number;
  state: string;
  resume: ReturnType<typeof vi.fn>;
};

let audioManager: IAudioService;

describe("audioManager", () => {
  beforeEach(async () => {
    mockOscillator = {
      type: "sine",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockGainNode = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        value: 0,
      },
      connect: vi.fn(),
    };

    mockMasterGain = {
      gain: { value: 0 },
      connect: vi.fn(),
    };

    mockAudioCtx = {
      // First createGain() call (inside init) returns the master gain node;
      // subsequent calls (inside play methods) return the per-sound gain node.
      createOscillator: vi.fn().mockReturnValue(mockOscillator),
      createGain: vi
        .fn()
        .mockReturnValueOnce(mockMasterGain)
        .mockReturnValue(mockGainNode),
      destination: {},
      currentTime: 0,
      state: "running",
      resume: vi.fn(),
    };

    // Use a plain (non-arrow) constructor function so it can be called with
    // `new`. When a constructor returns an object, that object becomes the
    // result of `new`, so `new MockAudioContext()` returns `mockAudioCtx`.
    // We verify init() ran via `mockAudioCtx.createGain` call count instead
    // of spying on the constructor itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function MockAudioContext(this: unknown): any {
      return mockAudioCtx;
    }
    vi.stubGlobal("AudioContext", MockAudioContext);

    // Reset the module cache so each test gets a freshly constructed singleton.
    vi.resetModules();
    const mod = await import("./audioManager");
    audioManager = mod.audioManager;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("init", () => {
    it("creates an AudioContext and wires up the master gain node", () => {
      audioManager.init();

      // If init() ran, it would call createGain() once (for masterGain)
      // and then wire it to the destination with a gain value of 0.3.
      expect(mockAudioCtx.createGain).toHaveBeenCalledTimes(1);
      expect(mockMasterGain.connect).toHaveBeenCalledWith(
        mockAudioCtx.destination,
      );
      expect(mockMasterGain.gain.value).toBe(0.3);
    });

    it("is idempotent – a second call does not create another AudioContext", () => {
      audioManager.init();
      audioManager.init();

      // createGain should only be called once (on the first init)
      expect(mockAudioCtx.createGain).toHaveBeenCalledTimes(1);
    });
  });

  describe("resume", () => {
    it("calls ctx.resume() when the context is suspended", () => {
      mockAudioCtx.state = "suspended";
      audioManager.init();

      audioManager.resume();

      expect(mockAudioCtx.resume).toHaveBeenCalled();
    });

    it("does not call resume when the context is already running", () => {
      mockAudioCtx.state = "running";
      audioManager.init();

      audioManager.resume();

      expect(mockAudioCtx.resume).not.toHaveBeenCalled();
    });

    it("does not throw when called before init", () => {
      expect(() => audioManager.resume()).not.toThrow();
    });
  });

  describe("playStackSound", () => {
    it("auto-initialises the context on the first call (createGain called at least once)", () => {
      audioManager.playStackSound(0);

      // If auto-init ran, createGain would have been called for masterGain
      expect(mockAudioCtx.createGain).toHaveBeenCalled();
    });

    it("creates an oscillator and a gain node", () => {
      audioManager.init();

      audioManager.playStackSound(5);

      expect(mockAudioCtx.createOscillator).toHaveBeenCalled();
      // createGain is called once for masterGain (init) + once for this sound
      expect(mockAudioCtx.createGain).toHaveBeenCalledTimes(2);
    });

    it("uses a sine wave oscillator type", () => {
      audioManager.init();

      audioManager.playStackSound(0);

      expect(mockOscillator.type).toBe("sine");
    });

    it("starts and schedules the stop of the oscillator", () => {
      audioManager.init();

      audioManager.playStackSound(0);

      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });

    it("connects oscillator → gain node → master gain", () => {
      audioManager.init();

      audioManager.playStackSound(1);

      expect(mockOscillator.connect).toHaveBeenCalledWith(mockGainNode);
      expect(mockGainNode.connect).toHaveBeenCalledWith(mockMasterGain);
    });
  });

  describe("playFailSound", () => {
    it("uses a sawtooth oscillator type", () => {
      audioManager.init();

      audioManager.playFailSound();

      expect(mockOscillator.type).toBe("sawtooth");
    });

    it("starts and schedules the stop of the oscillator", () => {
      audioManager.init();

      audioManager.playFailSound();

      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });
  });

  describe("playEarlyClickSound", () => {
    it("uses a triangle oscillator type", () => {
      audioManager.init();

      audioManager.playEarlyClickSound();

      expect(mockOscillator.type).toBe("triangle");
    });

    it("starts and schedules the stop of the oscillator", () => {
      audioManager.init();

      audioManager.playEarlyClickSound();

      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalled();
    });
  });
});
