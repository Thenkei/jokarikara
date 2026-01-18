import { useRef, useEffect, useCallback } from "react";
import { audioManager as defaultAudioManager } from "../utils/audioManager";
import type { IAudioService } from "../audio/types";
import type { GameState } from "../types";
import {
  createInitialState,
  spawnActiveShape,
  updateActiveShape,
  updateZoom,
  updateShapeRotations,
  updateShapeOpacities,
  stackActiveShape,
  setGameOver,
  checkContainment,
} from "../core/gameState";
import { getWorldMechanics } from "../constants/game";
import {
  drawShape,
  drawBackground,
  clearCanvas,
} from "../rendering/shapeRenderer";

interface GameCanvasProps {
  onScore: (score: number) => void;
  onGameOver: (finalScore: number, world: number, level: number) => void;
  onLevelUp: (level: number) => void;
  onWorldUp: (world: number) => void;
  /** Optional audio service for dependency injection (testing) */
  audioService?: IAudioService;
}

/**
 * GameCanvas - Orchestrates the game loop and React lifecycle.
 * Delegates to extracted modules for state, rendering, and audio.
 */
export const GameCanvas = ({
  onScore,
  onGameOver,
  onLevelUp,
  onWorldUp,
  audioService = defaultAudioManager,
}: GameCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const lastTimeRef = useRef(0);

  // Initialize game state
  useEffect(() => {
    const viewportSize = Math.min(window.innerWidth, window.innerHeight);
    const initialState = createInitialState(viewportSize);
    stateRef.current = spawnActiveShape(initialState);
  }, []);

  const endGame = useCallback(() => {
    if (!stateRef.current) return;
    stateRef.current = setGameOver(stateRef.current);
    audioService.playFailSound();
    onGameOver(
      stateRef.current.score,
      stateRef.current.world,
      stateRef.current.level
    );
  }, [onGameOver, audioService]);

  const handleTap = useCallback(() => {
    if (
      !stateRef.current ||
      stateRef.current.isGameOver ||
      !stateRef.current.activeShape
    )
      return;

    // Check if active shape is contained
    if (!checkContainment(stateRef.current)) {
      endGame();
      return;
    }

    // Stack the shape
    const result = stackActiveShape(stateRef.current);
    stateRef.current = result.state;

    onScore(result.state.score);
    audioService.playStackSound(result.state.score);

    // Check for level up
    if (result.leveledUp) {
      if (result.worldUp) {
        onWorldUp(result.state.world);
        // Maybe a special sound?
        audioService.playStackSound(result.state.score * 3);
      } else {
        onLevelUp(result.newLevel);
        audioService.playStackSound(result.state.score * 2); // Double pitch for level up
      }
    }

    // Spawn next active shape
    stateRef.current = spawnActiveShape(stateRef.current);
  }, [onScore, onLevelUp, onWorldUp, endGame, audioService]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    lastTimeRef.current = 0; // Reset time when loop starts/restarts

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const loop = (time: number) => {
      if (!stateRef.current || stateRef.current.isGameOver) return;

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = time;
        requestAnimationFrame(loop);
        return;
      }

      const dt = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;

      const pulse = (Math.sin(time / 500) + 1) / 2;

      // Update state
      let state = stateRef.current;
      state = updateActiveShape(state, dt);
      state = updateZoom(state, dt);
      state = updateShapeRotations(state);
      state = updateShapeOpacities(state);
      stateRef.current = state;

      // Check auto-fail if shape starts poking out
      if (!checkContainment(state)) {
        endGame();
        return;
      }

      // Render
      clearCanvas(ctx, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.save();
      drawBackground(ctx, canvas.width, canvas.height, pulse);

      // Get world mechanics for current world
      const mechanics = getWorldMechanics(state.world);
      const timeInSeconds = time / 1000;

      state.shapes.forEach((shape, index) => {
        drawShape(
          ctx,
          shape,
          centerX,
          centerY,
          state.zoom,
          mechanics,
          timeInSeconds,
          true, // isStacked
          index // stackIndex
        );
      });

      if (state.activeShape) {
        drawShape(
          ctx,
          state.activeShape,
          centerX,
          centerY,
          state.zoom,
          mechanics,
          timeInSeconds,
          false, // NOT stacked (active)
          state.shapes.length // stackIndex for phase offset
        );
      }

      ctx.restore();

      requestAnimationFrame(loop);
    };

    const animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [endGame]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleTap}
      style={{ width: "100%", height: "100%", cursor: "pointer" }}
    />
  );
};
