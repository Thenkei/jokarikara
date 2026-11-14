import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type CSSProperties,
} from "react";
import { GameCanvas, type GameCanvasHandle } from "./components/GameCanvas";
import { audioManager } from "./utils/audioManager";
import { installAudioTestBridge } from "./utils/testBridge";
import {
  GAME_MODES,
  getAllHighScores,
  saveHighScore,
  getSettings,
  saveSettings,
  getDailyRecord,
  saveDailyResult,
} from "./utils/storage";
import type { HighScoresByMode } from "./utils/storage";
import type { GameMode, RunStats, StyleUpdate, StackQuality } from "./types";
import { getWorldPalette, getWorldTheme } from "./visual/theme";
import { StartBackdrop } from "./components/StartBackdrop";
import { getTimeBonus } from "./core/gameState";
import {
  getEndInsight,
  getQualityBreakdown,
  QUALITY_ORDER,
} from "./modes/runInsights";
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
  formatDailyLabel,
  getDailySeed,
  getLocalDateKey,
  qualitiesFromScoreHistory,
} from "./modes/daily";
import {
  ACHIEVEMENT_COUNT,
  countUnlocked,
  getAchievement,
  type AchievementId,
} from "./progression/achievements";
import { useAchievements } from "./progression/useAchievements";
import {
  AchievementToaster,
  type AchievementToasterHandle,
} from "./components/AchievementToaster";
import { AchievementsPanel } from "./components/AchievementsPanel";
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

const HUD_REVEAL_DURATION_MS = 2000;
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

interface DailyRunResult {
  dateKey: string;
  best: number;
  attempts: number;
}

interface LastRun {
  mode: GameMode;
  /** World a practice run started at; null for regular runs. */
  practiceWorld: number | null;
  isNewBest: boolean;
  stats: RunStats;
  scores: HighScoresByMode[GameMode];
  daily: DailyRunResult | null;
  /** Unlocked during this run (live and at game over). */
  achievements: readonly AchievementId[];
}

type ShareStatus = "idle" | "copied" | "shared" | "failed";

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
/** Stacks a regular run has made when it reaches `world`. */
const stacksBeforeWorld = (world: number): number =>
  (Math.max(1, world) - 1) * STACKS_PER_LEVEL * LEVELS_PER_WORLD;

const getProgressionScore = (world: number, level: number): number =>
  (world - 1) * LEVELS_PER_WORLD + level;

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
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [paused, setPaused] = useState(false);
  const [runId, setRunId] = useState(0);
  const [mode, setMode] = useState<GameMode>("CLASSIC");
  /** Date key of the running Daily Challenge, null for a regular run. */
  const [dailyKey, setDailyKey] = useState<string | null>(null);
  /** Zen practice: world picked on the start screen (1 = regular run). */
  const [practiceWorld, setPracticeWorld] = useState(1);
  /** World the current run started at (drives <GameCanvas startWorld>). */
  const [runStartWorld, setRunStartWorld] = useState(1);
  const [todayRecord, setTodayRecord] = useState(() =>
    getDailyRecord(getLocalDateKey())
  );
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
  const [styleScore, setStyleScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [zenLives, setZenLives] = useState<number | null>(null);
  const [showSecondaryHud, setShowSecondaryHud] = useState(false);
  const [lastQuality, setLastQuality] = useState<StackQuality | null>(null);
  const [qualityPulseId, setQualityPulseId] = useState(0);
  /** Bumped on each Time Attack miss to replay the "-Ns" pop. */
  const [penaltyPulseId, setPenaltyPulseId] = useState(0);
  const [showAchievements, setShowAchievements] = useState(false);
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
  } = useAchievements({ onUnlock: handleAchievementUnlock });
  const unlockedAchievementCount = countUnlocked(achievementRecord.unlocked);

  const handleRunMiss = useCallback(
    (terminal: boolean) => {
      recordAchievementMiss(terminal);
      // A non-terminal Time Attack miss costs time: show the penalty.
      if (!terminal && mode === "TIME_ATTACK" && TIME_ATTACK_MISS_PENALTY !== undefined) {
        setPenaltyPulseId((current) => current + 1);
      }
    },
    [recordAchievementMiss, mode],
  );
  const bestWorldReached = achievementRecord.lifetime.bestWorld;
  /**
   * First-ever run: nothing played or stacked yet. Lifetime stats commit at
   * run end, so the in-run flag below hides the hint at the first stack.
   */
  const isNewPlayer =
    achievementRecord.lifetime.runsPlayed === 0 &&
    achievementRecord.lifetime.totalStacks === 0;
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
    () => getWorldPalette(1, 0, reducedFx),
    [reducedFx]
  );
  const worldTheme = useMemo(
    () => getWorldTheme(world, runSeed, reducedFx),
    [world, runSeed, reducedFx]
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
  }: {
    mode: GameMode;
    daily: boolean;
  }) => {
    // The Daily Challenge always uses Classic rules.
    const runMode: GameMode = daily ? "CLASSIC" : selectedMode;
    const initialZenLives = runMode === "ZEN" ? ZEN_MAX_LIVES : null;
    const todayKey = daily ? getLocalDateKey() : null;
    // Only Zen offers practice from a later world.
    const startWorld = runMode === "ZEN" && !daily ? pickedWorld : 1;
    const practice = startWorld > 1;

    // Commits a run left from the pause menu (RESTART) before starting anew.
    beginAchievementRun(runMode, todayKey, { practice });
    setRunStartWorld(startWorld);
    setShowAchievements(false);
    setMode(runMode);
    setDailyKey(todayKey);
    setShareStatus("idle");
    setPaused(false);
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
        setTodayRecord({ best: result.best, attempts: result.attempts });
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
      setScore(finalScore);
      setWorld(finalWorld);
      setLevel(finalLevel);
      clearSecondaryHudTimeout();
      setShowSecondaryHud(false);
      setGameState("GAMEOVER");
    },
    [
      clearSecondaryHudTimeout,
      mode,
      dailyKey,
      runStartWorld,
      allScores,
      finishAchievementRun,
    ]
  );

  const handleScore = useCallback((newScore: number) => {
    setScore(newScore);
    setHasStackedThisRun(true);
    revealSecondaryHud();
  }, [revealSecondaryHud]);

  const handleLevelUp = useCallback((newLevel: number) => {
    setLevel(newLevel);
    setShowLevelUp(true);
    setTimeout(() => setShowLevelUp(false), 1100);
    revealSecondaryHud();
  }, [revealSecondaryHud]);

  const handleWorldUp = useCallback((newWorld: number) => {
    setWorld(newWorld);
    setLevel(1);
    setShowWorldUp(true);
    setTimeout(() => setShowWorldUp(false), WORLD_INTRO_MS);
    revealSecondaryHud();
  }, [revealSecondaryHud]);

  const handleTimeUpdate = useCallback((time: number) => {
    setTimeRemaining(time);
  }, []);

  const handleStyleUpdate = useCallback((style: StyleUpdate) => {
    setStyleScore(style.styleScore);
    setStreak(style.streak);
    setBestStreak(style.bestStreak);
    setLastQuality(style.lastStackQuality);
    if (style.lastStackQuality) {
      setQualityPulseId((current) => current + 1);
    }
  }, []);

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

  const applyPaused = useCallback(
    (next: boolean) => {
      setPaused(next);
      canvasRef.current?.setPaused(next);
      // Paused time does not count towards play-time achievements.
      setAchievementsPaused(next);
    },
    [setAchievementsPaused]
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

  const handleShare = async () => {
    if (!lastRun?.daily) return;
    const text = buildDailyShareText({
      dateKey: lastRun.daily.dateKey,
      score,
      world,
      level,
      stackCount: lastRun.stats.stackCount,
      qualities: qualitiesFromScoreHistory(lastRun.stats.scoreHistory),
    });
    setShareStatus(await shareText(text));
  };

  const handleMainMenu = () => {
    // No-op after a game over (already committed); counts an abandoned run.
    abandonAchievementRun();
    setPaused(false);
    setDailyKey(null);
    setTodayRecord(getDailyRecord(getLocalDateKey()));
    clearSecondaryHudTimeout();
    setShowSecondaryHud(false);
    setZenLives(null);
    previousZenLivesRef.current = null;
    setShowLevelUp(false);
    setShowWorldUp(false);
    setGameState("START");
  };

  // Latest-callback ref so the window listeners below are bound once per phase
  // instead of being torn down on every render.
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

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

    if (gameState === "START" && showAchievements) {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowAchievements(false);
      }
      // Enter must not start a run from behind the panel.
      return;
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

  const blurTarget = (event: { currentTarget: HTMLElement }) =>
    event.currentTarget.blur();

  const bestFor = (m: GameMode): string => {
    const best = allScores[m][0]?.score;
    return best === undefined ? "BEST --" : `BEST ${best}`;
  };

  /**
   * Preferences live in the pause menu and on the start screen, not in the
   * in-game HUD: they are not gameplay info, and on phones the extra pills
   * overflowed the HUD row.
   */
  const renderSettings = (variant: "pause" | "start") => (
    <div
      className={`settings-row settings-row--${variant}`}
      role="group"
      aria-label="Settings"
    >
      <button
        className="fx-toggle-btn"
        onClick={handleToggleReducedFx}
        aria-label={
          reducedFx
            ? "Visual effects: low. Switch to full"
            : "Visual effects: full. Switch to low"
        }
      >
        {reducedFx ? "FX: LOW" : "FX: FULL"}
      </button>
      <button
        className="mute-toggle-btn"
        onClick={handleToggleMute}
        aria-label="Mute sound"
        aria-pressed={muted}
      >
        {muted ? "SOUND: OFF" : "SOUND: ON"}
      </button>
      <button
        className="music-toggle-btn"
        onClick={handleToggleMusic}
        aria-label="Background music"
        aria-pressed={musicOn}
      >
        {musicOn ? "MUSIC: ON" : "MUSIC: OFF"}
      </button>
    </div>
  );

  const endInsight = lastRun ? getEndInsight(lastRun.stats.endReason, world) : null;
  const breakdown = getQualityBreakdown(lastRun?.stats.scoreHistory ?? []);
  const breakdownTotal = QUALITY_ORDER.reduce((sum, q) => sum + breakdown[q], 0);

  return (
    <div className="game-container">
      {gameState === "START" && showAchievements && (
        <AchievementsPanel
          record={achievementRecord}
          onClose={() => setShowAchievements(false)}
        />
      )}

      {gameState === "START" && <StartBackdrop palette={backdropPalette} />}

      {gameState === "START" && !showAchievements && (
        <div className="screen start-screen">
          <h1 className="title">SHAPE STACK</h1>
          <p className="subtitle">Tap to stack. Don't overlap.</p>

          <div className="mode-selection" role="group" aria-label="Game mode">
            {GAME_MODES.map((m) => (
              <div className="mode-option" key={m}>
                <button
                  className={`mode-btn ${mode === m ? "active" : ""}`}
                  onClick={() => setMode(m)}
                  aria-label={MODE_LABELS[m].aria}
                  aria-pressed={mode === m}
                >
                  {MODE_LABELS[m].label}
                </button>
                <span className="mode-best" data-testid={`best-${m}`}>
                  {bestFor(m)}
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
            className="start-btn"
            onClick={() => startRun({ mode, daily: false })}
          >
            START
          </button>

          <button
            className="daily-btn"
            onClick={() => startRun({ mode: "CLASSIC", daily: true })}
            aria-label={`Daily challenge for ${formatDailyLabel(getLocalDateKey())}. Same shapes for everyone today.`}
          >
            <span className="daily-btn-title">DAILY CHALLENGE</span>
            <span className="daily-btn-meta">
              {formatDailyLabel(getLocalDateKey())} ·{" "}
              {todayRecord.attempts > 0
                ? `BEST ${todayRecord.best} · ${todayRecord.attempts} ${todayRecord.attempts === 1 ? "TRY" : "TRIES"}`
                : "NOT PLAYED"}
            </span>
          </button>

          <button
            className="achievements-btn"
            onClick={() => setShowAchievements(true)}
            aria-label={`Achievements: ${unlockedAchievementCount} of ${ACHIEVEMENT_COUNT} unlocked`}
          >
            ACHIEVEMENTS {unlockedAchievementCount}/{ACHIEVEMENT_COUNT}
          </button>

          {renderSettings("start")}
        </div>
      )}

      {gameState === "PLAYING" && (
        <div
          className="game-screen"
          style={{ width: "100%", height: "100%", ...gameplayThemeVars }}
        >
          <div className="canvas-container">
            <GameCanvas
              key={runId}
              ref={canvasRef}
              mode={mode}
              runSeed={runSeed}
              startWorld={runStartWorld}
              reducedFx={reducedFx}
              onScore={handleScore}
              onGameOver={handleGameOver}
              onLevelUp={handleLevelUp}
              onWorldUp={handleWorldUp}
              onTimeUpdate={handleTimeUpdate}
              onStyleUpdate={handleStyleUpdate}
              onZenLivesChange={handleZenLivesChange}
              onStack={recordAchievementStack}
              onMiss={handleRunMiss}
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
            <div className="hud-row hud-primary">
              <span className="score score-readout">{score}</span>
              <span className="world-badge">W {world}</span>
              <span className="level-badge">L {level}</span>
              {dailyKey && <span className="daily-badge">DAILY</span>}
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
                    className="restart-btn"
                    onClick={(event) => {
                      blurTarget(event);
                      handleRestartShape();
                    }}
                    aria-label="Restart current shape"
                  >
                    RESTART
                  </button>
                  <button
                    className="undo-btn"
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
                className="pause-resume-btn"
                onClick={() => applyPaused(false)}
                autoFocus
              >
                RESUME
              </button>
              <button
                className="pause-restart-btn menu-btn"
                onClick={restartRun}
              >
                RESTART
              </button>
              <button className="pause-menu-btn menu-btn" onClick={handleMainMenu}>
                MAIN MENU
              </button>
              {renderSettings("pause")}
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
                className="time-penalty-pop"
                aria-hidden="true"
              >
                −{TIME_ATTACK_MISS_PENALTY}s
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
        <div className="screen gameover-screen">
          <h1 className="title">GAME OVER</h1>
          {lastRun?.practiceWorld && (
            <p className="practice-result-label">
              PRACTICE · FROM WORLD {lastRun.practiceWorld}
            </p>
          )}
          {lastRun?.daily && (
            <p className="daily-result-label">
              DAILY · {formatDailyLabel(lastRun.daily.dateKey)}
            </p>
          )}
          {lastRun?.isNewBest && (
            <div className="new-best-badge" role="status">
              NEW BEST
            </div>
          )}
          <div className="final-stats">
            <p className="final-level">
              World {world} - Level {level}
            </p>
            <p className="score-display">Total Score: {score}</p>
            <p className="progression-score">
              Progression: {getProgressionScore(world, level)}
            </p>
            <dl className="run-stats">
              <div>
                <dt>STACKS</dt>
                <dd className="stat-stacks">
                  {Math.max(
                    0,
                    (lastRun?.stats.stackCount ?? 0) -
                      stacksBeforeWorld(lastRun?.practiceWorld ?? 1),
                  )}
                </dd>
              </div>
              <div>
                <dt>PERFECT</dt>
                <dd className="stat-perfect">{lastRun?.stats.perfectCount ?? 0}</dd>
              </div>
              {mode !== "ZEN" && (
                <div>
                  <dt>BEST COMBO</dt>
                  <dd className="stat-combo">x{lastRun?.stats.bestStreak ?? 0}</dd>
                </div>
              )}
            </dl>
          </div>
          {endInsight && (
            <div className="end-insight" role="status">
              <p className="end-insight-title">{endInsight.title}</p>
              <p className="end-insight-tip">{endInsight.tip}</p>
            </div>
          )}
          {breakdownTotal > 0 && (
            <div className="quality-breakdown" aria-label="Stack quality breakdown">
              <div className="quality-breakdown-bar" aria-hidden="true">
                {QUALITY_ORDER.map((q) =>
                  breakdown[q] > 0 ? (
                    <span
                      key={q}
                      className={`quality-segment quality-segment--${q.toLowerCase()}`}
                      style={{ flexGrow: breakdown[q] }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="quality-breakdown-legend">
                {QUALITY_ORDER.map((q) => (
                  <li key={q} className={`quality-legend--${q.toLowerCase()}`}>
                    {q} <strong>{breakdown[q]}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lastRun && lastRun.achievements.length > 0 && (
            <div className="run-achievements">
              <h3>UNLOCKED THIS RUN</h3>
              <ul>
                {lastRun.achievements.map((id) => (
                  <li key={id}>{getAchievement(id).title}</li>
                ))}
              </ul>
            </div>
          )}
          {lastRun?.practiceWorld ? (
            <div className="leaderboard practice-summary">
              <h3>PRACTICE RUN</h3>
              <p>Practice runs don't count toward scores or achievements.</p>
            </div>
          ) : lastRun?.daily ? (
            <div className="leaderboard daily-summary">
              <h3>TODAY</h3>
              <p className="daily-summary-line">
                BEST <strong>{lastRun.daily.best}</strong> ·{" "}
                {lastRun.daily.attempts}{" "}
                {lastRun.daily.attempts === 1 ? "TRY" : "TRIES"}
              </p>
              <button className="share-btn" onClick={handleShare}>
                SHARE RESULT
              </button>
              <p className="share-status" role="status">
                {shareStatus === "copied" && "Copied to clipboard"}
                {shareStatus === "shared" && "Shared!"}
                {shareStatus === "failed" && "Sharing unavailable"}
              </p>
            </div>
          ) : (
          <div className="leaderboard">
            <h3>TOP SCORES - {MODE_LABELS[mode].label}</h3>
            {allScores[mode].length === 0 ? (
              <p>No high scores yet!</p>
            ) : (
              <ul>
                {allScores[mode].map((hs, idx) => (
                  <li
                    key={idx}
                    className={
                      lastRun?.isNewBest && idx === 0 ? "current-best" : undefined
                    }
                  >
                    <span>#{idx + 1}</span>
                    <span>{hs.score}</span>
                    <span>{hs.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}
          <button className="retry-btn" onClick={restartRun}>
            RETRY
          </button>
          <button className="menu-btn" onClick={handleMainMenu}>
            MAIN MENU
          </button>
        </div>
      )}

      <AchievementToaster ref={toasterRef} onShow={playAchievementCue} />
    </div>
  );
}

export default App;
