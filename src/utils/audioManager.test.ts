import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { getWorldPalette } from "../audio/palette";
import { getTimeUpCadence, getWorldRoot, semitonesToRatio } from "../audio/music";
import { createAudioManager } from "./audioManager";
import {
  makeMockAudioContext,
  type MockAudioContext,
} from "../audio/mockAudioContext.testutil";
import { MUSIC_VOLUME } from "../audio/soundtrack";
import { dbToGain, SFX_REVERB_SEND_DB, STACK_REVERB_BOOST_DB } from "../audio/mix";
import { REVERB_BUILD_TIMEOUT_MS } from "../audio/reverbBus";
import { IDLE_SUSPEND_GRACE_SECONDS, REVERB_TAIL_SECONDS } from "../audio/idle";

describe("audioManager", () => {
  let mock: MockAudioContext;
  /** Idle callbacks (the deferred reverb build) waiting to run. */
  let idleQueue: (() => void)[];
  const flushIdle = () => {
    for (const task of idleQueue.splice(0)) task();
  };
  /**
   * Manual idle queue: deferred work runs only when a test flushes it, and
   * never shows up as a timer in the soundtrack timer-count assertions.
   * Re-applied after `vi.useFakeTimers()`, which fakes requestIdleCallback.
   */
  const stubIdle = () => {
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: () => void) => {
        idleQueue.push(callback);
        return idleQueue.length;
      }),
    );
  };

  beforeEach(() => {
    mock = makeMockAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContextMock() {
        return mock.ctx;
      }),
    );
    idleQueue = [];
    stubIdle();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initialises lazily once and routes through a compressor", () => {
    const audio = createAudioManager();
    audio.init();
    audio.init();
    expect(AudioContext).toHaveBeenCalledTimes(1);
    // Glue compressor + limiter on the master bus.
    expect(mock.ctx.createDynamicsCompressor).toHaveBeenCalledTimes(2);
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

  describe("prewarm (start screen idle)", () => {
    it("builds the context and the reverb before any sound, once", () => {
      const audio = createAudioManager();
      audio.prewarm();
      expect(AudioContext).toHaveBeenCalledTimes(1);
      expect(audio.getContextState()).not.toBeNull();
      // The reverb follows on idle, still before the first tap.
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
      flushIdle();
      expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);

      // The first sound reuses it: no second context, nothing rebuilt.
      audio.prewarm();
      audio.playUi("confirm");
      expect(AudioContext).toHaveBeenCalledTimes(1);
      expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);
    });

    it("allocates nothing while muted", () => {
      const audio = createAudioManager();
      audio.setMuted(true);
      audio.prewarm();
      expect(AudioContext).not.toHaveBeenCalled();
      expect(audio.getContextState()).toBeNull();
    });

    it("resumes a context the browser created suspended on the first sound", () => {
      const audio = createAudioManager();
      (mock.ctx as unknown as { state: AudioContextState }).state = "suspended";
      audio.prewarm();
      expect(mock.ctx.resume).not.toHaveBeenCalled();
      audio.playUi("confirm");
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
    });
  });

  it("plays the secret chime as a bell cascade, and nothing while muted", () => {
    const audio = createAudioManager();
    audio.setMuted(true);
    audio.playChime();
    expect(mock.ctx.createOscillator).not.toHaveBeenCalled();

    audio.setMuted(false);
    audio.playChime();
    // Five strikes, each a fundamental plus one inharmonic partial.
    expect(mock.oscillators).toHaveLength(10);
    mock.oscillators.forEach((osc) => expect(osc.start).toHaveBeenCalled());
  });

  it("plays the personal best fanfare after the stack note, and nothing while muted", () => {
    const audio = createAudioManager();
    audio.setMuted(true);
    audio.playRecord(3);
    expect(mock.ctx.createOscillator).not.toHaveBeenCalled();

    audio.setMuted(false);
    audio.playRecord(3);
    // Pickup + held chord (octave, third, fifth, sparkle, bell partial).
    expect(mock.oscillators).toHaveLength(6);
    mock.oscillators.forEach((osc) => {
      expect(osc.start).toHaveBeenCalled();
      // Every voice starts after "now" (0): the stack note lands first.
      const [when] = osc.start.mock.calls[0] as [number];
      expect(when).toBeGreaterThan(0);
    });
  });

  it("plays the achievement bell after the stack that earned it, in the world's key", () => {
    const audio = createAudioManager();
    audio.setMuted(true);
    audio.playAchievement(1);
    expect(mock.ctx.createOscillator).not.toHaveBeenCalled();

    audio.setMuted(false);
    audio.playAchievement(1);
    // Two strikes (fundamental, bar overtone, body) plus the shimmer.
    expect(mock.oscillators).toHaveLength(7);
    mock.oscillators.forEach((osc) => {
      const [when] = osc.start.mock.calls[0] as [number];
      expect(when).toBeGreaterThan(0);
    });
    const pitch = (i: number) =>
      mock.oscillators[i].frequency.setValueAtTime.mock.calls[0][0] as number;
    const firstStrike = pitch(0);
    expect(firstStrike).toBeGreaterThan(0);

    audio.playAchievement(4);
    // Another world, another key: same shape, transposed.
    expect(mock.oscillators).toHaveLength(14);
    expect(pitch(7)).not.toBeCloseTo(firstStrike, 3);
  });

  describe("time up (Time Attack clock ran out)", () => {
    const TIERS = [null, "BRONZE", "SILVER", "GOLD"] as const;
    const freqOf = (osc: (typeof mock.oscillators)[number]) =>
      osc.frequency.setValueAtTime.mock.calls[0][0] as number;
    const startOf = (osc: (typeof mock.oscillators)[number]) =>
      osc.start.mock.calls[0][0] as number;
    /** Oscillators created by one playTimeUp call. */
    const play = (audio: ReturnType<typeof createAudioManager>, world: number, medal: (typeof TIERS)[number]) => {
      const before = mock.oscillators.length;
      audio.playTimeUp(world, medal);
      return mock.oscillators.slice(before);
    };

    it("allocates nothing while muted", () => {
      const audio = createAudioManager();
      audio.setMuted(true);
      for (const medal of TIERS) audio.playTimeUp(1, medal);
      expect(mock.ctx.createOscillator).not.toHaveBeenCalled();
    });

    it("strikes a bell at once, then lands the cadence's chord at the same moment for every result", () => {
      const audio = createAudioManager();
      const world = 3;
      const root = getWorldRoot(world) * 2;
      const plays = TIERS.map((medal) => play(audio, world, medal));
      // Richer per result: strictly more voices from no medal up to Gold.
      const counts = plays.map((oscs) => oscs.length);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
      expect(new Set(counts).size).toBe(TIERS.length);
      for (const [i, oscs] of plays.entries()) {
        const cadence = getTimeUpCadence(TIERS[i]);
        // The bell: first voice, starting now, two octaves over the chord root.
        expect(startOf(oscs[0])).toBe(0);
        expect(freqOf(oscs[0])).toBeCloseTo(root * 4, 6);
        oscs.forEach((osc) => expect(osc.start).toHaveBeenCalled());
        // The chord root (first chord voice, after bell + hum + pickups).
        const chordRoot = oscs[4 + cadence.pickup.length];
        expect(freqOf(chordRoot)).toBeCloseTo(root, 6);
        expect(startOf(chordRoot)).toBeCloseTo(startOf(plays[0][4 + 1]), 9);
        // Pickups lead into it, in order.
        const pickups = oscs.slice(4, 4 + cadence.pickup.length);
        pickups.forEach((osc, j) => {
          expect(freqOf(osc)).toBeCloseTo(root * semitonesToRatio(cadence.pickup[j]), 6);
          expect(startOf(osc)).toBeLessThan(startOf(chordRoot));
          expect(startOf(osc)).toBeGreaterThan(0);
        });
      }
    });

    it("is never the fail buzz: no falling glide, no saw or square", () => {
      const audio = createAudioManager();
      for (const medal of TIERS) {
        for (const osc of play(audio, 1, medal)) {
          expect(["sine", "triangle"]).toContain(osc.type);
          expect(osc.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
        }
      }
    });

    it("blooms into the reverb like a world-up moment once the bus exists", () => {
      expect(SFX_REVERB_SEND_DB.timeUp).toBeGreaterThan(SFX_REVERB_SEND_DB.fail);
      expect(SFX_REVERB_SEND_DB.timeUp).toBe(SFX_REVERB_SEND_DB.worldUp);
    });
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

  describe("reverb send bus", () => {
    /** Levels of the reverb sends that newly created voices feed (besides the master). */
    const sendLevelsOf = (created: typeof mock.gains) => {
      const master = mock.gains[0];
      const voices = created.filter((gain) =>
        gain.connect.mock.calls.some(([target]) => target === master),
      );
      const sends = new Set(
        voices.flatMap((voice) =>
          voice.connect.mock.calls
            .map(([target]) => target as (typeof mock.gains)[number])
            .filter((target) => target !== master),
        ),
      );
      return [...sends].map((send) => send.gain.value);
    };

    /** Manager whose deferred work runs as soon as it is scheduled. */
    const eagerAudio = () => createAudioManager({ defer: (task) => task() });

    it("plays the first sound dry and builds the reverb only when idle", () => {
      const audio = createAudioManager();
      audio.init();
      audio.playTick(false);
      // No IR generation (buffer) and no convolver on the first-sound path.
      expect(mock.ctx.createBuffer).not.toHaveBeenCalled();
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
      const master = mock.gains[0];
      mock.gains.slice(2).forEach((gain) => {
        expect(gain.connect.mock.calls).toEqual([[master]]);
      });

      // Scheduled as an idle callback that is forced after a short timeout.
      expect(idleQueue).toHaveLength(1);
      expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
        timeout: REVERB_BUILD_TIMEOUT_MS,
      });
      flushIdle();
      expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);

      const before = mock.gains.length;
      audio.playStack("PERFECT", 1, 1);
      expect(sendLevelsOf(mock.gains.slice(before))).toEqual([
        dbToGain(SFX_REVERB_SEND_DB.stack + STACK_REVERB_BOOST_DB.PERFECT),
      ]);
    });

    it("falls back to a macrotask without requestIdleCallback", () => {
      vi.useFakeTimers();
      try {
        vi.stubGlobal("requestIdleCallback", undefined);
        const audio = createAudioManager();
        audio.init();
        expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
        vi.runAllTimers();
        expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("schedules the build once, however many sounds play before it", () => {
      const audio = createAudioManager();
      audio.init();
      audio.playTick(false);
      audio.playUi("select");
      audio.setMuted(false);
      expect(idleQueue).toHaveLength(1);
      flushIdle();
      audio.setMuted(false);
      expect(idleQueue).toHaveLength(0);
      expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);
    });

    it("skips the build if muted meanwhile, and builds after unmute", () => {
      const audio = createAudioManager();
      audio.init();
      audio.setMuted(true);
      flushIdle();
      expect(mock.ctx.createBuffer).not.toHaveBeenCalled();
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();

      audio.setMuted(false);
      flushIdle();
      expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);
    });

    it("skips the build if the context was closed meanwhile", () => {
      const audio = createAudioManager();
      audio.init();
      mock.ctx.state = "closed";
      flushIdle();
      expect(mock.ctx.createBuffer).not.toHaveBeenCalled();
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
    });

    it("builds one convolver per context with a calibrated stereo IR", () => {
      const audio = eagerAudio();
      audio.init();
      audio.playStack("PERFECT", 1, 1);
      audio.playWorldUp(2);
      expect(mock.ctx.createConvolver).toHaveBeenCalledTimes(1);
      const [convolver] = mock.convolvers;
      // Level is calibrated by us, not the browser's normalisation.
      expect(convolver.normalize).toBe(false);
      expect(convolver.buffer?.numberOfChannels).toBe(2);
      expect(convolver.buffer!.length).toBeGreaterThan(44100);
      // Return lands in the master, so mute and the limiter cover the tail.
      const master = mock.gains[0];
      const returnGain = convolver.connect.mock.calls[0][0] as (typeof mock.gains)[number];
      expect(returnGain.connect).toHaveBeenCalledWith(master);
    });

    it("sends big moments wetter than near-dry UI clicks", () => {
      const audio = eagerAudio();
      audio.init();
      const before = mock.gains.length;
      audio.playUi("select");
      const uiSends = sendLevelsOf(mock.gains.slice(before));

      const mid = mock.gains.length;
      audio.playStack("PERFECT", 1, 1);
      const perfectSends = sendLevelsOf(mock.gains.slice(mid));

      expect(uiSends).toEqual([dbToGain(SFX_REVERB_SEND_DB.menu)]);
      expect(perfectSends).toEqual([
        dbToGain(SFX_REVERB_SEND_DB.stack + STACK_REVERB_BOOST_DB.PERFECT),
      ]);
      expect(perfectSends[0]).toBeGreaterThan(uiSends[0] * 4);
    });

    it("reuses send nodes instead of allocating one per sound", () => {
      const audio = eagerAudio();
      audio.init();
      audio.playTick(false);
      const allocated = mock.gains.length;
      audio.playTick(false);
      // Only the tick's own per-voice gains are new.
      expect(mock.gains.length - allocated).toBe(2);
    });

    it("feeds the soundtrack bus into the reverb once it exists", () => {
      const audio = createAudioManager();
      audio.init();
      const [master, musicBus] = mock.gains;
      expect(musicBus.connect.mock.calls).toEqual([[master]]);
      flushIdle();
      const targets = musicBus.connect.mock.calls.map(([target]) => target);
      expect(targets).toContain(master);
      expect(targets.length).toBe(2);
    });

    it("allocates no reverb while muted", () => {
      const audio = createAudioManager();
      audio.setMuted(true);
      audio.playStack("PERFECT", 1, 1);
      flushIdle();
      expect(idleQueue).toHaveLength(0);
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
      expect(mock.ctx.createBuffer).not.toHaveBeenCalled();
    });

    it("mixes dry when convolution is unsupported", () => {
      Reflect.deleteProperty(mock.ctx, "createConvolver");
      const audio = eagerAudio();
      expect(() => audio.playStack("PERFECT", 1, 1)).not.toThrow();
      const master = mock.gains[0];
      const voiceGains = mock.gains.slice(2);
      expect(voiceGains.length).toBeGreaterThan(0);
      voiceGains.forEach((gain) => {
        expect(gain.connect.mock.calls).toEqual([[master]]);
      });
    });

    it("mixes dry and keeps playing if building the reverb throws", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mock.ctx.createConvolver.mockImplementation(() => {
        throw new Error("not supported");
      });
      const audio = eagerAudio();
      expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
      expect(warn).toHaveBeenCalled();
      expect(mock.oscillators.length).toBeGreaterThan(0);
      // The partially built graph is released.
      mock.nodes
        .filter((node) => node.kind === "filter")
        .forEach((node) => expect(node.disconnect).toHaveBeenCalled());
    });

    it("stays dry if deferring itself fails", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const audio = createAudioManager({
        defer: () => {
          throw new Error("no scheduler");
        },
      });
      expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
      expect(warn).toHaveBeenCalled();
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
    });
  });

  it("degrades silently when Web Audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const audio = createAudioManager();
    expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
  });

  describe("soundtrack", () => {
    /**
     * Timer counts below are the music scheduler's alone; idle suspension
     * (its own timer) is covered by the "idle suspension" suite.
     */
    const createMusicOnly = () => createAudioManager({ idleSuspend: false });

    beforeEach(() => {
      vi.useFakeTimers();
      stubIdle();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** The bus graph built by init() is long-lived; everything else is per-session. */
    const sessionNodes = (longLived: ReadonlySet<unknown>) =>
      mock.nodes.filter((node) => !longLived.has(node));

    it("routes music through its own bus into the master, below SFX", () => {
      const audio = createMusicOnly();
      audio.init();
      const [master, musicBus] = mock.gains;
      expect(musicBus.connect).toHaveBeenCalledWith(master);
      expect(musicBus.gain.value).toBe(MUSIC_VOLUME);
      expect(MUSIC_VOLUME).toBeLessThan(1);
    });

    it("plays during a run and reports its state", () => {
      const audio = createMusicOnly();
      audio.init();
      audio.startMusic(2);
      expect(audio.getMusicState()).toEqual({
        active: true,
        paused: false,
        enabled: true,
        playing: true,
        intensity: 0,
        world: 2,
        tension: 0,
      });
      expect(mock.oscillators.length).toBeGreaterThan(0);
    });

    it("creates the context lazily if music starts first", () => {
      const audio = createMusicOnly();
      audio.startMusic(1);
      expect(AudioContext).toHaveBeenCalledTimes(1);
      expect(audio.getMusicState().playing).toBe(true);
    });

    it("stays silent and allocates nothing while muted, both ways mid-run", () => {
      const audio = createMusicOnly();
      audio.setMuted(true);
      audio.startMusic(1);
      audio.setMusicIntensity(2);
      expect(mock.ctx.createOscillator).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(audio.getMusicState()).toMatchObject({ active: true, playing: false });

      audio.setMuted(false);
      expect(audio.getMusicState().playing).toBe(true);
      expect(vi.getTimerCount()).toBe(1); // intensity 2 survived the mute

      audio.setMuted(true);
      expect(audio.getMusicState().playing).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      const allocated = mock.ctx.createOscillator.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(mock.ctx.createOscillator.mock.calls.length).toBe(allocated);
    });

    it("pauses and resumes with the game", () => {
      const audio = createMusicOnly();
      audio.startMusic(1);
      audio.setMusicIntensity(1);
      audio.pauseMusic();
      expect(audio.getMusicState()).toMatchObject({ paused: true, playing: false });
      expect(vi.getTimerCount()).toBe(0);

      audio.resumeMusic();
      expect(audio.getMusicState()).toMatchObject({
        paused: false,
        playing: true,
        intensity: 1,
      });
      expect(vi.getTimerCount()).toBe(1);
    });

    it("never resumes a stopped soundtrack (e.g. pause after game over)", () => {
      const audio = createMusicOnly();
      audio.startMusic(1);
      audio.stopMusic();
      audio.pauseMusic();
      audio.resumeMusic();
      expect(audio.getMusicState()).toMatchObject({ active: false, playing: false });
    });

    it("honours the music preference independently from mute", () => {
      const audio = createMusicOnly();
      audio.setMusicEnabled(false);
      audio.startMusic(1);
      expect(audio.isMusicEnabled()).toBe(false);
      expect(audio.getMusicState().playing).toBe(false);
      // SFX still play.
      audio.playStack("OK", 1, 1);
      expect(mock.oscillators.length).toBeGreaterThan(0);

      audio.setMusicEnabled(true);
      expect(audio.getMusicState().playing).toBe(true);
    });

    it("forwards world and intensity changes to the running bed", () => {
      const audio = createMusicOnly();
      audio.startMusic(1);
      expect(vi.getTimerCount()).toBe(0);
      audio.setMusicIntensity(1);
      expect(vi.getTimerCount()).toBe(1);
      const before = mock.oscillators.length;
      audio.setMusicWorld(2);
      expect(mock.oscillators.length).toBe(before + 2); // new drone voices
      expect(audio.getMusicState().world).toBe(2);
    });

    describe("Time Attack tension", () => {
      /** The tension voice's eighth-note LFO is the only oscillator at this rate. */
      const tensionLfos = () =>
        mock.oscillators.filter((o) => o.frequency.value > 1 && o.frequency.value < 5);

      it("forwards tension to the running bed and reports it", () => {
        const audio = createMusicOnly();
        audio.startMusic(1);
        audio.setMusicTension(0.3);
        expect(audio.getMusicState()).toMatchObject({ tension: 0.3, intensity: 0 });
        expect(tensionLfos()).toHaveLength(1);
        // The forced bass pulse arms the scheduler at streak 0.
        expect(vi.getTimerCount()).toBe(1);

        audio.setMusicTension(0); // a time bonus lifted the clock
        expect(audio.getMusicState().tension).toBe(0);
      });

      it("drops repeats and sanitises values", () => {
        const audio = createMusicOnly();
        audio.startMusic(1);
        audio.setMusicTension(0.5);
        const created = mock.ctx.createOscillator.mock.calls.length;
        audio.setMusicTension(0.5);
        expect(mock.ctx.createOscillator.mock.calls.length).toBe(created);
        audio.setMusicTension(Number.NaN);
        expect(audio.getMusicState().tension).toBe(0);
        audio.setMusicTension(4);
        expect(audio.getMusicState().tension).toBe(1);
      });

      it("survives pause and mute rebuilds, and allocates nothing while silent", () => {
        const audio = createMusicOnly();
        audio.startMusic(1);
        audio.pauseMusic();
        const created = mock.ctx.createOscillator.mock.calls.length;
        audio.setMusicTension(0.8);
        expect(mock.ctx.createOscillator.mock.calls.length).toBe(created);
        expect(vi.getTimerCount()).toBe(0);
        expect(audio.getMusicState()).toMatchObject({ playing: false, tension: 0.8 });

        audio.resumeMusic();
        expect(audio.getMusicState()).toMatchObject({ playing: true, tension: 0.8 });
        expect(tensionLfos()).toHaveLength(1);

        audio.setMuted(true);
        audio.setMusicTension(1);
        expect(tensionLfos()).toHaveLength(1);
        audio.setMuted(false);
        expect(tensionLfos()).toHaveLength(2); // rebuilt tense
      });

      it("never builds a tension voice with the music off", () => {
        const audio = createMusicOnly();
        audio.setMusicEnabled(false);
        audio.startMusic(1);
        audio.setMusicTension(1);
        expect(mock.ctx.createOscillator).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      });

      it("resets with the run: a new run and a stopped one are calm", () => {
        const audio = createMusicOnly();
        audio.startMusic(1);
        audio.setMusicTension(0.9);
        audio.stopMusic();
        expect(audio.getMusicState()).toMatchObject({ active: false, tension: 0 });
        audio.startMusic(1);
        audio.setMusicTension(0.9);
        audio.startMusic(2);
        expect(audio.getMusicState().tension).toBe(0);
      });
    });

    it("does not leak nodes or timers across many runs", () => {
      const audio = createMusicOnly();
      audio.init();
      flushIdle(); // the reverb bus is part of the long-lived graph too
      const longLived = new Set(mock.nodes);
      for (let run = 0; run < 25; run += 1) {
        audio.startMusic(1 + (run % 3));
        audio.setMusicIntensity(2);
        mock.ctx.currentTime += 0.5;
        vi.advanceTimersByTime(500);
        audio.setMusicTension(run % 2 === 0 ? 1 : 0.2);
        audio.setMusicWorld(4);
        audio.pauseMusic();
        audio.resumeMusic();
        audio.stopMusic();
      }
      expect(vi.getTimerCount()).toBe(0);
      mock.oscillators.forEach((osc) => expect(osc.stop).toHaveBeenCalled());
      mock.endStoppedOscillators();
      sessionNodes(longLived).forEach((node) => expect(node.disconnect).toHaveBeenCalled());
    });

    it("keeps gameplay alive if the music graph cannot be built", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mock.ctx.createBiquadFilter.mockImplementation(() => {
        throw new Error("not supported");
      });
      const audio = createMusicOnly();
      expect(() => audio.startMusic(1)).not.toThrow();
      expect(audio.getMusicState().playing).toBe(false);
      expect(warn).toHaveBeenCalled();
      expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
    });
  });

  describe("world sound palettes", () => {
    type Filter = { kind: "filter"; type: string; frequency: { value: number }; Q: { value: number }; connect: Mock };
    /** Palette lowpass filters (the reverb bus owns a highpass one). */
    const filters = () =>
      (mock.nodes.filter((n) => n.kind === "filter") as unknown as Filter[]).filter(
        (f) => f.type === "lowpass",
      );
    const master = () => mock.gains[0];
    /** Initialised manager (dry: the reverb is never flushed here). */
    const ready = () => {
      const audio = createAudioManager();
      audio.init();
      return audio;
    };
    const newSince = <T,>(list: T[], before: number) => list.slice(before);

    it("plays world 1 exactly as before: same voices, no extra nodes", () => {
      const audio = ready();
      const oscBefore = mock.oscillators.length;
      const gainBefore = mock.gains.length;
      audio.playStack("PERFECT", 1, 1);
      const oscs = newSince(mock.oscillators, oscBefore);
      expect(oscs.map((o) => o.type)).toEqual(["triangle", "sine", "sine", "sine", "sine", "sine"]);
      expect(oscs[0].frequency.setValueAtTime).toHaveBeenCalledWith(220, 0);
      // One gain per voice, each straight into the master; no filter, no LFO.
      const gains = newSince(mock.gains, gainBefore);
      expect(gains).toHaveLength(oscs.length);
      gains.forEach((g) => expect(g.connect.mock.calls).toEqual([[master()]]));
      expect(filters()).toHaveLength(0);
      oscs.forEach((o) => {
        expect(o.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
      });
    });

    it("routes a filtered world through one lowpass per sound", () => {
      const audio = ready();
      const gainBefore = mock.gains.length;
      audio.playStack("OK", 1, 6);
      const [filter] = filters();
      expect(filters()).toHaveLength(1);
      expect(filter.type).toBe("lowpass");
      expect(filter.frequency.value).toBe(getWorldPalette(6).lowpassHz);
      expect(filter.Q.value).toBeCloseTo(Math.SQRT1_2, 6);
      expect(filter.connect).toHaveBeenCalledWith(master());
      newSince(mock.gains, gainBefore).forEach((g) =>
        expect(g.connect.mock.calls).toEqual([[filter]]),
      );
    });

    it("sends the filtered chain, not the voices, to the reverb", () => {
      const audio = createAudioManager({ defer: (task) => task() });
      audio.init();
      const gainBefore = mock.gains.length;
      audio.playLevelUp(6);
      const [filter] = filters();
      const targets = filter.connect.mock.calls.map(([t]) => t);
      expect(targets).toContain(master());
      expect(targets).toHaveLength(2);
      newSince(mock.gains, gainBefore)
        .filter((g) => g !== targets[1])
        .forEach((g) => expect(g.connect.mock.calls).toEqual([[filter]]));
    });

    it("breathes with a slow tremolo that only dips (world 2)", () => {
      const audio = ready();
      const oscBefore = mock.oscillators.length;
      const gainBefore = mock.gains.length;
      audio.playWorldUp(2);
      const { tremolo } = getWorldPalette(2);
      const lfo = newSince(mock.oscillators, oscBefore).find(
        (o) => o.frequency.value === tremolo!.rateHz,
      )!;
      expect(lfo).toBeDefined();
      expect(lfo.start).toHaveBeenCalled();
      expect(lfo.stop).toHaveBeenCalled();
      const gains = newSince(mock.gains, gainBefore);
      const tremoloGain = gains.find((g) => g.gain.value === 1 - tremolo!.depth / 2)!;
      const depth = gains.find((g) => g.gain.value === tremolo!.depth / 2)!;
      expect(lfo.connect).toHaveBeenCalledWith(depth);
      expect(depth.connect).toHaveBeenCalledWith(tremoloGain.gain);
      expect(tremoloGain.connect).toHaveBeenCalledWith(master());
    });

    it("adds vibrato to every voice's detune (world 4)", () => {
      const audio = ready();
      const oscBefore = mock.oscillators.length;
      audio.playStack("GOOD", 1, 4);
      const oscs = newSince(mock.oscillators, oscBefore);
      const { vibrato } = getWorldPalette(4);
      const lfo = oscs.find((o) => o.frequency.value === vibrato!.rateHz)!;
      const depth = lfo.connect.mock.calls[0][0] as { gain: { value: number }; connect: Mock };
      expect(depth.gain.value).toBe(vibrato!.depth);
      const voices = oscs.filter((o) => o !== lfo);
      expect(voices).toHaveLength(3);
      voices.forEach((o) => expect(depth.connect).toHaveBeenCalledWith(o.detune));
    });

    it("runs the level-up arpeggio downward in the mirrored world (8)", () => {
      const audio = ready();
      const startOf = (o: (typeof mock.oscillators)[number]) =>
        o.frequency.setValueAtTime.mock.calls[0][1] as number;
      const freqOf = (o: (typeof mock.oscillators)[number]) =>
        o.frequency.setValueAtTime.mock.calls[0][0] as number;
      let before = mock.oscillators.length;
      audio.playLevelUp(1);
      const rising = newSince(mock.oscillators, before).sort((a, b) => startOf(a) - startOf(b));
      expect(rising.map(freqOf)).toEqual([...rising.map(freqOf)].sort((a, b) => a - b));
      before = mock.oscillators.length;
      audio.playLevelUp(8);
      const falling = newSince(mock.oscillators, before)
        .filter((o) => o.type === "square")
        .sort((a, b) => startOf(a) - startOf(b));
      expect(falling).toHaveLength(4);
      expect(falling.map(freqOf)).toEqual([...falling.map(freqOf)].sort((a, b) => b - a));
    });

    it("glides the gravity world's notes down", () => {
      const audio = ready();
      const before = mock.oscillators.length;
      audio.playStack("OK", 1, 7);
      const [lead] = newSince(mock.oscillators, before);
      const [[target]] = lead.frequency.exponentialRampToValueAtTime.mock.calls;
      expect(target).toBeLessThan(lead.frequency.setValueAtTime.mock.calls[0][0]);
    });

    it("allocates nothing while muted, in every world", () => {
      const audio = createAudioManager();
      audio.setMuted(true);
      for (let world = 1; world <= 12; world += 1) {
        audio.playStack("PERFECT", 3, world);
        audio.playLevelUp(world);
        audio.playWorldUp(world);
      }
      expect(mock.ctx.createOscillator).not.toHaveBeenCalled();
      expect(mock.ctx.createGain).not.toHaveBeenCalled();
      expect(mock.ctx.createBiquadFilter).not.toHaveBeenCalled();
    });

    it("plays unshaped (never throws) when the palette chain cannot be built", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mock.ctx.createBiquadFilter.mockImplementation(() => {
        throw new Error("not supported");
      });
      const audio = ready();
      const before = mock.gains.length;
      expect(() => audio.playStack("PERFECT", 1, 6)).not.toThrow();
      expect(warn).toHaveBeenCalled();
      // Voices still sound, straight into the master.
      const voices = newSince(mock.gains, before).filter((g) =>
        g.connect.mock.calls.some(([t]) => t === master()),
      );
      expect(voices).toHaveLength(6);
    });

    it("schedules every world's sounds without errors and starts every oscillator", () => {
      const audio = ready();
      for (let world = 1; world <= 12; world += 1) {
        audio.playStack("PERFECT", world, world);
        audio.playStack("OK", world, world);
        audio.playLevelUp(world);
        audio.playWorldUp(world);
      }
      mock.oscillators.forEach((o) => {
        expect(o.start).toHaveBeenCalledTimes(1);
        expect(o.stop).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("idle suspension", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      stubIdle();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * Move the audio clock and the wall clock together, in small steps (as a
     * running context would), settling suspend/resume promises on the way.
     */
    const advance = async (seconds: number) => {
      const step = 0.05;
      for (let t = 0; t < seconds - 1e-9; t += step) {
        const dt = Math.min(step, seconds - t);
        if (mock.ctx.state === "running") mock.ctx.currentTime += dt;
        await vi.advanceTimersByTimeAsync(dt * 1000);
      }
    };
    /** Seconds after a sound ending at `end` before the context may suspend. */
    const idleAfter = (end: number) => end + REVERB_TAIL_SECONDS + IDLE_SUSPEND_GRACE_SECONDS;
    /** The menu select click: its last voice stops at 0.14 + 0.02 s. */
    const SELECT_END = 0.16;

    it("suspends once the last voice, its reverb tail and the grace have passed", async () => {
      const audio = createAudioManager();
      audio.playUi("select");
      expect(vi.getTimerCount()).toBe(1); // the single idle check

      await advance(idleAfter(SELECT_END) - 0.2);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();

      await advance(0.4);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      expect(audio.getContextState()).toBe("suspended");
      expect(vi.getTimerCount()).toBe(0); // nothing left armed while idle
    });

    it("keeps one timer and pushes the deadline back on every new sound", async () => {
      const audio = createAudioManager();
      audio.playUi("select");
      await advance(3);
      audio.playUi("select");
      expect(vi.getTimerCount()).toBe(1);
      await advance(idleAfter(SELECT_END) - 0.2);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();
      await advance(0.4);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
    });

    it("never suspends while music plays, nor while a run is in progress with music off", async () => {
      const audio = createAudioManager();
      audio.startMusic(1);
      audio.playStack("PERFECT", 1, 1);
      await advance(30);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0); // drone only: no scheduler, no idle timer

      audio.stopMusic();
      audio.setMusicEnabled(false);
      audio.startMusic(1); // next run, soundtrack off: rhythm feedback stays instant
      audio.playCue(0, true);
      await advance(30);
      expect(audio.getMusicState().playing).toBe(false);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();

      audio.pauseMusic(); // a paused run may sleep
      await advance(idleAfter(0) + 0.2);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
    });

    it("does not suspend mid-fade: the soundtrack and its tail ring out first", async () => {
      const audio = createAudioManager();
      audio.startMusic(1);
      await advance(5);
      audio.stopMusic();
      // STOP_FADE_SECONDS (0.6) + tail + grace.
      await advance(idleAfter(0.6) - 0.2);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();
      await advance(0.4);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
    });

    it("resumes a suspended context before scheduling the next sound on it", async () => {
      const audio = createAudioManager();
      audio.playUi("select");
      await advance(idleAfter(SELECT_END) + 0.2);
      expect(audio.getContextState()).toBe("suspended");
      const frozen = mock.ctx.currentTime;
      const before = mock.oscillators.length;

      audio.playUi("confirm");
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
      const created = mock.oscillators.slice(before);
      expect(created).toHaveLength(2);
      const [resumeOrder] = mock.ctx.resume.mock.invocationCallOrder;
      created.forEach((osc) => {
        // Resume first, then voices at the (frozen) clock, never in the past.
        const [startOrder] = osc.start.mock.invocationCallOrder;
        expect(startOrder).toBeGreaterThan(resumeOrder);
        const [when] = osc.start.mock.calls[0] as [number];
        expect(when).toBeGreaterThanOrEqual(frozen);
      });
      await advance(0.05);
      expect(audio.getContextState()).toBe("running");

      // And it goes back to sleep once that sound is over.
      await advance(idleAfter(0.2) + 0.2);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(2);
    });

    it("resumes even if the suspend it follows has not settled yet", async () => {
      const audio = createAudioManager();
      audio.init();
      mock.ctx.currentTime = idleAfter(0) + 0.1;
      vi.advanceTimersByTime(idleAfter(0) * 1000 + 100); // suspend() called…
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      expect(mock.ctx.state).toBe("running"); // …but not settled
      audio.playUi("select");
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.getContextState()).toBe("running"); // calls applied in order
    });

    it("lets a paused or music-off run sleep however tense its clock", async () => {
      const audio = createAudioManager();
      audio.startMusic(1);
      audio.setMusicTension(1);
      audio.pauseMusic();
      audio.setMusicTension(0.9); // the paused clock still reports
      await advance(idleAfter(0.25) + 0.2);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      expect(mock.ctx.resume).not.toHaveBeenCalled();
      // Tension alone never wakes it: only resuming the run does.
      audio.setMusicTension(1);
      expect(mock.ctx.resume).not.toHaveBeenCalled();
      audio.resumeMusic();
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
    });

    it("resumes for the soundtrack too", async () => {
      const audio = createAudioManager();
      audio.init();
      await advance(idleAfter(0) + 0.2);
      expect(audio.getContextState()).toBe("suspended");
      audio.startMusic(2);
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
      expect(audio.getMusicState().playing).toBe(true);
    });

    it("muted: suspends at once, arms no timer and resumes nothing", async () => {
      const audio = createAudioManager();
      audio.setMuted(true);
      audio.init();
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      audio.playStack("PERFECT", 3, 1);
      audio.playCue(0, true);
      audio.startMusic(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(mock.ctx.resume).not.toHaveBeenCalled();
      expect(mock.ctx.createOscillator).not.toHaveBeenCalled();

      // A gesture's resume() still unlocks the context, then it sleeps again.
      audio.resume();
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.getContextState()).toBe("suspended");
      expect(vi.getTimerCount()).toBe(0);
    });

    it("muting mid-tail waits for the tail (no grace), then stops arming timers", async () => {
      const audio = createAudioManager();
      audio.playUi("select");
      audio.setMuted(true);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);
      await advance(SELECT_END + REVERB_TAIL_SECONDS + 0.2);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);

      // Unmuting alone plays nothing: the context stays asleep until a sound.
      audio.setMuted(false);
      expect(mock.ctx.resume).not.toHaveBeenCalled();
      audio.playUi("select");
      expect(mock.ctx.resume).toHaveBeenCalledTimes(1);
    });

    it("leaves a context the browser suspended alone instead of spinning", async () => {
      const audio = createAudioManager();
      audio.playUi("select");
      mock.ctx.state = "suspended"; // e.g. autoplay policy or an OS interruption
      await advance(idleAfter(SELECT_END) + 1);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("still suspends (once) a running context whose clock has stalled", async () => {
      const audio = createAudioManager();
      audio.playUi("select");
      // Wall time passes, the audio clock does not (no output device).
      await vi.advanceTimersByTimeAsync((idleAfter(SELECT_END) + 1) * 1000);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("never touches offline contexts (rendered, not resumed)", async () => {
      const offline = Object.assign(mock.ctx, {
        startRendering: vi.fn(),
        state: "suspended" as AudioContextState,
      });
      const audio = createAudioManager();
      audio.init();
      audio.playStack("PERFECT", 1, 1);
      audio.startMusic(1);
      audio.stopMusic();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(offline.suspend).not.toHaveBeenCalled();
      expect(offline.resume).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("can be turned off", async () => {
      const audio = createAudioManager({ idleSuspend: false });
      audio.playUi("select");
      await advance(idleAfter(SELECT_END) + 1);
      expect(mock.ctx.suspend).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("never lets a failing suspend or resume reach gameplay", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mock.ctx.suspend.mockImplementation(() => Promise.reject(new Error("nope")));
      mock.ctx.resume.mockImplementation(() => {
        throw new Error("nope");
      });
      const audio = createAudioManager();
      audio.playUi("select");
      await advance(idleAfter(SELECT_END) + 0.2);
      expect(mock.ctx.suspend).toHaveBeenCalledTimes(1);
      expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
      expect(warn).toHaveBeenCalled();
    });
  });
});
