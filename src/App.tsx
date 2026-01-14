import { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { audioManager } from './utils/audioManager';
import './App.css';

function App() {
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAMEOVER'>('START');
  const [score, setScore] = useState(0);

  const startGame = () => {
    audioManager.init();
    audioManager.resume();
    setScore(0);
    setGameState('PLAYING');
  };

  const handleGameOver = (finalScore: number) => {
    setScore(finalScore);
    setGameState('GAMEOVER');
  };

  const handleScore = (newScore: number) => {
    setScore(newScore);
  };

  return (
    <div className="game-container">
      {gameState === 'START' && (
        <div className="screen start-screen">
          <h1 className="title">SHAPE STACK</h1>
          <p className="subtitle">Tap to stack. Don't overlap.</p>
          <button className="start-btn" onClick={startGame}>START</button>
        </div>
      )}

      {gameState === 'PLAYING' && (
        <div className="game-screen" style={{ width: '100%', height: '100%' }}>
          <div className="hud">
            <span className="score">{score}</span>
          </div>
          <div className="canvas-container">
            <GameCanvas onScore={handleScore} onGameOver={handleGameOver} />
          </div>
        </div>
      )}

      {gameState === 'GAMEOVER' && (
        <div className="screen gameover-screen">
          <h1 className="title">GAME OVER</h1>
          <p className="score-display" style={{fontSize: '2rem', marginBottom: '2rem'}}>Score: {score}</p>
          <button className="retry-btn" onClick={startGame}>RETRY</button>
        </div>
      )}
    </div>
  );
}

export default App;
