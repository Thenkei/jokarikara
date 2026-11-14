import { test, expect } from "./fixtures";

/**
 * Mix regression test: renders every effect offline in the real Web Audio
 * implementation and checks loudness relationships (see src/audio/mix.ts).
 * Levels are the loudest 300 ms RMS in dBFS; peaks are sample peaks.
 */
type Level = { peakDb: number; rmsDb: number };

test("sound effects and music keep their mix relationships", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Offline render reference is Chromium");
  await page.goto("/");

  const levels = await page.evaluate(async () => {
    type Audio = {
      init: () => void;
      playStack: (q: string, streak: number, world: number) => void;
      playLevelUp: (w: number) => void;
      playWorldUp: (w: number) => void;
      playFailSound: () => void;
      playMissSound: () => void;
      playEarlyClickSound: () => void;
      playTick: (urgent: boolean) => void;
      playTimeBonus: () => void;
      playHeartbeat: () => void;
      playComboMilestone: (tier: number, world: number) => void;
      startMusic: (w: number) => void;
    };
    const SR = 44100;
    const modulePath = "/jokarikara/src/utils/audioManager.ts";
    const mod = (await import(/* @vite-ignore */ modulePath)) as {
      createAudioManager: () => Audio;
    };
    const measure = async (secs: number, play: (a: Audio) => void) => {
      let ctx: OfflineAudioContext | null = null;
      (window as unknown as { AudioContext: unknown }).AudioContext = function () {
        ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        return ctx;
      };
      const audio = mod.createAudioManager();
      audio.init();
      play(audio);
      const data = (await ctx!.startRendering()).getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
      const win = Math.floor(SR * 0.3);
      let acc = 0;
      let best = 0;
      for (let i = 0; i < data.length; i += 1) {
        acc += data[i] * data[i];
        if (i >= win) acc -= data[i - win] * data[i - win];
        if (i >= win - 1) best = Math.max(best, acc / win);
      }
      const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -200);
      return { peakDb: db(peak), rmsDb: db(Math.sqrt(best)) };
    };
    return {
      ok: await measure(1.2, (a) => a.playStack("OK", 1, 1)),
      good: await measure(1.2, (a) => a.playStack("GOOD", 1, 1)),
      great: await measure(1.2, (a) => a.playStack("GREAT", 1, 1)),
      perfect: await measure(1.2, (a) => a.playStack("PERFECT", 1, 1)),
      levelUp: await measure(1.5, (a) => a.playLevelUp(1)),
      worldUp: await measure(2.5, (a) => a.playWorldUp(2)),
      fail: await measure(1.2, (a) => a.playFailSound()),
      miss: await measure(1, (a) => a.playMissSound()),
      early: await measure(1, (a) => a.playEarlyClickSound()),
      tick: await measure(0.5, (a) => a.playTick(false)),
      tickUrgent: await measure(0.5, (a) => a.playTick(true)),
      timeBonus: await measure(1, (a) => a.playTimeBonus()),
      heartbeat: await measure(0.6, (a) => a.playHeartbeat()),
      combo: await measure(1.2, (a) => a.playComboMilestone(5, 1)),
      worst: await measure(2.5, (a) => {
        a.playStack("PERFECT", 10, 2);
        a.playWorldUp(2);
        a.playTimeBonus();
      }),
      music: await measure(6, (a) => a.startMusic(1)),
    };
  });

  const all = Object.values(levels) as Level[];
  // No clipping anywhere, including the worst simultaneous burst.
  for (const level of all) expect(level.peakDb).toBeLessThanOrEqual(-1);

  // Every effect is clearly audible (the old countdown tick was at -65 dB).
  for (const level of all) expect(level.rmsDb).toBeGreaterThan(-36);

  // Core feedback sits in a healthy band; quality reads as a climb.
  expect(levels.ok.rmsDb).toBeGreaterThan(-27);
  expect(levels.ok.rmsDb).toBeLessThan(-20);
  expect(levels.good.rmsDb).toBeGreaterThan(levels.ok.rmsDb);
  expect(levels.great.rmsDb).toBeGreaterThan(levels.good.rmsDb);
  expect(levels.perfect.rmsDb).toBeGreaterThan(levels.great.rmsDb);
  expect(levels.perfect.rmsDb - levels.ok.rmsDb).toBeLessThan(7);

  // Game over must not be quieter than a routine stack.
  expect(levels.fail.rmsDb).toBeGreaterThan(levels.ok.rmsDb + 2);
  // Urgent countdown is louder than the regular tick.
  expect(levels.tickUrgent.rmsDb).toBeGreaterThan(levels.tick.rmsDb + 1.5);
  // A combo milestone is a celebration: louder than a plain stack, no louder
  // than the new-world chord.
  expect(levels.combo.rmsDb).toBeGreaterThan(levels.ok.rmsDb);
  expect(levels.combo.rmsDb).toBeLessThanOrEqual(levels.worldUp.rmsDb + 1);

  // The beat is a rhythm cue: audible, but never louder than a stack.
  expect(levels.heartbeat.rmsDb).toBeLessThan(levels.ok.rmsDb);

  // The music bed never masks gameplay feedback.
  expect(levels.music.rmsDb).toBeLessThan(levels.ok.rmsDb - 8);
});
