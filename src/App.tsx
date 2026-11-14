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
import {
  GAME_MODES,
  getAllHighScores,
  saveHighScore,
  getSettings,
  saveSettings,
} from "./utils/storage";
import type { HighScoresByMode } from "./utils/storage";
import type { GameMode, RunStats, StyleUpdate, StackQuality } from "./types";
import { getWorldTheme } from "./visual/theme";
import { LEVELS_PER_WORLD, ZEN_MAX_LIVES } from "./constants/game";
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
    description: "60 s, perfects add +5 s.",
  },
};

interface LastRun {
  mode: GameMode;
  isNewBest: boolean;
  stats: RunStats;
  scores: HighScoresByMode[GameMode];
}

const EMPTY_STATS: RunStats = { stackCount: 0, perfectCount: 0, bestStreak: 0 };

/** True when the key event came from a control that handles Space/Enter itself. */
const isInteractiveTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  target.closest("button, a, input, select, textarea, [role='button']") !== null;
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
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [runSeed, setRunSeed] = useState(0);
  const [reducedFx, setReducedFx] = useState(() => getSettings().reducedFx);
  const [muted, setMuted] = useState(() => {
    const initial = getSettings().muted;
    audioManager.setMuted(initial);
    return initial;
  });
  const [styleScore, setStyleScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [zenLives, setZenLives] = useState<number | null>(null);
  const [showSecondaryHud, setShowSecondaryHud] = useState(false);
  const [lastQuality, setLastQuality] = useState<StackQuality | null>(null);
  const [qualityPulseId, setQualityPulseId] = useState(0);
  const canvasRef = useRef<GameCanvasHandle>(null);
  const secondaryHudTimeoutRef = useRef<number | null>(null);
  const previousZenLivesRef = useRef<number | null>(null);
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

  const startGame = (selectedMode: GameMode = mode) => {
    const initialZenLives = selectedMode === "ZEN" ? ZEN_MAX_LIVES : null;

    setMode(selectedMode);
    setPaused(false);
    setLastRun(null);
    setRunId((current) => current + 1);
    audioManager.init();
    audioManager.resume();
    setRunSeed(createRunSeed());
    setScore(0);
    setStyleScore(0);
    setStreak(0);
    setBestStreak(0);
    setZenLives(initialZenLives);
    previousZenLivesRef.current = initialZenLives;
    setLastQuality(null);
    setQualityPulseId(0);
    setLevel(1);
    setWorld(1);
    setTimeRemaining(null);
    setGameState("PLAYING");
    revealSecondaryHud();
  };

  const handleGameOver = useCallback(
    (
      finalScore: number,
      finalWorld: number,
      finalLevel: number,
      stats: RunStats = EMPTY_STATS
    ) => {
      const { scores, isNewBest } = saveHighScore(finalScore, mode);
      setAllScores((current) => ({ ...current, [mode]: scores }));
      setLastRun({ mode, isNewBest, stats, scores });
      setPaused(false);
      setScore(finalScore);
      setWorld(finalWorld);
      setLevel(finalLevel);
      clearSecondaryHudTimeout();
      setShowSecondaryHud(false);
      setGameState("GAMEOVER");
    },
    [clearSecondaryHudTimeout, mode]
  );

  const handleScore = useCallback((newScore: number) => {
    setScore(newScore);
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
    setTimeout(() => setShowWorldUp(false), 1400);
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

  const applyPaused = useCallback((next: boolean) => {
    setPaused(next);
    canvasRef.current?.setPaused(next);
  }, []);

  const handleRestartShape = () => {
    canvasRef.current?.restartShape();
    revealSecondaryHud();
  };

  const handleUndo = () => {
    canvasRef.current?.undo();
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

  const handleMainMenu = () => {
    setPaused(false);
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

    if (event.key === "Enter" && !event.repeat && !isInteractiveTarget(event.target)) {
      if (gameState === "START" || gameState === "GAMEOVER") {
        event.preventDefault();
        startGame(mode);
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

  return (
    <div className="game-container">
      {gameState === "START" && (
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

          <button className="start-btn" onClick={() => startGame(mode)}>
            START
          </button>
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
              reducedFx={reducedFx}
              onScore={handleScore}
              onGameOver={handleGameOver}
              onLevelUp={handleLevelUp}
              onWorldUp={handleWorldUp}
              onTimeUpdate={handleTimeUpdate}
              onStyleUpdate={handleStyleUpdate}
              onZenLivesChange={handleZenLivesChange}
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
              {mode === "TIME_ATTACK" && timeRemaining !== null && (
                <span className="timer-badge">{Math.ceil(timeRemaining)}s</span>
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
              <button
                className="fx-toggle-btn"
                onClick={(event) => {
                  blurTarget(event);
                  handleToggleReducedFx();
                }}
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
                onClick={(event) => {
                  blurTarget(event);
                  handleToggleMute();
                }}
                aria-label="Mute sound"
                aria-pressed={muted}
              >
                {muted ? "SOUND: OFF" : "SOUND: ON"}
              </button>
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
                onClick={() => startGame(mode)}
              >
                RESTART
              </button>
              <button className="pause-menu-btn menu-btn" onClick={handleMainMenu}>
                MAIN MENU
              </button>
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

          {showLevelUp && !showWorldUp && (
            <div className="level-up-overlay">
              <span className="level-up-text">LEVEL {level}</span>
            </div>
          )}
          {showWorldUp && (
            <div className="world-up-overlay">
              <span className="world-up-title">NEW WORLD</span>
              <span className="world-up-text">WORLD {world}</span>
            </div>
          )}
        </div>
      )}

      {gameState === "GAMEOVER" && (
        <div className="screen gameover-screen">
          <h1 className="title">GAME OVER</h1>
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
                <dd className="stat-stacks">{lastRun?.stats.stackCount ?? 0}</dd>
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
          <button className="retry-btn" onClick={() => startGame(mode)}>
            RETRY
          </button>
          <button className="menu-btn" onClick={handleMainMenu}>
            MAIN MENU
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
