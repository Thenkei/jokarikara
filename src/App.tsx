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
  getHighScores,
  saveHighScore,
  getSettings,
  saveSettings,
} from "./utils/storage";
import type { HighScore } from "./utils/storage";
import type { GameMode, StyleUpdate, StackQuality } from "./types";
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
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  const [mode, setMode] = useState<GameMode>("CLASSIC");
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [runSeed, setRunSeed] = useState(0);
  const [reducedFx, setReducedFx] = useState(() => getSettings().reducedFx);
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
    (finalScore: number, finalWorld: number, finalLevel: number) => {
      saveHighScore(finalScore);
      setHighScores(getHighScores());
      setScore(finalScore);
      setWorld(finalWorld);
      setLevel(finalLevel);
      clearSecondaryHudTimeout();
      setShowSecondaryHud(false);
      setGameState("GAMEOVER");
    },
    [clearSecondaryHudTimeout]
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

  const handleMainMenu = () => {
    clearSecondaryHudTimeout();
    setShowSecondaryHud(false);
    setZenLives(null);
    previousZenLivesRef.current = null;
    setShowLevelUp(false);
    setShowWorldUp(false);
    setGameState("START");
  };

  return (
    <div className="game-container">
      {gameState === "START" && (
        <div className="screen start-screen">
          <h1 className="title">SHAPE STACK</h1>
          <p className="subtitle">Tap to stack. Don't overlap.</p>

          <div className="mode-selection">
            <button
              className={`mode-btn ${mode === "CLASSIC" ? "active" : ""}`}
              onClick={() => setMode("CLASSIC")}
            >
              CLASSIC
            </button>
            <button
              className={`mode-btn ${mode === "ZEN" ? "active" : ""}`}
              onClick={() => setMode("ZEN")}
            >
              ZEN
            </button>
            <button
              className={`mode-btn ${mode === "TIME_ATTACK" ? "active" : ""}`}
              onClick={() => setMode("TIME_ATTACK")}
            >
              TIME
            </button>
          </div>

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
                  <button className="restart-btn" onClick={handleRestartShape}>
                    RESTART
                  </button>
                  <button className="undo-btn" onClick={handleUndo}>
                    UNDO
                  </button>
                </div>
              )}
              <button className="fx-toggle-btn" onClick={handleToggleReducedFx}>
                {reducedFx ? "FX: LOW" : "FX: FULL"}
              </button>
            </div>
          </div>

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
          <div className="final-stats">
            <p className="final-level">
              World {world} - Level {level}
            </p>
            <p className="score-display">Total Score: {score}</p>
            <p className="progression-score">
              Progression: {getProgressionScore(world, level)}
            </p>
          </div>
          <div className="leaderboard">
            <h3>TOP SCORES</h3>
            {highScores.length === 0 ? (
              <p>No high scores yet!</p>
            ) : (
              <ul>
                {highScores.slice(0, 3).map((hs, idx) => (
                  <li key={idx}>
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
