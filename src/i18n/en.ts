import type { Message } from "./types";

/**
 * English catalog: the source of truth for every user-facing string. Other
 * catalogs are typed against it (`Catalog` in catalog.ts), so a missing or
 * misshaped key fails `tsc`.
 *
 * - `{name}` placeholders are filled by `t(key, { name })`; their names are
 *   inferred from this file, so a call that forgets one does not compile.
 * - `{ one, other }` entries are plurals: `t(key, { count })`.
 * - Game terms (PERFECT / GREAT / GOOD / OK, COMBO, STYLE) are stylised labels
 *   and stay in English in every catalog.
 * - Keys are flat and grouped by screen; keep related keys together.
 */
export const en = {
  // ---------------------------------------------------------------- app
  "app.title": "SHAPE STACK",
  "app.gameBoard": "Game board: tap, click or press Space to stack the growing shape",

  // ---------------------------------------------------------------- start screen
  "start.subtitle": "Tap to stack. Don't overlap.",
  "start.settings": "Settings",
  "start.modeGroup": "Game mode",
  "start.best": "BEST {score}",
  "start.bestNone": "BEST --",
  "start.bestMedal": ", {medal}",
  "start.play": "START",
  "start.practiceGroup": "Practice start world",
  "start.practicePrev": "Previous start world",
  "start.practiceNext": "Next start world",
  "start.practiceWorld": "START AT WORLD {world}",
  "start.practiceFull": "Full run",
  "start.practiceName": "Practice · {name}",
  "start.achievements": "ACHIEVEMENTS {unlocked}/{total}",
  "start.achievementsAria": "Achievements: {unlocked} of {total} unlocked",
  "start.worlds": "WORLDS {revealed}/{total}",
  "start.worldsAria": "Worlds: {revealed} of {total} discovered",
  "start.monoOn": "Mono look on",
  "start.monoOff": "Mono look off",

  // ---------------------------------------------------------------- modes
  "mode.CLASSIC.label": "CLASSIC",
  "mode.CLASSIC.aria": "Classic mode",
  "mode.CLASSIC.name": "Classic",
  "mode.CLASSIC.description": "One miss ends the run.",
  "mode.ZEN.label": "ZEN",
  "mode.ZEN.aria": "Zen mode",
  "mode.ZEN.name": "Zen",
  "mode.ZEN.description": "{lives} lives, undo & restart.",
  "mode.TIME_ATTACK.label": "TIME",
  "mode.TIME_ATTACK.aria": "Time Attack mode",
  "mode.TIME_ATTACK.name": "Time Attack",
  "mode.TIME_ATTACK.description":
    "60 s. Perfect +{perfect} s, great +{great} s, miss −{penalty} s.",
  "mode.TIME_ATTACK.descriptionNoPenalty": "60 s, perfects add +{perfect} s.",

  // ---------------------------------------------------------------- daily challenge
  "daily.button": "DAILY CHALLENGE",
  "daily.metaNotPlayed": "{date} · NOT PLAYED",
  "daily.metaPlayed": "{date} · BEST {best} · {tries}",
  "daily.tries": { one: "{count} TRY", other: "{count} TRIES" },
  "daily.triesSpoken": { one: "{count} try", other: "{count} tries" },
  "daily.nextIn": "NEXT CHALLENGE IN {time}",
  "daily.nextInSpoken": "Next challenge in {time}.",
  "daily.nextReady": "NEXT CHALLENGE IS READY",
  "daily.aria.title": "Daily challenge for {date}.",
  "daily.aria.same": "Same shapes for everyone today.",
  "daily.aria.played": "Best {best}, {tries}.",
  "daily.aria.notPlayed": "Not played yet.",
  "daily.streak.kept": "{days}-DAY STREAK",
  "daily.streak.keptSpoken": "{days}-day streak.",
  "daily.streak.atRisk": "KEEP YOUR {days}-DAY STREAK",
  "daily.streak.atRiskSpoken": "{days}-day streak, play today to keep it.",
  "countdown.hoursMinutes": "{hours}h {minutes}m",
  "countdown.minutes": "{minutes}m",
  "countdown.lessThanMinute": "<1m",
  "countdown.spoken.hours": { one: "{count} hour", other: "{count} hours" },
  "countdown.spoken.minutes": { one: "{count} minute", other: "{count} minutes" },
  "countdown.spoken.hoursMinutes": "{hours} {minutes}",
  "countdown.spoken.lessThanMinute": "less than a minute",

  // ---------------------------------------------------------------- HUD
  "hud.pause": "PAUSE",
  "hud.pauseAria": "Pause game",
  "hud.timer": "{seconds}s",
  "hud.timerAria": { one: "{count} second left", other: "{count} seconds left" },
  "hud.lives": "LIVES {lives}",
  "hud.best": "BEST {score}",
  "hud.medalGoal": "{medal} {threshold}",
  "hud.world": "W {world}",
  "hud.level": "L {level}",
  "hud.daily": "DAILY",
  "hud.style": "STYLE {score}",
  "hud.combo": "COMBO x{streak}",
  "hud.bestCombo": "BEST x{streak}",
  "hud.zenRestart": "RESTART",
  "hud.zenRestartAria": "Restart current shape",
  "hud.zenUndo": "UNDO",
  "hud.zenUndoAria": "Undo last stack",
  "hud.timeBonus": "+{seconds}s",
  "hud.timePenalty": "−{seconds}s",
  "hud.miss": "MISS",

  // ---------------------------------------------------------------- pause menu
  "pause.dialog": "Game paused",
  "pause.title": "PAUSED",
  "pause.resume": "RESUME",
  "pause.restart": "RESTART",
  "pause.finish": "FINISH RUN",
  "pause.finishArmed": "TAP AGAIN TO FINISH",
  "pause.settings": "SETTINGS",
  "pause.mainMenu": "MAIN MENU",

  // ---------------------------------------------------------------- banners & overlays
  "banner.combo": "COMBO ×{streak}",
  "banner.newBest": "NEW BEST",
  "banner.newDailyBest": "NEW DAILY BEST",
  "banner.pastBest": "PAST {score}",
  "banner.nextMedal": "NEXT {medal} {threshold}",
  "banner.timeUp": "TIME!",
  "banner.level": "LEVEL {level}",
  "banner.newWorld": "NEW WORLD",
  "banner.world": "WORLD {world}",
  "banner.tapToPlay": "TAP TO PLAY",
  "firstRun.title": "TAP WHEN IT FITS",
  "firstRun.body":
    "Let the shape grow, then tap (or press Space) just before it touches the edge. The closer you get, the better: {perfect}.",

  // ---------------------------------------------------------------- screen reader announcements
  "announce.paused": "Paused",
  "announce.resuming": "Resuming in {seconds}",
  "announce.finishConfirm": "Finish this run? Press again to end it and keep your score",
  "announce.level": "Level {level}",
  "announce.world": "World {world}",
  "announce.worldIntro": "{howTo} Tap or press Space to play.",
  "announce.combo": "Combo {streak}",
  "announce.gameOver": "Game over",
  "announce.score": "Score {score}",
  "announce.miss": "Miss",
  "announce.missMargin": "Miss. {margin}",
  "announce.newBest": "New personal best. Previous best {score} beaten",
  "announce.newDailyBest": "New daily best. Previous best {score} beaten",
  "announce.medalTop": "{medal}. Top medal earned",
  "announce.medalNext": "{medal}. Next: {next} at {threshold}",
  "announce.timeUp": "Time! Score {score}",
  "announce.timeUpMedal": "Time! Score {score}. {medal}",

  // ---------------------------------------------------------------- stack qualities (game terms)
  "quality.PERFECT": "PERFECT",
  "quality.GREAT": "GREAT",
  "quality.GOOD": "GOOD",
  "quality.OK": "OK",

  // ---------------------------------------------------------------- medals
  "medal.name.BRONZE": "Bronze",
  "medal.name.SILVER": "Silver",
  "medal.name.GOLD": "Gold",
  "medal.title.BRONZE": "Bronze medal",
  "medal.title.SILVER": "Silver medal",
  "medal.title.GOLD": "Gold medal",
  "medal.none": "NO MEDAL",
  "medal.nextAt": "{medal} at {threshold}",
  "medal.toGo": "{points} to go",

  // ---------------------------------------------------------------- miss margins
  "margin.lateTime": "Late by {seconds}",
  "margin.lateTimeLabel": "LATE {seconds}",
  "margin.fracture": "Sector clear {seconds} later",
  "margin.fractureLabel": "WAIT {seconds}",
  "margin.lateHair": "Too late by a hair",
  "margin.earlyHair": "Too early by a hair",
  "margin.late": "Too late by {percent}",
  "margin.early": "Too early by {percent}",
  "margin.hairLabel": "BY A HAIR",
  "margin.hintEdge": "PERFECT opened {seconds} before the edge.",
  "margin.hintRing": "PERFECT opened {seconds} before the ring.",
  // No-break space: "0.4 s" and "4 %" never wrap between number and unit.
  "unit.seconds": "{value} s",
  "unit.percent": "{value} %",

  // ---------------------------------------------------------------- game over
  "gameOver.summary": "Run summary",
  "gameOver.headline": "GAME OVER",
  "gameOver.headlineFinished": "SESSION COMPLETE",
  "gameOver.headlineTimeUp": "TIME!",
  "gameOver.practiceFrom": "PRACTICE · FROM WORLD {world}",
  "gameOver.daily": "DAILY · {date}",
  "gameOver.scoreLabel": "Score: ",
  "gameOver.world": "WORLD {world}",
  "gameOver.level": "LEVEL {level}",
  "gameOver.newBest": "NEW BEST",
  "gameOver.runStats": "Run stats",
  "gameOver.stacks": "STACKS",
  "gameOver.perfect": "PERFECT",
  "gameOver.bestCombo": "BEST COMBO",
  "gameOver.levels": "LEVELS",
  "gameOver.levelsHint": "Levels reached across all worlds",
  "gameOver.breakdown": "Stack quality breakdown",
  "gameOver.unlocked": "UNLOCKED THIS RUN",
  "gameOver.showLess": "SHOW LESS",
  "gameOver.showMore": "+{count} MORE",
  "gameOver.practiceTitle": "PRACTICE RUN",
  "gameOver.practiceBody": "Practice runs don't count toward scores or achievements.",
  "gameOver.today": "TODAY",
  "gameOver.dailyLine": "BEST {best} · {tries}",
  "gameOver.topScores": "TOP SCORES - {mode}",
  "gameOver.noScores": "No high scores yet!",
  "gameOver.retry": "RETRY",
  "gameOver.share": "SHARE RESULT",
  "gameOver.mainMenu": "MAIN MENU",
  "share.copied": "Copied to clipboard",
  "share.shared": "Shared!",
  "share.failed": "Sharing unavailable",

  // ---------------------------------------------------------------- run insights
  "insight.overflow.title": "Too late: the shape crossed the edge.",
  "insight.overflow.titleWithMargin": "The shape crossed the edge.",
  "insight.overflow.tip":
    "Tap a touch earlier. GREAT (92%+) keeps the run alive and the combo going.",
  "insight.overflowReverse.title": "Your shape crossed the ring.",
  "insight.overflowReverse.tip":
    "Tap as soon as it fully wraps the previous one: tight wraps score PERFECT.",
  "insight.badTap.title": "That tap didn't fit.",
  "insight.badTap.tip":
    "Every corner of your shape must be inside the one below when you tap.",
  "insight.badTapReverse.title": "Too early: it didn't wrap the last shape.",
  "insight.badTapReverse.titleWithMargin": "It didn't wrap the last shape.",
  "insight.badTapReverse.tip":
    "In Reverse Stack, wait until your shape surrounds the previous one completely.",
  "insight.fracture.title": "Fracture! A red sector crossed your shape.",
  "insight.fracture.tip":
    "Near the edge, tap when the red arcs are clear of your shape's corners.",
  "insight.timeout.title": "Out of time.",
  "insight.timeout.tip": "Precision buys time: PERFECT +{perfect} s, GREAT +{great} s.",
  "insight.lives.title": "Out of lives.",
  "insight.lives.tip": "Early taps are free in Zen, and UNDO / RESTART never cost a life.",
  "insight.finished.title": "Session complete.",
  "insight.finished.empty":
    "Nothing stacked this time. Zen is the place to find your timing, no pressure.",
  "insight.finished.onlyPerfect": "Your only stack was PERFECT. Flawless timing.",
  "insight.finished.allPerfect": "All {stacks} were PERFECT. Flawless timing.",
  "insight.finished.dialledIn":
    "{rate}% PERFECT over {stacks}: your timing is dialled in. Classic puts it on the line.",
  "insight.finished.somePerfect":
    "{perfects} PERFECT of {stacks} ({rate}%). Next session, aim for one more.",
  "insight.finished.great":
    "{great} of {stacks} landed GREAT. PERFECT is 97%: wait a touch longer before you tap.",
  "insight.finished.safe":
    "Every stack landed safely. Let the shape grow closer to the edge before you tap for more points.",
  "insight.stacks": { one: "{count} stack", other: "{count} stacks" },

  // ---------------------------------------------------------------- share text
  "shareText.dailyTitle": "Shape Stack Daily {date}",
  "shareText.dailyStats": "{score} pts · {stacks} · W{world} L{level}",
  "shareText.title": "Shape Stack · {mode}",
  "shareText.titleMedal": "Shape Stack · {mode} · {medal}",
  "shareText.titlePractice": "Shape Stack · {mode} practice from W{world}",
  "shareText.score": "{score} pts",
  "shareText.stacks": { one: "{count} stack", other: "{count} stacks" },
  "shareText.progress": "W{world} L{level}",
  "shareText.combo": "combo x{combo}",

  // ---------------------------------------------------------------- settings
  "settings.title": "SETTINGS",
  "settings.fx.title": "Visual effects",
  "settings.fx.description": "Particles, flashes and screen shake.",
  "settings.sound.title": "Sound",
  "settings.sound.description": "Every game and menu sound.",
  "settings.music.title": "Music",
  "settings.music.description": "Soundtrack that builds as you climb.",
  "settings.haptics.title": "Haptics",
  "settings.haptics.description": "Vibrate on stacks, misses and combos.",
  "settings.haptics.unsupported": "Not available on this device.",
  "settings.timingCue.title": "Timing cue",
  "settings.timingCue.description": "Ticks that speed up toward PERFECT.",
  "settings.language.title": "Language",
  "settings.language.description": "Follows your browser unless you pick one.",
  "settings.language.auto": "Auto",
  "settings.done": "DONE",

  // ---------------------------------------------------------------- achievements
  "achievements.title": "ACHIEVEMENTS",
  "achievements.count": "{unlocked} / {total} UNLOCKED",
  "achievements.stats": "STATS",
  "achievements.progressSpoken": "{current} of {target}",
  "achievements.unlocked": "Unlocked",
  "achievements.locked": "Locked",
  "achievements.back": "BACK",
  "achievements.toast": "ACHIEVEMENT",
  "achievements.hidden.title": "???",
  "achievements.hidden.description": "A hidden achievement.",
  "achievement.first-stack.title": "First Stack",
  "achievement.first-stack.description": "Land your first shape.",
  "achievement.perfect-alignment.title": "Perfect Alignment",
  "achievement.perfect-alignment.description": "Land {count} PERFECT stacks in a row.",
  "achievement.unbroken.title": "Unbroken",
  "achievement.unbroken.description": "Reach a x{count} combo.",
  "achievement.world-2.title": "New Horizons",
  "achievement.world-2.description": "Reach World {world}.",
  "achievement.world-3.title": "Fault Lines",
  "achievement.world-3.description": "Reach World {world}.",
  "achievement.world-5.title": "Prismatic",
  "achievement.world-5.description": "Reach World {world}.",
  "achievement.speed-demon.title": "Speed Demon",
  "achievement.speed-demon.description":
    "Reach level {level} in under {seconds} seconds of play.",
  "achievement.giant-slayer.title": "Giant Slayer",
  "achievement.giant-slayer.description": "Successfully stack a boss shape.",
  "achievement.zen-master.title": "Zen Master",
  "achievement.zen-master.description": "Stack {count} shapes in a single Zen run.",
  "achievement.gold-rush.title": "Gold Rush",
  "achievement.gold-rush.description": "Earn a Time Attack gold medal ({score} points).",
  "achievement.time-lord.title": "Time Lord",
  "achievement.time-lord.description": "Score {score} points in Time Attack.",
  "achievement.daily-devotee.title": "Daily Devotee",
  "achievement.daily-devotee.description":
    "Play the Daily Challenge on {count} different days.",
  "achievement.architect.title": "Architect",
  "achievement.architect.description": "Stack {count} shapes in total.",
  "achievement.curious-mind.title": "Curious Mind",
  "achievement.curious-mind.description": "Found one of the start screen's secrets.",

  // ---------------------------------------------------------------- lifetime stats
  "stats.runs-played": "Runs played",
  "stats.total-stacks": "Total stacks",
  "stats.perfect-rate": "Perfect rate",
  "stats.best-combo": "Best combo",
  "stats.best-perfect-run": "Best perfect streak",
  "stats.best-world": "Best world",
  "stats.best-zen-stacks": "Best Zen stack",
  "stats.best-time-attack": "Best Time Attack",
  "stats.daily-played": "Daily challenges",
  "stats.daily-streak": "Daily streak",

  // ---------------------------------------------------------------- world atlas
  "atlas.title": "WORLDS",
  "atlas.count": "{revealed} / {total} DISCOVERED",
  "atlas.intro": "Each world adds a new twist to the ones before.",
  "atlas.world": "WORLD {world}",
  "atlas.lockedName": "???",
  "atlas.lockedSpoken": ", locked",
  "atlas.lockedHint": "Reach world {world} to reveal",
  "atlas.practice": "PRACTICE",
  "atlas.practiceAria": "Practice world {world}, {name}",

  // ---------------------------------------------------------------- worlds
  // One sentence of how-to each: it describes the real mechanic in
  // gameplay/config.ts (and fracture.ts, reverse.ts, heartbeat.ts), so keep it
  // in sync when a world changes. Read on a phone between runs.
  "world.1.name": "Baseline",
  "world.1.tagline": "Tap when the shape fills the space.",
  "world.1.howTo":
    "Your shape grows inside the last one: tap just before it touches the edge, and the closer the fit, the more it scores.",
  "world.2.name": "Breathing",
  "world.2.tagline": "The stack breathes. Trust the outline.",
  "world.2.howTo":
    "Stacked shapes gently swell and shrink, but only on screen, so time your tap against their resting size.",
  "world.3.name": "Accelerating Growth",
  "world.3.tagline": "Faster growth. Red rim sectors block taps.",
  "world.3.howTo":
    "Shapes grow faster through each level, and outside Zen two red sectors sweep the rim: tapping while a corner sits in one is a miss.",
  "world.4.name": "Wave",
  "world.4.tagline": "The stack sways; your shape stays put.",
  "world.4.howTo":
    "The stack sways side to side while your shape stays centred; the sway is only visual, so keep your eyes on the size.",
  "world.5.name": "Color Shift",
  "world.5.tagline": "Colours drift. Shapes don't.",
  "world.5.howTo":
    "Stacked shapes keep cycling through colours, which changes nothing else, so read the outline, not the colour.",
  "world.6.name": "The Eclipse",
  "world.6.tagline": "Darkness. Follow the pulsing outline.",
  "world.6.howTo":
    "The stack fades almost to black and only the last shape's pulsing outline shows where to stop.",
  "world.7.name": "Gravity Drift",
  "world.7.tagline": "Your shape sinks as it grows.",
  "world.7.howTo":
    "Your shape sinks while it grows, so it reaches the bottom of the last one sooner: tap a little earlier.",
  "world.8.name": "Rotation Inversion",
  "world.8.tagline": "Spin flips every other level.",
  "world.8.howTo":
    "The stack's spin flips direction every other level and on boss shapes, so corners line up at new moments.",
  "world.9.name": "Reverse Stack",
  "world.9.tagline": "Grow outward: wrap the last shape, stay inside the ring.",
  "world.9.howTo":
    "Shapes now grow outward: tap once yours fully wraps the last one, before it touches the ring around the arena.",
  "world.10.name": "Heartbeat",
  "world.10.tagline": "Growth surges on the beat. Tap in rhythm.",
  "world.10.howTo":
    "Growth surges on every beat (90 BPM) and slows in between, so aim your tap for the calm before the next beat.",
} as const satisfies Record<string, Message>;
