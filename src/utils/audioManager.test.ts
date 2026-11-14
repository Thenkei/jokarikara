import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAudioManager } from "./audioManager";
import {
  makeMockAudioContext,
  type MockAudioContext,
} from "../audio/mockAudioContext.testutil";
import { MUSIC_VOLUME } from "../audio/soundtrack";
import { dbToGain, SFX_REVERB_SEND_DB, STACK_REVERB_BOOST_DB } from "../audio/mix";

describe("audioManager", () => {
  let mock: MockAudioContext;

  beforeEach(() => {
    mock = makeMockAudioContext();
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

    it("builds one convolver per context with a calibrated stereo IR", () => {
      const audio = createAudioManager();
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
      const audio = createAudioManager();
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
      const audio = createAudioManager();
      audio.init();
      audio.playTick(false);
      const allocated = mock.gains.length;
      audio.playTick(false);
      // Only the tick's own per-voice gains are new.
      expect(mock.gains.length - allocated).toBe(2);
    });

    it("feeds the soundtrack bus into the reverb", () => {
      const audio = createAudioManager();
      audio.init();
      const [master, musicBus] = mock.gains;
      const targets = musicBus.connect.mock.calls.map(([target]) => target);
      expect(targets).toContain(master);
      expect(targets.length).toBe(2);
    });

    it("allocates no reverb while muted", () => {
      const audio = createAudioManager();
      audio.setMuted(true);
      audio.playStack("PERFECT", 1, 1);
      expect(mock.ctx.createConvolver).not.toHaveBeenCalled();
      expect(mock.ctx.createBuffer).not.toHaveBeenCalled();
    });

    it("mixes dry when convolution is unsupported", () => {
      Reflect.deleteProperty(mock.ctx, "createConvolver");
      const audio = createAudioManager();
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
      const audio = createAudioManager();
      expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
      expect(warn).toHaveBeenCalled();
      expect(mock.oscillators.length).toBeGreaterThan(0);
      // The partially built graph is released.
      mock.nodes
        .filter((node) => node.kind === "filter")
        .forEach((node) => expect(node.disconnect).toHaveBeenCalled());
    });
  });

  it("degrades silently when Web Audio is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    const audio = createAudioManager();
    expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
  });

  describe("soundtrack", () => {

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** The bus graph built by init() is long-lived; everything else is per-session. */
    const sessionNodes = (longLived: ReadonlySet<unknown>) =>
      mock.nodes.filter((node) => !longLived.has(node));

    it("routes music through its own bus into the master, below SFX", () => {
      const audio = createAudioManager();
      audio.init();
      const [master, musicBus] = mock.gains;
      expect(musicBus.connect).toHaveBeenCalledWith(master);
      expect(musicBus.gain.value).toBe(MUSIC_VOLUME);
      expect(MUSIC_VOLUME).toBeLessThan(1);
    });

    it("plays during a run and reports its state", () => {
      const audio = createAudioManager();
      audio.init();
      audio.startMusic(2);
      expect(audio.getMusicState()).toEqual({
        active: true,
        paused: false,
        enabled: true,
        playing: true,
        intensity: 0,
        world: 2,
      });
      expect(mock.oscillators.length).toBeGreaterThan(0);
    });

    it("creates the context lazily if music starts first", () => {
      const audio = createAudioManager();
      audio.startMusic(1);
      expect(AudioContext).toHaveBeenCalledTimes(1);
      expect(audio.getMusicState().playing).toBe(true);
    });

    it("stays silent and allocates nothing while muted, both ways mid-run", () => {
      const audio = createAudioManager();
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
      const audio = createAudioManager();
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
      const audio = createAudioManager();
      audio.startMusic(1);
      audio.stopMusic();
      audio.pauseMusic();
      audio.resumeMusic();
      expect(audio.getMusicState()).toMatchObject({ active: false, playing: false });
    });

    it("honours the music preference independently from mute", () => {
      const audio = createAudioManager();
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
      const audio = createAudioManager();
      audio.startMusic(1);
      expect(vi.getTimerCount()).toBe(0);
      audio.setMusicIntensity(1);
      expect(vi.getTimerCount()).toBe(1);
      const before = mock.oscillators.length;
      audio.setMusicWorld(2);
      expect(mock.oscillators.length).toBe(before + 2); // new drone voices
      expect(audio.getMusicState().world).toBe(2);
    });

    it("does not leak nodes or timers across many runs", () => {
      const audio = createAudioManager();
      audio.init();
      const longLived = new Set(mock.nodes);
      for (let run = 0; run < 25; run += 1) {
        audio.startMusic(1 + (run % 3));
        audio.setMusicIntensity(2);
        mock.ctx.currentTime += 0.5;
        vi.advanceTimersByTime(500);
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
      const audio = createAudioManager();
      expect(() => audio.startMusic(1)).not.toThrow();
      expect(audio.getMusicState().playing).toBe(false);
      expect(warn).toHaveBeenCalled();
      expect(() => audio.playStack("GOOD", 1, 1)).not.toThrow();
    });
  });
});
