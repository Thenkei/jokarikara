import { useState } from "react";
import { GameCanvas } from "./components/GameCanvas";
import { audioManager } from "./utils/audioManager";
import "./App.css";

function App() {
  const [gameState, setGameState] = useState<"START" | "PLAYING" | "GAMEOVER">(
    "START"
  );
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [showLevelUp, setShowLevelUp] = useState(false);

  const startGame = () => {
    audioManager.init();
    audioManager.resume();
    setScore(0);
    setLevel(1);
    setGameState("PLAYING");
  };

  const handleGameOver = (finalScore: number) => {
    setScore(finalScore);
    setGameState("GAMEOVER");
  };

  const handleScore = (newScore: number) => {
    setScore(newScore);
  };

  const handleLevelUp = (newLevel: number) => {
    setLevel(newLevel);
    setShowLevelUp(true);
    setTimeout(() => setShowLevelUp(false), 1500);
  };

  return (
    <div className={`game-container ${level >= 5 ? "world-2" : ""}`}>
      {gameState === "START" && (
        <div className="screen start-screen">
          <h1 className="title">SHAPE STACK</h1>
          <p className="subtitle">Tap to stack. Don't overlap.</p>
          <button className="start-btn" onClick={startGame}>
            START
          </button>
        </div>
      )}

      {gameState === "PLAYING" && (
        <div className="game-screen" style={{ width: "100%", height: "100%" }}>
          <div className="hud">
            <div className="hud-row">
              <span className="level-badge">LVL {level}</span>
            </div>
            <span className="score">{score}</span>
          </div>
          {showLevelUp && (
            <div className="level-up-overlay">
              <span className="level-up-text">LEVEL {level}</span>
            </div>
          )}
          <div className="canvas-container">
            <GameCanvas
              onScore={handleScore}
              onGameOver={handleGameOver}
              onLevelUp={handleLevelUp}
            />
          </div>
        </div>
      )}

      {gameState === "GAMEOVER" && (
        <div className="screen gameover-screen">
          <h1 className="title">GAME OVER</h1>
          <div className="final-stats">
            <p className="final-level">Level {level}</p>
            <p className="score-display">Score: {score}</p>
          </div>
          <button className="retry-btn" onClick={startGame}>
            RETRY
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
