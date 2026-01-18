import { useState } from "react";
import { GameCanvas } from "./components/GameCanvas";
import { audioManager } from "./utils/audioManager";
import { getHighScores, saveHighScore } from "./utils/storage";
import type { HighScore } from "./utils/storage";
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

  const startGame = () => {
    audioManager.init();
    audioManager.resume();
    setScore(0);
    setLevel(1);
    setWorld(1);
    setGameState("PLAYING");
  };

  const handleGameOver = (finalScore: number) => {
    // Calculated score = world * 5 + level
    const progressionScore = world * 5 + level;
    saveHighScore(progressionScore);
    setHighScores(getHighScores());
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

  const handleWorldUp = (newWorld: number) => {
    setWorld(newWorld);
    setLevel(1);
    setShowWorldUp(true);
    setTimeout(() => setShowWorldUp(false), 2000);
  };

  return (
    <div className="game-container">
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
              <span className="world-badge">WORLD {world}</span>
              <span className="level-badge">LVL {level}</span>
            </div>
            <span className="score">{score}</span>
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
          <div className="canvas-container">
            <GameCanvas
              onScore={handleScore}
              onGameOver={handleGameOver}
              onLevelUp={handleLevelUp}
              onWorldUp={handleWorldUp}
            />
          </div>
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
          <button className="retry-btn" onClick={startGame}>
            RETRY
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
