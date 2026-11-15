import { test, expect } from "./fixtures";

/**
 * Mix regression test: renders every effect offline in the real Web Audio
 * implementation and checks loudness relationships (see src/audio/mix.ts).
 * Levels are the loudest 300 ms RMS in dBFS; peaks are sample peaks; the
 * optional tail is the RMS of a window after every dry voice has ended, i.e.
 * pure reverb. Brightness is the RMS of the first difference over the RMS of
 * the signal across the second half of the render (a cheap spectral tilt: it
 * rises as energy moves up the spectrum), used to check that music tension
 * really opens the bed rather than just making it louder.
 */
type Level = { peakDb: number; rmsDb: number; tailDb: number; brightDb: number };

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
      playTick: (urgent: boolean, soft?: boolean) => void;
      playTimeBonus: () => void;
      playHeartbeat: () => void;
      playComboMilestone: (tier: number, world: number) => void;
      playChime: () => void;
      playRecord: (world: number) => void;
      playTimeUp: (world: number, medal: "BRONZE" | "SILVER" | "GOLD" | null) => void;
      playUi: (kind: "select" | "confirm" | "back") => void;
      playCue: (step: number, inWindow: boolean) => void;
      startMusic: (w: number) => void;
      setMusicIntensity: (level: 0 | 1 | 2) => void;
      setMusicTension: (tension: number) => void;
    };
    const SR = 44100;
    const modulePath = "/jokarikara/src/utils/audioManager.ts";
    const mod = (await import(/* @vite-ignore */ modulePath)) as {
      createAudioManager: (options?: { defer?: (task: () => void) => void }) => Audio;
    };
    const measure = async (
      secs: number,
      play: (a: Audio) => void,
      tail?: [fromSecs: number, toSecs: number],
      /**
       * Let the soundtrack's lookahead scheduler run during the render: an
       * offline render outruns its JS timer, so without this only the first
       * 0.1 s of rhythmic notes would exist. The render pauses every
       * `LIVE_STEP` s (under the 0.1 s lookahead) and resumes after the timer
       * has fired, so the scheduler sees the clock advance as it would live.
       */
      live = false,
    ) => {
      let ctx: OfflineAudioContext | null = null;
      (window as unknown as { AudioContext: unknown }).AudioContext = function () {
        ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
        return ctx;
      };
      // The reverb bus is normally built on idle, after the first sound; run
      // that deferred build synchronously so every render includes it.
      const audio = mod.createAudioManager({ defer: (task) => task() });
      audio.init();
      play(audio);
      if (live) {
        const offline = ctx! as OfflineAudioContext;
        const LIVE_STEP = 0.05;
        for (let t = LIVE_STEP; t < secs; t += LIVE_STEP) {
          offline
            .suspend(t)
            .then(() => new Promise((resolve) => setTimeout(resolve, 30)))
            .then(() => offline.resume());
        }
      }
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
      let tailMeanSquare = 0;
      if (tail) {
        const from = Math.floor(SR * tail[0]);
        const to = Math.min(data.length, Math.floor(SR * tail[1]));
        for (let i = from; i < to; i += 1) tailMeanSquare += data[i] * data[i];
        tailMeanSquare /= Math.max(1, to - from);
      }
      let signal = 0;
      let slope = 0;
      for (let i = Math.floor(data.length / 2) + 1; i < data.length; i += 1) {
        signal += data[i] * data[i];
        slope += (data[i] - data[i - 1]) ** 2;
      }
      return {
        peakDb: db(peak),
        rmsDb: db(Math.sqrt(best)),
        tailDb: db(Math.sqrt(tailMeanSquare)),
        brightDb: signal > 0 ? db(Math.sqrt(slope / signal)) : -200,
      };
    };
    // Per-world palettes (src/audio/palette.ts): the gameplay feedback of
    // every world, rendered the same way as world 1's reference above.
    const worlds: {
      world: number;
      ok: Level;
      perfect: Level;
      levelUp: Level;
      worldUp: Level;
      timeUp: Level;
      timeUpGold: Level;
      achievement: Level;
    }[] = [];
    for (let world = 1; world <= 10; world += 1) {
      worlds.push({
        world,
        ok: await measure(1.2, (a) => a.playStack("OK", 1, world)),
        perfect: await measure(1.2, (a) => a.playStack("PERFECT", 1, world)),
        levelUp: await measure(1.5, (a) => a.playLevelUp(world)),
        worldUp: await measure(2.5, (a) => a.playWorldUp(world)),
        // Unshaped by the palette, but in each world's key.
        timeUp: await measure(2.5, (a) => a.playTimeUp(world, null)),
        timeUpGold: await measure(2.5, (a) => a.playTimeUp(world, "GOLD")),
        achievement: await measure(1.5, (a) => a.playAchievement(world)),
      });
    }
    return {
      worlds,
      ok: await measure(1.2, (a) => a.playStack("OK", 1, 1)),
      good: await measure(1.2, (a) => a.playStack("GOOD", 1, 1)),
      great: await measure(1.2, (a) => a.playStack("GREAT", 1, 1)),
      // Tail windows start after the last dry voice has stopped (PERFECT:
      // ~0.76 s, menu select: ~0.16 s), so they hold reverb only.
      perfect: await measure(1.2, (a) => a.playStack("PERFECT", 1, 1), [0.85, 1.15]),
      levelUp: await measure(1.5, (a) => a.playLevelUp(1)),
      worldUp: await measure(2.5, (a) => a.playWorldUp(2)),
      fail: await measure(1.2, (a) => a.playFailSound()),
      miss: await measure(1, (a) => a.playMissSound()),
      early: await measure(1, (a) => a.playEarlyClickSound()),
      tick: await measure(0.5, (a) => a.playTick(false)),
      tickUrgent: await measure(0.5, (a) => a.playTick(true)),
      resumeTick: await measure(0.5, (a) => a.playTick(false, true)),
      resumeGo: await measure(0.5, (a) => a.playTick(true, true)),
      timeBonus: await measure(1, (a) => a.playTimeBonus()),
      heartbeat: await measure(0.6, (a) => a.playHeartbeat()),
      combo: await measure(1.2, (a) => a.playComboMilestone(5, 1)),
      chime: await measure(1.6, (a) => a.playChime()),
      record: await measure(1.5, (a) => a.playRecord(1)),
      achievement: await measure(1.5, (a) => a.playAchievement(1)),
      // An unlock lands on the stack that earned it, often a level up too
      // (and the record on the same stack): the pile-up must not clip.
      achievementBurst: await measure(1.5, (a) => {
        a.playStack("PERFECT", 10, 1);
        a.playLevelUp(1);
        a.playRecord(1);
        a.playAchievement(1);
      }),
      // The record lands on a stack, and often on a combo milestone and a
      // level up too: the pile-up must not clip.
      recordBurst: await measure(1.5, (a) => {
        a.playStack("PERFECT", 10, 1);
        a.playComboMilestone(5, 1);
        a.playLevelUp(1);
        a.playRecord(1);
      }),
      // Time Attack's clock ran out, by result (none, then each medal).
      timeUp: await measure(2.5, (a) => a.playTimeUp(1, null)),
      timeUpBronze: await measure(2.5, (a) => a.playTimeUp(1, "BRONZE")),
      timeUpSilver: await measure(2.5, (a) => a.playTimeUp(1, "SILVER")),
      timeUpGold: await measure(2.5, (a) => a.playTimeUp(1, "GOLD")),
      // Worst time-up pile-up: a miss whose penalty drained the clock (its
      // own miss sound) on the frame of the last urgent tick, over the tail
      // of a PERFECT stack and its time bonus, ending on Gold.
      timeUpBurst: await measure(2.5, (a) => {
        a.playStack("PERFECT", 10, 1);
        a.playTimeBonus();
        a.playTick(true);
        a.playMissSound();
        a.playTimeUp(1, "GOLD");
      }),
      uiSelect: await measure(0.5, (a) => a.playUi("select"), [0.25, 0.5]),
      uiConfirm: await measure(0.5, (a) => a.playUi("confirm")),
      uiBack: await measure(0.5, (a) => a.playUi("back")),
      cue: await measure(0.5, (a) => a.playCue(3, false)),
      cueWindow: await measure(0.5, (a) => a.playCue(3, true)),
      worst: await measure(2.5, (a) => {
        a.playStack("PERFECT", 10, 2);
        a.playWorldUp(2);
        a.playTimeBonus();
      }),
      music: await measure(6, (a) => a.startMusic(1)),
      // Time Attack's last seconds (src/audio/soundtrack.ts tension), with
      // the scheduler live. Tension forces the bass pulse in, so its calm
      // reference is the drone + pulse bed (streak 3+), not the drone alone.
      musicPulse: await measure(
        6,
        (a) => {
          a.startMusic(1);
          a.setMusicIntensity(1);
        },
        undefined,
        true,
      ),
      musicTense: await measure(
        6,
        (a) => {
          a.startMusic(1);
          a.setMusicTension(1);
        },
        undefined,
        true,
      ),
      // Worst case: a long streak (arpeggio) on the very last second.
      musicTenseFull: await measure(
        6,
        (a) => {
          a.startMusic(1);
          a.setMusicIntensity(2);
          a.setMusicTension(1);
        },
        undefined,
        true,
      ),
    };
  });

  const { worlds, ...effects } = levels;
  await test.info().attach("music-levels.json", {
    body: JSON.stringify(
      {
        ok: levels.ok,
        cue: levels.cue,
        music: levels.music,
        musicPulse: levels.musicPulse,
        musicTense: levels.musicTense,
        musicTenseFull: levels.musicTenseFull,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await test.info().attach("reward-levels.json", {
    body: JSON.stringify(
      {
        ok: levels.ok.rmsDb,
        perfect: levels.perfect.rmsDb,
        levelUp: levels.levelUp.rmsDb,
        record: levels.record.rmsDb,
        achievement: levels.achievement,
        achievementBurst: levels.achievementBurst,
        uiConfirm: levels.uiConfirm.rmsDb,
        perWorld: worlds.map((w) => [w.world, w.achievement.rmsDb]),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await test.info().attach("per-world-levels.json", {
    body: JSON.stringify(worlds, null, 2),
    contentType: "application/json",
  });
  await test.info().attach("time-up-levels.json", {
    body: JSON.stringify(
      {
        worldUp: levels.worldUp,
        fail: levels.fail,
        timeUp: levels.timeUp,
        timeUpBronze: levels.timeUpBronze,
        timeUpSilver: levels.timeUpSilver,
        timeUpGold: levels.timeUpGold,
        timeUpBurst: levels.timeUpBurst,
        perWorld: worlds.map((w) => ({
          world: w.world,
          timeUp: w.timeUp.rmsDb,
          timeUpGold: w.timeUpGold.rmsDb,
        })),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  const all = [
    ...(Object.values(effects) as Level[]),
    ...worlds.flatMap((w) => [
      w.ok,
      w.perfect,
      w.levelUp,
      w.worldUp,
      w.timeUp,
      w.timeUpGold,
      w.achievement,
    ]),
  ];
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
  // Resume countdown: the same ticks, quieter; its "go" a notch brighter.
  expect(levels.resumeTick.rmsDb).toBeLessThan(levels.tick.rmsDb - 3);
  // (The urgent tick hits the bus compressor, so its soft twin gains back ~2 dB.)
  expect(levels.resumeGo.rmsDb).toBeLessThan(levels.tickUrgent.rmsDb - 2);
  expect(levels.resumeGo.rmsDb).toBeGreaterThan(levels.resumeTick.rmsDb + 1.5);
  // A combo milestone is a celebration: louder than a plain stack, no louder
  // than the new-world chord.
  expect(levels.combo.rmsDb).toBeGreaterThan(levels.ok.rmsDb);
  expect(levels.combo.rmsDb).toBeLessThanOrEqual(levels.worldUp.rmsDb + 1);

  // The start screen's secret chime is a reward: clearly above menu clicks,
  // but no louder than a level up (it plays over the unlock toast's cue).
  expect(levels.chime.rmsDb).toBeGreaterThan(levels.uiConfirm.rmsDb + 2);
  expect(levels.chime.rmsDb).toBeLessThanOrEqual(levels.levelUp.rmsDb);

  // Beating your personal best is a once-per-run moment: it must stand out
  // from the PERFECT stack it lands on (≈ the combo fanfare's level), never
  // above the new-world chord.
  expect(levels.record.rmsDb).toBeGreaterThan(levels.perfect.rmsDb);
  expect(levels.record.rmsDb).toBeGreaterThan(levels.levelUp.rmsDb - 2);
  expect(levels.record.rmsDb).toBeLessThanOrEqual(levels.worldUp.rmsDb + 1);

  // An achievement unlock is a reward: above a plain stack and the menu
  // clicks, around a level up (±2 dB, the cue it replaced), and no louder
  // than the record, the run's bigger moment.
  expect(levels.achievement.rmsDb).toBeGreaterThan(levels.ok.rmsDb + 2);
  expect(levels.achievement.rmsDb).toBeGreaterThan(levels.uiConfirm.rmsDb + 2);
  expect(Math.abs(levels.achievement.rmsDb - levels.levelUp.rmsDb)).toBeLessThanOrEqual(2);
  expect(levels.achievement.rmsDb).toBeLessThanOrEqual(levels.record.rmsDb);

  // Time Attack's clock running out is the mode's normal ending: it sits
  // with the new-world chord (±2 dB), never under a routine stack, and the
  // result reads as a climb (none < Bronze < Silver < Gold) without the
  // medals turning into a jump in loudness.
  const timeUps = [
    levels.timeUp,
    levels.timeUpBronze,
    levels.timeUpSilver,
    levels.timeUpGold,
  ];
  for (const level of timeUps) {
    expect(Math.abs(level.rmsDb - levels.worldUp.rmsDb)).toBeLessThanOrEqual(2);
    expect(level.rmsDb).toBeGreaterThan(levels.ok.rmsDb + 2);
  }
  for (let i = 1; i < timeUps.length; i += 1) {
    expect(timeUps[i].rmsDb, `time-up tier ${i}`).toBeGreaterThan(timeUps[i - 1].rmsDb);
  }
  expect(levels.timeUpGold.rmsDb - levels.timeUp.rmsDb).toBeLessThanOrEqual(3);
  // (Every variant's peak, and the time-up pile-up's, is in the no-clip loop.)

  // Menu sounds are subtle: quieter than any gameplay stack.
  for (const ui of [levels.uiSelect, levels.uiConfirm, levels.uiBack]) {
    expect(ui.rmsDb).toBeLessThan(levels.ok.rmsDb);
  }

  // The beat is a rhythm cue: audible, but never louder than a stack.
  expect(levels.heartbeat.rmsDb).toBeLessThan(levels.ok.rmsDb);

  // The timing cue is a background aid: well under any stack, the PERFECT
  // tick a notch brighter than the approach ticks.
  expect(levels.cue.rmsDb).toBeLessThan(levels.ok.rmsDb - 6);
  expect(levels.cueWindow.rmsDb).toBeLessThan(levels.ok.rmsDb - 3);
  expect(levels.cueWindow.rmsDb).toBeGreaterThan(levels.cue.rmsDb + 1.5);
  // ...but it must still cut through the music bed it plays over.
  expect(levels.cue.rmsDb).toBeGreaterThan(levels.music.rmsDb + 3);
  // Same rule over the calm bed with the pulse layer (streak ≥ 3).
  expect(levels.cue.rmsDb).toBeGreaterThan(levels.musicPulse.rmsDb + 3);

  // The music bed never masks gameplay feedback.
  expect(levels.music.rmsDb).toBeLessThan(levels.ok.rmsDb - 8);

  // Time Attack tension (last 10 s) changes the bed's colour, not the mix:
  // at full tension (measured ≈ -34.7, vs drone ≈ -34.5 and the calm pulse
  // bed ≈ -33.8) it stays ≥ 8 dB under a plain stack, even over a long
  // streak's arpeggio, and the timing cue still sits ≥ 3 dB above it (≈ 3.6;
  // the eighth-note tremolo only dips, which offsets the pedal and the lift).
  expect(levels.musicTense.rmsDb).toBeLessThan(levels.ok.rmsDb - 8);
  expect(levels.musicTenseFull.rmsDb).toBeLessThan(levels.ok.rmsDb - 8);
  expect(levels.cue.rmsDb).toBeGreaterThan(levels.musicTense.rmsDb + 3);
  // Tension never makes the bed it forces in louder...
  expect(levels.musicTense.rmsDb).toBeLessThanOrEqual(levels.musicPulse.rmsDb + 0.5);
  // ...it opens it: the filter, its resonance and the pedal move energy up.
  expect(levels.musicTense.brightDb).toBeGreaterThan(levels.musicPulse.brightDb + 0.4);

  // Reverb is really there: a PERFECT stack rings on after its last voice
  // (a dry mix renders exact silence, -200), while a menu click stays
  // near-dry and its (younger) tail is still well under the PERFECT's.
  expect(levels.perfect.tailDb).toBeGreaterThan(-60);
  expect(levels.uiSelect.tailDb).toBeLessThan(-55);
  expect(levels.perfect.tailDb).toBeGreaterThan(levels.uiSelect.tailDb + 5);

  // Per-world palettes change the timbre, not the mix: every world's stack,
  // level up and world up stays within ±2 dB of world 1, and a PERFECT still
  // reads louder than an OK everywhere. World 1 is the unshaped baseline.
  const [origin] = worlds;
  expect(origin.ok.rmsDb).toBeCloseTo(levels.ok.rmsDb, 5);
  expect(origin.perfect.rmsDb).toBeCloseTo(levels.perfect.rmsDb, 5);
  expect(origin.levelUp.rmsDb).toBeCloseTo(levels.levelUp.rmsDb, 5);
  for (const w of worlds) {
    const where = `world ${w.world}`;
    for (const key of ["ok", "perfect", "levelUp", "worldUp"] as const) {
      expect(Math.abs(w[key].rmsDb - origin[key].rmsDb), `${where} ${key}`).toBeLessThanOrEqual(2);
    }
    expect(w.perfect.rmsDb, where).toBeGreaterThan(w.ok.rmsDb);
    // The time-up cue skips the palette but follows the key: same ±2 dB.
    for (const key of ["timeUp", "timeUpGold"] as const) {
      expect(Math.abs(w[key].rmsDb - origin[key].rmsDb), `${where} ${key}`).toBeLessThanOrEqual(2);
    }
    expect(w.timeUpGold.rmsDb, where).toBeGreaterThan(w.timeUp.rmsDb);
    // The unlock bell follows the key too.
    expect(
      Math.abs(w.achievement.rmsDb - origin.achievement.rmsDb),
      `${where} achievement`,
    ).toBeLessThanOrEqual(2);
  }
  expect(origin.timeUp.rmsDb).toBeCloseTo(levels.timeUp.rmsDb, 5);
});
