import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { GameCanvas, type GameCanvasHandle } from "./components/GameCanvas";
import { audioManager } from "./utils/audioManager";
import { installAudioTestBridge } from "./utils/testBridge";
import {
  GAME_MODES,
  getAllHighScores,
  getHighScores,
  saveHighScore,
  getSettings,
  saveSettings,
  getDailyRecord,
  saveDailyResult,
} from "./utils/storage";
import type { HighScoresByMode } from "./utils/storage";
import type { GameMode, MissMargin, RunStats, StyleUpdate, StackQuality } from "./types";
import { getWorldPalette, getWorldTheme } from "./visual/theme";
import { haptic, isHapticsSupported, setHapticsEnabled } from "./utils/haptics";
import { StartBackdrop } from "./components/StartBackdrop";
import { getTimeBonus } from "./core/gameState";
import { getComboTier, isComboMilestone } from "./gameplay/combo";
import {
  RESUME_COUNTDOWN_FROM,
  RESUME_COUNTDOWN_STEP_MS,
} from "./gameplay/resumeCountdown";
import { getEndInsight, getQualityBreakdown } from "./modes/runInsights";
import {
  FINISH_CONFIRM_WINDOW_MS,
  canFinishRun,
  stepFinishConfirm,
} from "./modes/finishRun";
import { getMissAnnouncement, getMissMarginLabel } from "./modes/missMargin";
import { getWorldConfig } from "./gameplay/selectors";
import {
  LEVELS_PER_WORLD,
  STACKS_PER_LEVEL,
  PERFECT_STACK_TIME_BONUS,
  GREAT_STACK_TIME_BONUS,
  TIME_ATTACK_MISS_PENALTY,
  ZEN_MAX_LIVES,
} from "./constants/game";
import {
  buildDailyShareText,
  getDailySeed,
  getLocalDateKey,
  qualitiesFromScoreHistory,
} from "./modes/daily";
import {
  DAILY_COUNTDOWN_TICK_MS,
  describeDailyButton,
  describeNextDaily,
  getDailyEndTime,
  getDailyStreakLabel,
  type DailyDayRecord,
  type DailyStreakLabel,
} from "./modes/dailyStreak";
import { useWallClock } from "./modes/useWallClock";
import { StreakChip } from "./components/StreakChip";
import { buildRunShareText } from "./modes/share";
import {
  MEDAL_CUE_TIER,
  MEDAL_LABELS,
  advanceMedalRun,
  createMedalRun,
  getMedal,
  getMedalAnnouncement,
  getMedalResult,
  getMedalTarget,
  hasMedals,
  selectHudGoal,
  type Medal,
  type MedalRunState,
} from "./modes/medals";
import { MedalGlyph } from "./components/MedalGlyph";
import {
  advancePersonalBest,
  createPersonalBestState,
  getPersonalBestAnnouncement,
  selectPreviousBest,
  type PersonalBestState,
} from "./modes/personalBest";
import {
  ACHIEVEMENT_COUNT,
  SECRET_ACHIEVEMENT_ID,
  countUnlocked,
  type AchievementId,
} from "./progression/achievements";
import { MONO_SEQUENCE, registerTap, stepSequence } from "./utils/secrets";
import { useAchievements } from "./progression/useAchievements";
import { isFirstEverProfile } from "./progression/stats";
import {
  AchievementToaster,
  type AchievementToasterHandle,
} from "./components/AchievementToaster";
import { AchievementsPanel } from "./components/AchievementsPanel";
import { WorldAtlas } from "./components/WorldAtlas";
import { ATLAS_WORLD_COUNT, countRevealedWorlds } from "./gameplay/atlas";
import {
  GearIcon,
  SettingsSheet,
  type SettingId,
} from "./components/SettingsSheet";
import {
  GameOverScreen,
  type GameOverRun,
  type NextDailyStatus,
  type ShareStatus,
} from "./components/GameOverScreen";
import "./App.css";

const isE2eMode = (): boolean =>
  typeof import.meta !== "undefined" && import.meta.env?.VITE_E2E === "true";

const createRunSeed = (): number => {
  if (isE2eMode()) {
    return 424242;
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] ?? 0;
  }

  return Math.floor(Math.random() * 0xffffffff);
};

/** Full-screen panels opened from the start screen menu. */
type StartPanel = "achievements" | "worlds";

const HUD_REVEAL_DURATION_MS = 2000;
/** Start backdrop flourish length: the CSS burst plus its last layer's delay. */
const FLOURISH_MS = 1900;
/** Long enough to read the world name and its rule reminder. */
const WORLD_INTRO_MS = 2800;
/** Time Attack timer turns critical (red, pulsing) at or below this. */
const TIMER_CRITICAL_SECONDS = 10;

const MODE_LABELS: Record<GameMode, { label: string; aria: string; description: string }> = {
  CLASSIC: {
    label: "CLASSIC",
    aria: "Classic mode",
    description: "One miss ends the run.",
  },
  ZEN: {
    label: "ZEN",
    aria: "Zen mode",
    description: `${ZEN_MAX_LIVES} lives, undo & restart.`,
  },
  TIME_ATTACK: {
    label: "TIME",
    aria: "Time Attack mode",
    description:
      TIME_ATTACK_MISS_PENALTY !== undefined
        ? `60 s. Perfect +${PERFECT_STACK_TIME_BONUS} s, great +${GREAT_STACK_TIME_BONUS} s, miss −${TIME_ATTACK_MISS_PENALTY} s.`
        : `60 s, perfects add +${PERFECT_STACK_TIME_BONUS} s.`,
  },
};

const EMPTY_STATS: RunStats = {
  stackCount: 0,
  perfectCount: 0,
  bestStreak: 0,
  scoreHistory: [],
};

/** Web Share on mobile, clipboard elsewhere. Never throws. */
const shareText = async (text: string): Promise<ShareStatus> => {
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ text });
      return "shared";
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return "copied";
    }
  } catch (error) {
    // AbortError = user dismissed the share sheet: not a failure.
    if (error instanceof DOMException && error.name === "AbortError") {
      return "idle";
    }
  }
  return "failed";
};

/** True when the key event came from a control that handles Space/Enter itself. */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  target.closest("button, a, input, select, textarea, [role='button']") !== null;

interface KnownDailyRecord {
  readonly dateKey: string;
  readonly record: DailyDayRecord;
}

const NO_DAILY_RECORD: DailyDayRecord = Object.freeze({ best: 0, attempts: 0 });

/** Fresh read (another tab may have played): used on mount and back to menu. */
const readDailyRecordForToday = (): KnownDailyRecord => {
  const dateKey = getLocalDateKey();
  return { dateKey, record: getDailyRecord(dateKey) };
};

/** Stacks a regular run has made when it reaches `world`. */
const stacksBeforeWorld = (world: number): number =>
  (Math.max(1, world) - 1) * STACKS_PER_LEVEL * LEVELS_PER_WORLD;

function App() {
  const [gameState, setGameState] = useState<"START" | "PLAYING" | "GAMEOVER">(
    "START"
  );
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [world, setWorld] = useState(1);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showWorldUp, setShowWorldUp] = useState(false);
  const [allScores, setAllScores] = useState<HighScoresByMode>(() =>
    getAllHighScores()
  );
  const [lastRun, setLastRun] = useState<GameOverRun | null>(null);
  const [paused, setPaused] = useState(false);
  /**
   * Resume countdown digit on screen (3, 2, 1) after RESUME; null otherwise.
   * The pause menu is already closed, the run stays frozen until "go".
   * Changes once per digit (GameCanvas drives it).
   */
  const [resumeDigit, setResumeDigit] = useState<number | null>(null);
  const [runId, setRunId] = useState(0);
  const [mode, setMode] = useState<GameMode>("CLASSIC");
  /** Date key of the running Daily Challenge, null for a regular run. */
  const [dailyKey, setDailyKey] = useState<string | null>(null);
  /** Zen practice: world picked on the start screen (1 = regular run). */
  const [practiceWorld, setPracticeWorld] = useState(1);
  /** World the current run started at (drives <GameCanvas startWorld>). */
  const [runStartWorld, setRunStartWorld] = useState(1);
  /**
   * Last Daily record read or saved, with its day. Keyed so the start screen
   * never shows yesterday's result once the wall clock passes midnight.
   */
  const [knownDailyRecord, setKnownDailyRecord] = useState(readDailyRecordForToday);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [runSeed, setRunSeed] = useState(0);
  const [reducedFx, setReducedFx] = useState(() => getSettings().reducedFx);
  const [muted, setMuted] = useState(() => {
    const initial = getSettings().muted;
    audioManager.setMuted(initial);
    return initial;
  });
  const [musicOn, setMusicOn] = useState(() => {
    const initial = getSettings().music;
    audioManager.setMusicEnabled(initial);
    return initial;
  });
  const [hapticsOn, setHapticsOn] = useState(() => {
    const initial = getSettings().haptics;
    setHapticsEnabled(initial);
    return initial;
  });
  const hapticsSupported = useMemo(() => isHapticsSupported(), []);
  const [timingCueOn, setTimingCueOn] = useState(() => getSettings().timingCue);
  const [styleScore, setStyleScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [zenLives, setZenLives] = useState<number | null>(null);
  const [showSecondaryHud, setShowSecondaryHud] = useState(false);
  const [lastQuality, setLastQuality] = useState<StackQuality | null>(null);
  const [qualityPulseId, setQualityPulseId] = useState(0);
  /** Last combo milestone reached (id replays the banner animation). */
  const [comboBanner, setComboBanner] = useState({ streak: 0, id: 0 });
  /**
   * Screen-reader announcements for events that are otherwise purely visual
   * (level/world/combo/pause/game over). Score itself is not announced: it
   * changes on every stack and would flood the live region.
   */
  const [announcement, setAnnouncement] = useState({ text: "", id: 0 });
  /**
   * Messages announced in the same task are joined into one: a single stack
   * can beat the personal best, hit a combo milestone and level up at once,
   * and separate updates in one React batch would keep only the last one.
   */
  const pendingAnnouncementsRef = useRef<string[]>([]);
  const announce = useCallback((text: string) => {
    const pending = pendingAnnouncementsRef.current;
    pending.push(text);
    if (pending.length > 1) return;
    queueMicrotask(() => {
      const joined = pending.splice(0).join(". ");
      setAnnouncement((current) => ({ text: joined, id: current.id + 1 }));
    });
  }, []);
  /**
   * Personal best race (Classic, Time Attack, Daily). The ref follows every
   * score; React state changes only at run start and on the one stack that
   * beats the previous best.
   */
  const personalBestRef = useRef<PersonalBestState>(createPersonalBestState(null));
  /** Previous best this run races against (HUD target); null = no race. */
  const [personalBestTarget, setPersonalBestTarget] = useState<number | null>(null);
  const [personalBestPassed, setPersonalBestPassed] = useState(false);
  /**
   * Time Attack medals. Same split as the personal best: the ref follows
   * every score, React state flips only on the stack that reaches a medal.
   */
  const medalRunRef = useRef<MedalRunState>(createMedalRun(false));
  const [medalEarned, setMedalEarned] = useState<Medal | null>(null);
  /**
   * Whether the stack being reported lands on a combo milestone (set by
   * handleStyleUpdate, which GameCanvas calls right after onScore). The medal
   * cue yields to the combo fanfare GameCanvas plays for that same stack.
   */
  const comboMilestoneStackRef = useRef(false);
  /** Bumped on each Time Attack miss to replay the "-Ns" pop. */
  const [penaltyPulseId, setPenaltyPulseId] = useState(0);
  /**
   * MISS pop for a miss that did not end the run (Zen, Time Attack), with how
   * far it was off ("+4 %", "BY A HAIR"). Set once per miss event, never per
   * frame; `id` replays the animation for identical consecutive labels.
   */
  const [missPop, setMissPop] = useState<{ label: string | null; id: number } | null>(
    null,
  );
  /** Start screen sub-panel shown instead of the menu (null = the menu). */
  const [startPanel, setStartPanel] = useState<StartPanel | null>(null);
  /**
   * Panel just closed by the player: its menu entry gets focus back once the
   * menu re-renders (like the settings sheet returning focus to its gear).
   */
  const panelReturnFocusRef = useRef<StartPanel | null>(null);
  const panelTriggerRefs = useRef<Record<StartPanel, HTMLButtonElement | null>>({
    achievements: null,
    worlds: null,
  });
  const [showSettings, setShowSettings] = useState(false);
  /**
   * Zen FINISH RUN confirm: armed after a first press ("TAP AGAIN TO
   * FINISH"), disarmed after FINISH_CONFIRM_WINDOW_MS or when the pause menu
   * closes. The arming time (monotonic) lives in a ref for the press handler.
   */
  const [finishArmed, setFinishArmed] = useState(false);
  const finishArmedAtRef = useRef<number | null>(null);
  const finishDisarmTimeoutRef = useRef<number | null>(null);
  /** Back to plain FINISH RUN (window expired, menu closed, run over). */
  const disarmFinish = useCallback(() => {
    finishArmedAtRef.current = null;
    if (finishDisarmTimeoutRef.current !== null) {
      window.clearTimeout(finishDisarmTimeoutRef.current);
      finishDisarmTimeoutRef.current = null;
    }
    setFinishArmed(false);
  }, []);

  useEffect(
    () => () => {
      if (finishDisarmTimeoutRef.current !== null) {
        window.clearTimeout(finishDisarmTimeoutRef.current);
      }
    },
    [],
  );
  /**
   * Start screen secrets. Mono is session-only by design (never persisted):
   * a reload brings the regular look back.
   */
  const [mono, setMono] = useState(false);
  const [flourishing, setFlourishing] = useState(false);
  const secretProgressRef = useRef(0);
  const titleTapsRef = useRef<readonly number[]>([]);
  const flourishTimeoutRef = useRef<number | null>(null);
  /** The gear that opened the sheet (start screen or pause menu, never both). */
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<GameCanvasHandle>(null);
  const secondaryHudTimeoutRef = useRef<number | null>(null);
  const previousZenLivesRef = useRef<number | null>(null);
  const toasterRef = useRef<AchievementToasterHandle>(null);
  const worldRef = useRef(world);
  const handleAchievementUnlock = useCallback(
    (ids: readonly AchievementId[]) => toasterRef.current?.enqueue(ids),
    []
  );
  const {
    record: achievementRecord,
    beginRun: beginAchievementRun,
    recordStack: recordAchievementStack,
    recordMiss: recordAchievementMiss,
    recordUndo: recordAchievementUndo,
    setPaused: setAchievementsPaused,
    finishRun: finishAchievementRun,
    abandonRun: abandonAchievementRun,
    unlock: unlockAchievement,
  } = useAchievements({ onUnlock: handleAchievementUnlock });
  const unlockedAchievementCount = countUnlocked(achievementRecord.unlocked);

  const handleRunMiss = useCallback(
    (terminal: boolean, margin: MissMargin | null) => {
      recordAchievementMiss(terminal);
      // A terminal miss is explained (with its margin) on the game over card.
      if (terminal) return;
      setMissPop((current) => ({
        label: margin ? getMissMarginLabel(margin) : null,
        id: (current?.id ?? 0) + 1,
      }));
      announce(getMissAnnouncement(margin));
      // A non-terminal Time Attack miss costs time: show the penalty.
      if (mode === "TIME_ATTACK" && TIME_ATTACK_MISS_PENALTY !== undefined) {
        setPenaltyPulseId((current) => current + 1);
      }
    },
    [recordAchievementMiss, mode, announce],
  );
  const bestWorldReached = achievementRecord.lifetime.bestWorld;
  const revealedWorldCount = countRevealedWorlds(bestWorldReached);

  // A closed panel hands focus back to the menu entry that opened it (the
  // menu re-mounts on close, so this runs after it is back in the DOM).
  useEffect(() => {
    const closed = panelReturnFocusRef.current;
    if (closed === null || startPanel !== null || gameState !== "START") return;
    panelReturnFocusRef.current = null;
    panelTriggerRefs.current[closed]?.focus({ preventScroll: true });
  }, [startPanel, gameState]);

  /**
   * Daily habit loop. Once a Daily is played, the start screen button and the
   * game over card count down to the next one: the wall clock ticks once a
   * minute only while that countdown is on screen and stops at midnight, when
   * the button flips to the new day's NOT PLAYED. Screen changes refresh it.
   */
  const countdownDay =
    gameState === "START" && startPanel === null && knownDailyRecord.record.attempts > 0
      ? knownDailyRecord.dateKey
      : gameState === "GAMEOVER"
        ? (lastRun?.daily?.dateKey ?? null)
        : null;
  const countdownEnd = countdownDay === null ? null : getDailyEndTime(countdownDay);
  const nowMs = useWallClock(
    countdownEnd,
    DAILY_COUNTDOWN_TICK_MS,
    `${gameState}:${startPanel}`,
  );
  const dailyNow = useMemo(() => new Date(nowMs), [nowMs]);
  const dailyDates = achievementRecord.lifetime.dailyDates;
  const dailyButton = useMemo(() => {
    const todayKey = getLocalDateKey(dailyNow);
    return describeDailyButton({
      now: dailyNow,
      record:
        knownDailyRecord.dateKey === todayKey ? knownDailyRecord.record : NO_DAILY_RECORD,
      dailyDates,
    });
  }, [dailyNow, knownDailyRecord, dailyDates]);
  const gameOverDaily = useMemo((): {
    streak: DailyStreakLabel | null;
    next: NextDailyStatus | null;
  } => {
    if (!lastRun?.daily) return { streak: null, next: null };
    const end = getDailyEndTime(lastRun.daily.dateKey);
    return {
      streak: getDailyStreakLabel(dailyDates, dailyNow),
      next:
        end !== null && dailyNow.getTime() < end
          ? { kind: "countdown", countdown: describeNextDaily(dailyNow) }
          : { kind: "ready" },
    };
  }, [lastRun, dailyDates, dailyNow]);

  /**
   * First-ever run: nothing played or stacked yet. Lifetime stats commit at
   * run end, so the in-run flag below hides the hint at the first stack.
   */
  const isNewPlayer = isFirstEverProfile(achievementRecord.lifetime);
  const [hasStackedThisRun, setHasStackedThisRun] = useState(false);
  const showFirstRunHint =
    isNewPlayer && !hasStackedThisRun && runStartWorld === 1 && !dailyKey;
  // A saved pick can exceed what is unlocked only after storage resets.
  const pickedWorld = Math.min(practiceWorld, bestWorldReached);

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  // Reuse the level-up arpeggio (in the current world's key) as the cue.
  const playAchievementCue = useCallback(() => {
    audioManager.playLevelUp(worldRef.current);
  }, []);
  const worldConfig = useMemo(() => getWorldConfig(world), [world]);
  // Fixed seed: the start screen keeps the same look between visits.
  const backdropPalette = useMemo(
    () => getWorldPalette(1, 0, reducedFx, mono),
    [reducedFx, mono]
  );
  const worldTheme = useMemo(
    () => getWorldTheme(world, runSeed, reducedFx, mono),
    [world, runSeed, reducedFx, mono]
  );

  const clearSecondaryHudTimeout = useCallback(() => {
    if (secondaryHudTimeoutRef.current !== null) {
      window.clearTimeout(secondaryHudTimeoutRef.current);
      secondaryHudTimeoutRef.current = null;
    }
  }, []);

  const revealSecondaryHud = useCallback(() => {
    setShowSecondaryHud(true);
    clearSecondaryHudTimeout();
    secondaryHudTimeoutRef.current = window.setTimeout(() => {
      setShowSecondaryHud(false);
      secondaryHudTimeoutRef.current = null;
    }, HUD_REVEAL_DURATION_MS);
  }, [clearSecondaryHudTimeout]);

  useEffect(() => {
    return () => {
      clearSecondaryHudTimeout();
    };
  }, [clearSecondaryHudTimeout]);

  useEffect(() => installAudioTestBridge(audioManager), []);

  // Secret inputs only count on the start screen itself: leaving it (or
  // opening the achievements panel) forgets a half-entered sequence.
  useEffect(() => {
    secretProgressRef.current = 0;
    titleTapsRef.current = [];
  }, [gameState, startPanel]);

  useEffect(
    () => () => {
      if (flourishTimeoutRef.current !== null) {
        window.clearTimeout(flourishTimeoutRef.current);
      }
    },
    []
  );

  /** Title tapped 7 times quickly: backdrop flourish + chime. */
  const handleTitleClick = (event: ReactMouseEvent<HTMLHeadingElement>) => {
    // A celebration already playing swallows extra taps (no restart mid-burst).
    if (flourishing) return;
    const step = registerTap(titleTapsRef.current, event.timeStamp);
    titleTapsRef.current = step.taps;
    if (!step.triggered) return;
    // Click (not pointerdown) so the 7th tap is a user activation on touch
    // devices too, and the audio context may start. Silent when muted.
    audioManager.playChime();
    audioManager.resume();
    setFlourishing(true);
    flourishTimeoutRef.current = window.setTimeout(() => {
      flourishTimeoutRef.current = null;
      setFlourishing(false);
    }, FLOURISH_MS);
    unlockAchievement(SECRET_ACHIEVEMENT_ID);
  };

  /** Arrow sequence entered: toggle the Mono look (keyboard-reachable egg). */
  const toggleMono = () => {
    const next = !mono;
    setMono(next);
    audioManager.playUi(next ? "confirm" : "back");
    announce(next ? "Mono look on" : "Mono look off");
    unlockAchievement(SECRET_ACHIEVEMENT_ID);
  };
  const gameplayThemeVars = useMemo(
    () =>
      ({
        "--world-hud-primary": worldTheme.hud.primary,
        "--world-hud-secondary": worldTheme.hud.secondary,
        "--world-hud-accent": worldTheme.hud.accent,
        "--world-hud-text": worldTheme.hud.text,
        "--world-hud-subtle-text": worldTheme.hud.subtleText,
      }) as CSSProperties,
    [worldTheme]
  );

  const startRun = ({
    mode: selectedMode,
    daily,
    practiceFrom,
  }: {
    mode: GameMode;
    daily: boolean;
    /** Zen only: start world picked outside the start screen picker (atlas). */
    practiceFrom?: number;
  }) => {
    // The Daily Challenge always uses Classic rules.
    const runMode: GameMode = daily ? "CLASSIC" : selectedMode;
    const initialZenLives = runMode === "ZEN" ? ZEN_MAX_LIVES : null;
    const todayKey = daily ? getLocalDateKey() : null;
    // Only Zen offers practice from a later world.
    const startWorld =
      runMode === "ZEN" && !daily
        ? Math.max(1, Math.min(practiceFrom ?? pickedWorld, bestWorldReached))
        : 1;
    const practice = startWorld > 1;

    // Commits a run left from the pause menu (RESTART) before starting anew.
    beginAchievementRun(runMode, todayKey, { practice });
    // Read fresh (not from state): another tab or yesterday's Daily may have
    // moved the records since this screen was rendered.
    const previousBest = selectPreviousBest({
      mode: runMode,
      dailyKey: todayKey,
      practice,
      modeBest: getHighScores(runMode)[0]?.score,
      dailyRecord: todayKey ? getDailyRecord(todayKey) : null,
    });
    personalBestRef.current = createPersonalBestState(previousBest);
    setPersonalBestTarget(previousBest);
    setPersonalBestPassed(false);
    medalRunRef.current = createMedalRun(hasMedals(runMode, daily, practice));
    setMedalEarned(null);
    setRunStartWorld(startWorld);
    setStartPanel(null);
    setMode(runMode);
    setDailyKey(todayKey);
    setShareStatus("idle");
    setPaused(false);
    disarmFinish();
    setResumeDigit(null);
    setLastRun(null);
    setRunId((current) => current + 1);
    audioManager.init();
    audioManager.resume();
    setRunSeed(todayKey ? getDailySeed(todayKey) : createRunSeed());
    setScore(0);
    setStyleScore(0);
    setStreak(0);
    setBestStreak(0);
    setZenLives(initialZenLives);
    previousZenLivesRef.current = initialZenLives;
    setLastQuality(null);
    setQualityPulseId(0);
    setPenaltyPulseId(0);
    setMissPop(null);
    setComboBanner({ streak: 0, id: 0 });
    markProgress("reset", startWorld);
    setHasStackedThisRun(false);
    setLevel(1);
    setWorld(startWorld);
    setTimeRemaining(null);
    setGameState("PLAYING");
    revealSecondaryHud();
    if (practice) {
      // Practice drops you mid-progression: show the world's rule up front.
      setShowWorldUp(true);
      window.setTimeout(() => setShowWorldUp(false), WORLD_INTRO_MS);
    }
  };

  /**
   * PRACTICE from the world atlas: the start screen's Zen practice path, with
   * the picker moved to that world so RESTART replays the same practice.
   */
  const startPracticeFromAtlas = (practiceFrom: number) => {
    setPracticeWorld(practiceFrom);
    startRun({ mode: "ZEN", daily: false, practiceFrom });
  };

  const closeStartPanel = () => {
    panelReturnFocusRef.current = startPanel;
    setStartPanel(null);
  };

  /** Same kind of run again (keeps Daily vs regular). */
  const restartRun = () => startRun({ mode, daily: dailyKey !== null });

  const handleGameOver = useCallback(
    (
      finalScore: number,
      finalWorld: number,
      finalLevel: number,
      stats: RunStats = EMPTY_STATS
    ) => {
      const achievements = finishAchievementRun({
        score: finalScore,
        world: finalWorld,
        level: finalLevel,
        stats,
      });
      if (runStartWorld > 1) {
        // Practice runs never touch leaderboards (they skip early worlds).
        setLastRun({
          mode,
          practiceWorld: runStartWorld,
          isNewBest: false,
          stats,
          scores: allScores[mode],
          daily: null,
          achievements,
        });
      } else if (dailyKey) {
        // Daily runs have their own per-day record and stay out of the
        // Classic leaderboard (a known seed would skew it).
        const result = saveDailyResult(dailyKey, finalScore);
        // Keyed by the run's day: a run that crossed midnight is yesterday's.
        setKnownDailyRecord({
          dateKey: dailyKey,
          record: { best: result.best, attempts: result.attempts },
        });
        setLastRun({
          mode,
          isNewBest: result.isNewBest,
          stats,
          scores: allScores[mode],
          daily: { dateKey: dailyKey, best: result.best, attempts: result.attempts },
          achievements,
          practiceWorld: null,
        });
      } else {
        const { scores, isNewBest } = saveHighScore(finalScore, mode);
        setAllScores((current) => ({ ...current, [mode]: scores }));
        setLastRun({
          mode,
          practiceWorld: null,
          isNewBest,
          stats,
          scores,
          daily: null,
          achievements,
        });
      }
      setPaused(false);
      setResumeDigit(null);
      setScore(finalScore);
      setWorld(finalWorld);
      setLevel(finalLevel);
      clearSecondaryHudTimeout();
      setShowSecondaryHud(false);
      setGameState("GAMEOVER");
      disarmFinish();
      const insight = getEndInsight(
        stats.endReason,
        finalWorld,
        stats.endMargin,
        stats.scoreHistory,
      );
      // A finished session is not a loss: no "Game over" lead-in.
      const lead = stats.endReason === "finished" ? null : "Game over";
      announce(
        [lead, insight?.margin, insight?.title, `Score ${finalScore}`]
          .filter((part): part is string => Boolean(part))
          // Titles are sentences: never read "edge.. Score".
          .map((part) => part.replace(/\.$/, ""))
          .join(". "),
      );
    },
    [
      announce,
      clearSecondaryHudTimeout,
      mode,
      dailyKey,
      runStartWorld,
      allScores,
      finishAchievementRun,
      disarmFinish,
    ]
  );

  const handleScore = useCallback((newScore: number) => {
    setScore(newScore);
    setHasStackedThisRun(true);
    revealSecondaryHud();

    const step = advancePersonalBest(personalBestRef.current, newScore);
    const recordMoment = step.crossed && step.state.target !== null;
    if (recordMoment && step.state.target !== null) {
      personalBestRef.current = step.state;
      // One-time record moment: banner + score pill accent (state), cue, haptic.
      setPersonalBestPassed(true);
      announce(getPersonalBestAnnouncement(step.state.target, dailyKey !== null));
      audioManager.playRecord(worldRef.current);
      // GameCanvas vibrates for the stack (and level up) right after reporting
      // the score, and a new vibrate() call cancels the running pattern: queue
      // ours behind that synchronous work so the bigger moment is the one felt.
      queueMicrotask(() => haptic("record"));
    }

    const medalStep = advanceMedalRun(medalRunRef.current, newScore);
    const medal = medalStep.crossed;
    if (medal === null) return;
    medalRunRef.current = medalStep.state;
    // One-time per medal: HUD chip + lane pill (state), announcement, cue.
    setMedalEarned(medal);
    announce(getMedalAnnouncement(medal));
    // A record on the same stack already has the bigger cue and haptic.
    if (recordMoment) return;
    queueMicrotask(() => {
      // Runs after GameCanvas finished the stack (style update + its sounds):
      // never stack two pentatonic runs when a combo milestone landed too.
      if (!comboMilestoneStackRef.current) {
        audioManager.playComboMilestone(MEDAL_CUE_TIER[medal], worldRef.current);
      }
      haptic("medal");
    });
  }, [revealSecondaryHud, announce, dailyKey]);

  // Last progression announced; undo re-reports the current level/world and
  // must not be re-announced.
  const announcedProgressRef = useRef({ world: 1, level: 1 });
  /**
   * Single owner of the ref's mutations (the React compiler rejects mutating
   * a ref from several hook closures). Returns true when the value is new.
   */
  const markProgress = useCallback(
    (kind: "world" | "level" | "reset", value: number): boolean => {
      const progress = announcedProgressRef.current;
      if (kind === "reset") {
        progress.world = value;
        progress.level = 1;
        return true;
      }
      if (progress[kind] === value) return false;
      progress[kind] = value;
      if (kind === "world") progress.level = 1;
      return true;
    },
    [],
  );

  const handleLevelUp = useCallback((newLevel: number) => {
    setLevel(newLevel);
    setShowLevelUp(true);
    setTimeout(() => setShowLevelUp(false), 1100);
    revealSecondaryHud();
    if (markProgress("level", newLevel)) {
      announce(`Level ${newLevel}`);
    }
  }, [revealSecondaryHud, announce, markProgress]);

  const handleWorldUp = useCallback((newWorld: number) => {
    setWorld(newWorld);
    setLevel(1);
    setShowWorldUp(true);
    setTimeout(() => setShowWorldUp(false), WORLD_INTRO_MS);
    revealSecondaryHud();
    if (markProgress("world", newWorld)) {
      const config = getWorldConfig(newWorld);
      announce(
        [`World ${newWorld}`, config.name, config.tagline].filter(Boolean).join(". "),
      );
    }
  }, [revealSecondaryHud, announce, markProgress]);

  const handleTimeUpdate = useCallback((time: number) => {
    setTimeRemaining(time);
  }, []);

  const handleStyleUpdate = useCallback((style: StyleUpdate) => {
    comboMilestoneStackRef.current =
      style.lastStackQuality !== null && isComboMilestone(style.streak);
    setStyleScore(style.styleScore);
    setStreak(style.streak);
    setBestStreak(style.bestStreak);
    setLastQuality(style.lastStackQuality);
    if (style.lastStackQuality) {
      setQualityPulseId((current) => current + 1);
      if (isComboMilestone(style.streak)) {
        setComboBanner((current) => ({ streak: style.streak, id: current.id + 1 }));
        announce(`Combo ${style.streak}`);
      }
    }
  }, [announce]);

  const handleZenLivesChange = useCallback(
    (lives: number | null) => {
      setZenLives(lives);
      if (lives !== previousZenLivesRef.current) {
        revealSecondaryHud();
      }
      previousZenLivesRef.current = lives;
    },
    [revealSecondaryHud]
  );

  /**
   * Pausing is immediate (and cancels a resume countdown). Resuming closes the
   * menu at once but keeps the run frozen through a "3 · 2 · 1" so the player
   * is back on the board before the shape grows (see handleResumeCountdown).
   */
  const applyPaused = useCallback(
    (next: boolean) => {
      setPaused(next);
      // A confirm never survives the menu closing (nor a fresh pause).
      disarmFinish();
      if (next) {
        setResumeDigit(null);
        announce("Paused");
        canvasRef.current?.setPaused(true);
        // Paused time does not count towards play-time achievements.
        setAchievementsPaused(true);
        return;
      }
      // The sheet only exists over the pause menu; never reopen it on a later pause.
      setShowSettings(false);
      if (canvasRef.current) canvasRef.current.resumeWithCountdown();
      else setAchievementsPaused(false);
    },
    [setAchievementsPaused, announce, disarmFinish]
  );

  const handleResumeCountdown = useCallback(
    (digit: number | null) => {
      setResumeDigit(digit);
      // Announced once, not every digit (the live region would stutter).
      if (digit === RESUME_COUNTDOWN_FROM) announce(`Resuming in ${digit}`);
      // Play time counts again only once the run actually runs.
      if (digit === null) setAchievementsPaused(false);
    },
    [announce, setAchievementsPaused]
  );

  const handleRestartShape = () => {
    canvasRef.current?.restartShape();
    revealSecondaryHud();
  };

  const handleUndo = () => {
    canvasRef.current?.undo();
    recordAchievementUndo();
    revealSecondaryHud();
  };

  /**
   * Zen FINISH RUN, two presses: the first arms the button for
   * FINISH_CONFIRM_WINDOW_MS, a deliberate second one (not a double click, see
   * stepFinishConfirm) ends the run through the regular game over path.
   */
  const handleFinishPress = () => {
    const now = performance.now();
    const step = stepFinishConfirm(finishArmedAtRef.current, now);
    if (step === "wait") return;
    if (step === "arm") {
      finishArmedAtRef.current = now;
      setFinishArmed(true);
      if (finishDisarmTimeoutRef.current !== null) {
        window.clearTimeout(finishDisarmTimeoutRef.current);
      }
      finishDisarmTimeoutRef.current = window.setTimeout(() => {
        finishDisarmTimeoutRef.current = null;
        finishArmedAtRef.current = null;
        setFinishArmed(false);
      }, FINISH_CONFIRM_WINDOW_MS);
      announce("Finish this run? Press again to end it and keep your score");
      return;
    }
    disarmFinish();
    // Reports through onGameOver -> handleGameOver (score, stats, insight).
    canvasRef.current?.finishRun();
  };

  const handleToggleReducedFx = () => {
    setReducedFx((current) => {
      const next = !current;
      saveSettings({ reducedFx: next });
      return next;
    });
    revealSecondaryHud();
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioManager.setMuted(next);
    // Audible confirmation that sound is back (muting stays silent).
    if (!next) audioManager.playUi("select");
    saveSettings({ muted: next });
    revealSecondaryHud();
  };

  const handleToggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    audioManager.setMusicEnabled(next);
    saveSettings({ music: next });
    revealSecondaryHud();
  };

  const handleToggleHaptics = () => {
    const next = !hapticsOn;
    setHapticsOn(next);
    setHapticsEnabled(next);
    saveSettings({ haptics: next });
    // Let the player feel what they just turned on.
    if (next) haptic("tap");
  };

  const handleToggleTimingCue = () => {
    const next = !timingCueOn;
    setTimingCueOn(next);
    saveSettings({ timingCue: next });
    // Turning it on previews the PERFECT tick instead of the generic click
    // (the button opts out of the delegated menu sound to avoid a double hit).
    if (next) audioManager.playCue(0, true);
    else audioManager.playUi("select");
  };

  const handleToggleSetting = (id: SettingId) => {
    switch (id) {
      case "fx":
        return handleToggleReducedFx();
      case "sound":
        return handleToggleMute();
      case "music":
        return handleToggleMusic();
      case "haptics":
        return handleToggleHaptics();
      case "timingCue":
        return handleToggleTimingCue();
    }
  };

  const handleShare = async () => {
    if (!lastRun) return;
    const text = lastRun.daily
      ? buildDailyShareText({
          dateKey: lastRun.daily.dateKey,
          score,
          world,
          level,
          stackCount: lastRun.stats.stackCount,
          qualities: qualitiesFromScoreHistory(lastRun.stats.scoreHistory),
        })
      : buildRunShareText({
          mode: lastRun.mode,
          score,
          world,
          level,
          stackCount: runStackCount,
          bestCombo: lastRun.stats.bestStreak,
          breakdown,
          practiceWorld: lastRun.practiceWorld,
        });
    setShareStatus(await shareText(text));
  };

  const handleMainMenu = () => {
    // No-op after a game over (already committed); counts an abandoned run.
    abandonAchievementRun();
    disarmFinish();
    setPaused(false);
    setResumeDigit(null);
    setShowSettings(false);
    setDailyKey(null);
    setKnownDailyRecord(readDailyRecordForToday());
    clearSecondaryHudTimeout();
    setShowSecondaryHud(false);
    setZenLives(null);
    previousZenLivesRef.current = null;
    setShowLevelUp(false);
    setShowWorldUp(false);
    setGameState("START");
  };

  /**
   * Preferences live behind one Settings entry (start screen corner + pause
   * menu), not in the in-game HUD: they are not gameplay info, and a row of
   * pills crowded both menus.
   */
  const settingsSheetVisible =
    showSettings &&
    ((gameState === "START" && startPanel === null) ||
      (gameState === "PLAYING" && paused));

  // Latest-callback ref so the window listeners below are bound once per phase
  // instead of being torn down on every render.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // The sheet owns the keyboard while open (Escape, focus trap); nothing may
    // resume, tap or start a run from behind it.
    if (settingsSheetVisible) return;

    if (gameState === "PLAYING") {
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        if (event.repeat) return;
        event.preventDefault();
        applyPaused(!paused);
        return;
      }
      if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault(); // stop Space from scrolling
        if (event.repeat || paused) return;
        canvasRef.current?.tap();
      }
      return;
    }

    if (gameState === "START" && startPanel !== null) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeStartPanel();
      }
      // Enter must not start a run from behind the panel.
      return;
    }

    if (gameState === "START") {
      // Observes keys only (no preventDefault): arrows keep driving the mode
      // radio group, and the full sequence nets out to the same mode.
      const step = stepSequence(MONO_SEQUENCE, secretProgressRef.current, event);
      secretProgressRef.current = step.progress;
      if (step.matched) toggleMono();
    }

    if (event.key === "Enter" && !event.repeat && !isInteractiveTarget(event.target)) {
      if (gameState === "START") {
        event.preventDefault();
        startRun({ mode, daily: false });
      } else if (gameState === "GAMEOVER") {
        event.preventDefault();
        restartRun();
      }
    }
  };

  useEffect(() => {
    keyHandlerRef.current = handleKeyDown;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keyHandlerRef.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Auto-pause when the page loses focus; never auto-resume (the player may
  // not be ready), they pick RESUME explicitly.
  useEffect(() => {
    if (gameState !== "PLAYING") return;
    const pauseIfHidden = () => {
      if (document.hidden) applyPaused(true);
    };
    const pauseOnBlur = () => applyPaused(true);
    document.addEventListener("visibilitychange", pauseIfHidden);
    window.addEventListener("blur", pauseOnBlur);
    return () => {
      document.removeEventListener("visibilitychange", pauseIfHidden);
      window.removeEventListener("blur", pauseOnBlur);
    };
  }, [gameState, applyPaused]);

  const modeButtonRefs = useRef<Partial<Record<GameMode, HTMLButtonElement | null>>>({});
  /** WAI-ARIA radio group keys: arrows move and select, Home/End jump. */
  const handleModeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = GAME_MODES.indexOf(mode);
    const last = GAME_MODES.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % GAME_MODES.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + GAME_MODES.length) % GAME_MODES.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    audioManager.playUi("select");
    const next = GAME_MODES[target];
    setMode(next);
    modeButtonRefs.current[next]?.focus();
  };

  const blurTarget = (event: { currentTarget: HTMLElement }) =>
    event.currentTarget.blur();

  const bestFor = (m: GameMode): string => {
    const best = allScores[m][0]?.score;
    return best === undefined ? "BEST --" : `BEST ${best}`;
  };

  /** Best Time Attack medal, derived from the stored top score (no storage). */
  const bestMedal = getMedal(allScores.TIME_ATTACK[0]?.score ?? 0);
  /** The run in progress (or just ended) is a regular Time Attack run. */
  const runHasMedals = hasMedals(mode, dailyKey !== null, runStartWorld > 1);
  const medalTarget = runHasMedals ? getMedalTarget(medalEarned) : null;
  /** One HUD goal at a time (see selectHudGoal): the nearer of best and medal. */
  const hudGoal = selectHudGoal(
    personalBestPassed ? null : personalBestTarget,
    medalTarget,
  );
  const gameOverMedal =
    lastRun && hasMedals(lastRun.mode, lastRun.daily !== null, lastRun.practiceWorld !== null)
      ? getMedalResult(score)
      : null;

  const endInsight = lastRun
    ? getEndInsight(
        lastRun.stats.endReason,
        world,
        lastRun.stats.endMargin,
        lastRun.stats.scoreHistory,
      )
    : null;
  const breakdown = getQualityBreakdown(lastRun?.stats.scoreHistory ?? []);
  /** Stacks made this run (a practice run starts with earlier worlds "done"). */
  const runStackCount = Math.max(
    0,
    (lastRun?.stats.stackCount ?? 0) - stacksBeforeWorld(lastRun?.practiceWorld ?? 1),
  );

  /**
   * Menu sounds via one delegated listener: every button plays "select"
   * unless it declares data-ui-sound (confirm / back / none for buttons with
   * their own feedback). Clicks are user gestures, so this also unlocks audio.
   */
  const handleUiClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement | null)?.closest("button");
    if (!button || button.disabled) return;
    const kind = button.dataset.uiSound ?? "select";
    if (kind === "select" || kind === "confirm" || kind === "back") {
      audioManager.playUi(kind);
    }
  };

  return (
    <div
      className="game-container"
      data-theme={mono ? "mono" : undefined}
      onClickCapture={handleUiClickCapture}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {/* key forces re-announcement of identical consecutive messages */}
        <span key={announcement.id}>{announcement.text}</span>
      </div>
      {gameState === "START" && startPanel === "achievements" && (
        <AchievementsPanel record={achievementRecord} onClose={closeStartPanel} />
      )}
      {gameState === "START" && startPanel === "worlds" && (
        <WorldAtlas
          bestWorld={bestWorldReached}
          reducedFx={reducedFx}
          onPractice={startPracticeFromAtlas}
          onClose={closeStartPanel}
        />
      )}

      {gameState === "START" && (
        <StartBackdrop palette={backdropPalette} flourish={flourishing} />
      )}

      {gameState === "START" && startPanel === null && (
        <button
          ref={settingsTriggerRef}
          className="settings-gear-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          aria-haspopup="dialog"
          inert={settingsSheetVisible}
        >
          <GearIcon />
        </button>
      )}

      {gameState === "START" && startPanel === null && (
        <div className="screen start-screen" inert={settingsSheetVisible}>
          {/* A plain heading for assistive tech: the tap secret is
              pointer-only (React delegates the listener to the root, so the
              heading is not exposed as clickable); keyboards get the arrow
              sequence instead. */}
          <h1 className="title" onClick={handleTitleClick}>
            SHAPE STACK
          </h1>
          <p className="subtitle">Tap to stack. Don't overlap.</p>

          <div
            className="mode-selection"
            role="radiogroup"
            aria-label="Game mode"
            onKeyDown={handleModeKeyDown}
          >
            {GAME_MODES.map((m) => (
              <div className="mode-option" key={m}>
                <button
                  ref={(node) => {
                    modeButtonRefs.current[m] = node;
                  }}
                  className={`mode-btn ${mode === m ? "active" : ""}`}
                  onClick={() => setMode(m)}
                  aria-label={MODE_LABELS[m].aria}
                  role="radio"
                  aria-checked={mode === m}
                  // Roving tabindex: one tab stop for the group, arrows inside.
                  tabIndex={mode === m ? 0 : -1}
                >
                  {MODE_LABELS[m].label}
                </button>
                <span className="mode-best" data-testid={`best-${m}`}>
                  {bestMedal && m === "TIME_ATTACK" && (
                    <MedalGlyph medal={bestMedal} />
                  )}
                  {bestFor(m)}
                  {bestMedal && m === "TIME_ATTACK" && (
                    <span className="visually-hidden">
                      , {MEDAL_LABELS[bestMedal]} medal
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="mode-description" aria-live="polite">
            {MODE_LABELS[mode].description}
          </p>

          {mode === "ZEN" && bestWorldReached > 1 && (
            <div className="practice-picker" role="group" aria-label="Practice start world">
              <button
                className="practice-prev"
                onClick={() => setPracticeWorld(Math.max(1, pickedWorld - 1))}
                disabled={pickedWorld <= 1}
                aria-label="Previous start world"
              >
                ‹
              </button>
              <span className="practice-label" aria-live="polite">
                <span className="practice-world">START AT WORLD {pickedWorld}</span>
                <span className="practice-name">
                  {pickedWorld === 1
                    ? "Full run"
                    : `Practice · ${getWorldConfig(pickedWorld).name ?? ""}`}
                </span>
              </span>
              <button
                className="practice-next"
                onClick={() =>
                  setPracticeWorld(Math.min(bestWorldReached, pickedWorld + 1))
                }
                disabled={pickedWorld >= bestWorldReached}
                aria-label="Next start world"
              >
                ›
              </button>
            </div>
          )}

          <button
            className="start-btn" data-ui-sound="confirm"
            onClick={() => startRun({ mode, daily: false })}
          >
            START
          </button>

          <button
            className="daily-btn" data-ui-sound="confirm"
            onClick={() => startRun({ mode: "CLASSIC", daily: true })}
            aria-label={dailyButton.ariaLabel}
          >
            <span className="daily-btn-title">DAILY CHALLENGE</span>
            <span className="daily-btn-meta">{dailyButton.meta}</span>
            {(dailyButton.streak || dailyButton.next) && (
              <span className="daily-btn-extra">
                {dailyButton.streak && <StreakChip label={dailyButton.streak} />}
                {dailyButton.next && (
                  <span className="daily-next">
                    NEXT CHALLENGE IN <strong>{dailyButton.next.text}</strong>
                  </span>
                )}
              </span>
            )}
          </button>

          <div className="start-secondary">
            <button
              ref={(node) => {
                panelTriggerRefs.current.achievements = node;
              }}
              className="achievements-btn"
              onClick={() => setStartPanel("achievements")}
              aria-label={`Achievements: ${unlockedAchievementCount} of ${ACHIEVEMENT_COUNT} unlocked`}
            >
              ACHIEVEMENTS {unlockedAchievementCount}/{ACHIEVEMENT_COUNT}
            </button>
            <button
              ref={(node) => {
                panelTriggerRefs.current.worlds = node;
              }}
              className="worlds-btn"
              onClick={() => setStartPanel("worlds")}
              aria-label={`Worlds: ${revealedWorldCount} of ${ATLAS_WORLD_COUNT} discovered`}
            >
              WORLDS {revealedWorldCount}/{ATLAS_WORLD_COUNT}
            </button>
          </div>

        </div>
      )}

      {gameState === "PLAYING" && (
        <div
          className="game-screen"
          style={{ width: "100%", height: "100%", ...gameplayThemeVars }}
          inert={settingsSheetVisible}
        >
          <div className="canvas-container">
            <GameCanvas
              key={runId}
              ref={canvasRef}
              mode={mode}
              runSeed={runSeed}
              startWorld={runStartWorld}
              reducedFx={reducedFx}
              mono={mono}
              timingCue={timingCueOn}
              onScore={handleScore}
              onGameOver={handleGameOver}
              onLevelUp={handleLevelUp}
              onWorldUp={handleWorldUp}
              onTimeUpdate={handleTimeUpdate}
              onStyleUpdate={handleStyleUpdate}
              onZenLivesChange={handleZenLivesChange}
              onStack={recordAchievementStack}
              onMiss={handleRunMiss}
              onResumeCountdown={handleResumeCountdown}
            />
          </div>

          <button
            className="pause-btn"
            onClick={(event) => {
              blurTarget(event);
              applyPaused(true);
            }}
            aria-label="Pause game"
          >
            PAUSE
          </button>

          <div className="hud">
            {/* Row 1: the score and the one vital readout (Time Attack timer or
                Zen lives), in a band that reserves the PAUSE corner so they can
                never slide under it (see .hud-top). Everything else lives in
                the always-visible meta row below. */}
            <div className="hud-top">
              <div
                className={`hud-row hud-primary ${
                  personalBestPassed ? `is-record${reducedFx ? " reduced-fx" : ""}` : ""
                }`}
              >
                <span className="score score-readout">{score}</span>
                {mode === "TIME_ATTACK" && timeRemaining !== null && (
                  <span
                    className={`timer-badge ${
                      timeRemaining <= TIMER_CRITICAL_SECONDS ? "critical" : ""
                    }`}
                    role="timer"
                    aria-label={`${Math.ceil(timeRemaining)} seconds left`}
                  >
                    {Math.ceil(timeRemaining)}s
                  </span>
                )}
                {mode === "ZEN" && (
                  <span
                    className={`lives-badge ${(zenLives ?? 0) <= 3 ? "critical" : ""}`}
                  >
                    LIVES {zenLives ?? 0}
                  </span>
                )}
              </div>
            </div>
            <div className="hud-row hud-meta">
              {/* A single goal chip, no earned-medal glyph (the lane pill and
                  the game over carry the medal itself). */}
              {hudGoal?.kind === "best" && (
                <span className="pb-target" data-testid="pb-target">
                  BEST {hudGoal.score}
                </span>
              )}
              {hudGoal?.kind === "medal" && (
                <span
                  key={hudGoal.medal}
                  className={`medal-target medal--${hudGoal.medal.toLowerCase()}${
                    reducedFx ? " reduced-fx" : ""
                  }`}
                  data-testid="medal-target"
                >
                  {MEDAL_LABELS[hudGoal.medal].toUpperCase()} {hudGoal.threshold}
                </span>
              )}
              <span className="world-badge">W {world}</span>
              <span className="level-badge">L {level}</span>
              {dailyKey && <span className="daily-badge">DAILY</span>}
            </div>
            <div
              className={`hud-row hud-secondary ${showSecondaryHud ? "revealed" : "hidden"}`}
              aria-hidden={!showSecondaryHud}
            >
              {mode !== "ZEN" && (
                <>
                  <span className="style-badge">STYLE {styleScore}</span>
                  <span className={`streak-badge ${streak > 1 ? "active" : ""}`}>
                    COMBO x{streak}
                  </span>
                  <span className="best-streak-badge">BEST x{bestStreak}</span>
                </>
              )}
              {mode === "ZEN" && (
                <div className="zen-controls">
                  <button
                    className="restart-btn" data-ui-sound="none"
                    onClick={(event) => {
                      blurTarget(event);
                      handleRestartShape();
                    }}
                    aria-label="Restart current shape"
                  >
                    RESTART
                  </button>
                  <button
                    className="undo-btn" data-ui-sound="none"
                    onClick={(event) => {
                      blurTarget(event);
                      handleUndo();
                    }}
                    aria-label="Undo last stack"
                  >
                    UNDO
                  </button>
                </div>
              )}
            </div>
          </div>

          {paused && (
            <div
              className="pause-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="Game paused"
            >
              <h2 className="pause-title">PAUSED</h2>
              <button
                className="pause-resume-btn" data-ui-sound="confirm"
                onClick={() => applyPaused(false)}
                autoFocus
              >
                RESUME
              </button>
              <button
                className="pause-restart-btn menu-btn" data-ui-sound="confirm"
                onClick={restartRun}
              >
                RESTART
              </button>
              {canFinishRun(mode) && (
                <button
                  className={`pause-finish-btn menu-btn${finishArmed ? " armed" : ""}`}
                  // Armed: the finish cue replaces the generic click.
                  data-ui-sound={finishArmed ? "none" : "select"}
                  onClick={handleFinishPress}
                  onKeyDown={(event) => {
                    // A held Enter repeats clicks: it must not arm and confirm.
                    if (event.repeat && event.key === "Enter") event.preventDefault();
                  }}
                >
                  {finishArmed ? "TAP AGAIN TO FINISH" : "FINISH RUN"}
                </button>
              )}
              <button
                ref={settingsTriggerRef}
                className="pause-settings-btn menu-btn"
                onClick={() => setShowSettings(true)}
                aria-haspopup="dialog"
              >
                <GearIcon />
                SETTINGS
              </button>
              <button className="pause-menu-btn menu-btn" data-ui-sound="back" onClick={handleMainMenu}>
                MAIN MENU
              </button>
            </div>
          )}

          {resumeDigit !== null && (
            // Decorative: the live region announces "Resuming in 3" once.
            // pointer-events: none, so taps reach the (frozen) board and are
            // ignored there like any tap while paused.
            <div
              className="resume-countdown"
              data-testid="resume-countdown"
              aria-hidden="true"
              style={{ "--resume-step": `${RESUME_COUNTDOWN_STEP_MS}ms` } as CSSProperties}
            >
              <span
                key={resumeDigit}
                className={`resume-countdown-digit${reducedFx ? " reduced-fx" : ""}`}
              >
                {resumeDigit}
              </span>
            </div>
          )}

          {showFirstRunHint && !paused && (
            <div className="first-run-hint" role="status">
              <p className="first-run-hint-title">TAP WHEN IT FITS</p>
              <p className="first-run-hint-body">
                Let the shape grow, then tap (or press Space) just before it
                touches the edge. The closer you get, the better:{" "}
                <span className="first-run-hint-perfect">PERFECT</span>.
              </p>
            </div>
          )}

          {lastQuality && (
            <div
              key={`quality-${qualityPulseId}`}
              className={`quality-overlay quality-${lastQuality.toLowerCase()}`}
            >
              {lastQuality}
            </div>
          )}

          {mode === "TIME_ATTACK" &&
            lastQuality &&
            getTimeBonus(lastQuality) > 0 && (
              <div
                key={`bonus-${qualityPulseId}`}
                className="time-bonus-pop"
                aria-hidden="true"
              >
                +{getTimeBonus(lastQuality)}s
              </div>
            )}

          {mode === "TIME_ATTACK" &&
            penaltyPulseId > 0 &&
            TIME_ATTACK_MISS_PENALTY !== undefined && (
              <div
                key={`penalty-${penaltyPulseId}`}
                className="time-penalty-pop danger-signal"
                aria-hidden="true"
              >
                −{TIME_ATTACK_MISS_PENALTY}s
              </div>
            )}

          {missPop && (
            // Decorative: the live region announces the miss and its margin.
            <div
              key={`miss-${missPop.id}`}
              className="miss-pop danger-signal"
              data-testid="miss-pop"
              aria-hidden="true"
            >
              <span className="miss-pop-title">MISS</span>
              {missPop.label && (
                <span className="miss-pop-margin">{missPop.label}</span>
              )}
            </div>
          )}

          {comboBanner.streak > 0 && mode !== "ZEN" && (
            <div
              key={`combo-${comboBanner.id}`}
              className={`combo-milestone combo-tier-${getComboTier(comboBanner.streak)}`}
              role="status"
            >
              COMBO ×{comboBanner.streak}
            </div>
          )}

          {personalBestPassed && personalBestTarget !== null && (
            // Decorative: the live region announces it (no double read-out).
            <div
              className={`record-milestone ${reducedFx ? "reduced-fx" : ""}`}
              data-testid="record-banner"
              aria-hidden="true"
            >
              <span className="record-milestone-title">
                {dailyKey ? "NEW DAILY BEST" : "NEW BEST"}
              </span>
              <span className="record-milestone-sub">PAST {personalBestTarget}</span>
            </div>
          )}

          {runHasMedals && medalEarned && (
            // Decorative: the live region announces it (no double read-out).
            <div
              key={`medal-${medalEarned}`}
              className={`medal-milestone medal--${medalEarned.toLowerCase()}${
                reducedFx ? " reduced-fx" : ""
              }`}
              data-testid="medal-banner"
              aria-hidden="true"
            >
              <MedalGlyph medal={medalEarned} />
              <span className="medal-milestone-text">
                <span className="medal-milestone-title">
                  {MEDAL_LABELS[medalEarned].toUpperCase()} MEDAL
                </span>
                {medalTarget && (
                  <span className="medal-milestone-sub">
                    NEXT {MEDAL_LABELS[medalTarget.medal].toUpperCase()} {medalTarget.threshold}
                  </span>
                )}
              </span>
            </div>
          )}

          {showLevelUp && !showWorldUp && (
            <div className="level-up-overlay">
              <span className="level-up-text">LEVEL {level}</span>
            </div>
          )}
          {showWorldUp && (
            <div className="world-up-overlay" role="status">
              <span className="world-up-title">NEW WORLD</span>
              <span className="world-up-text">WORLD {world}</span>
              {worldConfig.name && (
                <span className="world-up-name">{worldConfig.name}</span>
              )}
              {worldConfig.tagline && (
                <span className="world-up-tagline">{worldConfig.tagline}</span>
              )}
            </div>
          )}
        </div>
      )}

      {gameState === "GAMEOVER" && (
        <GameOverScreen
          run={lastRun}
          mode={mode}
          modeLabel={MODE_LABELS[mode].label}
          score={score}
          world={world}
          level={level}
          topScores={allScores[mode]}
          medal={gameOverMedal}
          stackCount={runStackCount}
          endInsight={endInsight}
          breakdown={breakdown}
          shareStatus={shareStatus}
          dailyStreak={gameOverDaily.streak}
          nextDaily={gameOverDaily.next}
          onShare={handleShare}
          onRetry={restartRun}
          onMenu={handleMainMenu}
        />
      )}

      {settingsSheetVisible && (
        <SettingsSheet
          values={{
            fx: !reducedFx,
            sound: !muted,
            music: musicOn,
            haptics: hapticsOn,
            timingCue: timingCueOn,
          }}
          hapticsSupported={hapticsSupported}
          onToggle={handleToggleSetting}
          onClose={() => setShowSettings(false)}
          returnFocusRef={settingsTriggerRef}
        />
      )}

      <AchievementToaster ref={toasterRef} onShow={playAchievementCue} />
    </div>
  );
}

export default App;
