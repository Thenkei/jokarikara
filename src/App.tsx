import { useState, useCallback, useRef } from "react";
import { GameCanvas, type GameCanvasHandle } from "./components/GameCanvas";
import { audioManager } from "./utils/audioManager";
import { getHighScores, saveHighScore } from "./utils/storage";
import type { HighScore } from "./utils/storage";
import type { GameMode } from "./types";
import "./App.css";

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
  const canvasRef = useRef<GameCanvasHandle>(null);

  const startGame = (selectedMode: GameMode = mode) => {
    setMode(selectedMode);
    audioManager.init();
    audioManager.resume();
    setScore(0);
    setLevel(1);
    setWorld(1);
    setTimeRemaining(null);
    setGameState("PLAYING");
  };

  const handleGameOver = useCallback(
    (finalScore: number, finalWorld: number, finalLevel: number) => {
      // Calculated score = world * 5 + level
      const progressionScore = finalWorld * 5 + finalLevel;
      saveHighScore(progressionScore);
      setHighScores(getHighScores());
      setScore(finalScore);
      setWorld(finalWorld);
      setLevel(finalLevel);
      setGameState("GAMEOVER");
    },
    []
  );

  const handleScore = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  const handleLevelUp = useCallback((newLevel: number) => {
    setLevel(newLevel);
    setShowLevelUp(true);
    setTimeout(() => setShowLevelUp(false), 1500);
  }, []);

  const handleWorldUp = useCallback((newWorld: number) => {
    setWorld(newWorld);
    setLevel(1);
    setShowWorldUp(true);
    setTimeout(() => setShowWorldUp(false), 2000);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setTimeRemaining(time);
  }, []);

  const handleRestartShape = () => {
    canvasRef.current?.restartShape();
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
        <div className="game-screen" style={{ width: "100%", height: "100%" }}>
          <div className="canvas-container">
            <GameCanvas
              ref={canvasRef}
              mode={mode}
              onScore={handleScore}
              onGameOver={handleGameOver}
              onLevelUp={handleLevelUp}
              onWorldUp={handleWorldUp}
              onTimeUpdate={handleTimeUpdate}
            />
          </div>

          <div className="hud">
            <div className="hud-row">
              <span className="world-badge">WORLD {world}</span>
              <span className="level-badge">LVL {level}</span>
              {mode === "TIME_ATTACK" && timeRemaining !== null && (
                <span className="timer-badge">{Math.ceil(timeRemaining)}s</span>
              )}
            </div>
            <div className="hud-row main-hud">
              <span className="score">{score}</span>
              {mode === "ZEN" && (
                <button className="restart-btn" onClick={handleRestartShape}>
                  RESTART
                </button>
              )}
            </div>
          </div>

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
              Progression: {world * 5 + level}
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
          <button className="menu-btn" onClick={() => setGameState("START")}>
            MAIN MENU
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
