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
  updateTimer,
  handleMiss,
  restartActiveShape,
  undoLastStack,
} from "../core/gameState";
import { getWorldMechanics } from "../constants/game";
import type { GameMode } from "../types";
import { forwardRef, useImperativeHandle } from "react";
import {
  drawShape,
  drawBackground,
  clearCanvas,
} from "../rendering/shapeRenderer";

interface GameCanvasProps {
  mode?: GameMode;
  onScore: (score: number) => void;
  onGameOver: (finalScore: number, world: number, level: number) => void;
  onLevelUp: (level: number) => void;
  onWorldUp: (world: number) => void;
  onTimeUpdate?: (time: number) => void;
  /** Optional audio service for dependency injection (testing) */
  audioService?: IAudioService;
}

export interface GameCanvasHandle {
  restartShape: () => void;
  undo: () => void;
}

/**
 * GameCanvas - Orchestrates the game loop and React lifecycle.
 * Delegates to extracted modules for state, rendering, and audio.
 */
export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  (
    {
      mode = "CLASSIC",
      onScore,
      onGameOver,
      onLevelUp,
      onWorldUp,
      onTimeUpdate,
      audioService = defaultAudioManager,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const stateRef = useRef<GameState | null>(null);
    const lastTimeRef = useRef(0);
    const restartRequestedRef = useRef(false);
    const undoRequestedRef = useRef(false);
    const dimensionsRef = useRef({ width: 0, height: 0 });

    // Initialize game state
    useEffect(() => {
      const viewportSize = Math.min(window.innerWidth, window.innerHeight);
      const initialState = createInitialState(viewportSize, mode);
      stateRef.current = spawnActiveShape(initialState);
    }, [mode]);

    useImperativeHandle(
      ref,
      () => ({
        restartShape: () => {
          if (!stateRef.current || stateRef.current.isGameOver) return;
          restartRequestedRef.current = true;
        },
        undo: () => {
          if (!stateRef.current || stateRef.current.isGameOver) return;
          undoRequestedRef.current = true;
        },
      }),
      []
    );

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

    const miss = useCallback(() => {
      if (!stateRef.current) return;

      const wasGameOver = stateRef.current.isGameOver;
      stateRef.current = handleMiss(stateRef.current);

      if (stateRef.current.isGameOver && !wasGameOver) {
        audioService.playFailSound();
        onGameOver(
          stateRef.current.score,
          stateRef.current.world,
          stateRef.current.level
        );
      } else {
        // Just reset shape in Zen
        audioService.playFailSound(); // Or a less "fail" sound?
      }
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
        miss();
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
    }, [onScore, onLevelUp, onWorldUp, miss, audioService]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      lastTimeRef.current = 0; // Reset time when loop starts/restarts

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Store logical dimensions
        dimensionsRef.current = { width, height };

        // Set display size (CSS)
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        // Set actual size in memory (scaled for high-DPI)
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        // Scale context to match DPR
        ctx.scale(dpr, dpr);
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

        // Process restart request within the loop context
        if (restartRequestedRef.current) {
          state = restartActiveShape(state);
          restartRequestedRef.current = false;
          audioService.playStackSound(0);
        }

        if (undoRequestedRef.current) {
          state = undoLastStack(state);
          undoRequestedRef.current = false;
          // If undo resulted in no active shape, spawn one
          if (!state.activeShape) {
            state = spawnActiveShape(state);
          }
          onScore(state.score);
          onLevelUp(state.level);
          onWorldUp(state.world);
          audioService.playStackSound(state.score);
        }

        state = updateActiveShape(state, dt);
        state = updateZoom(state, dt);
        state = updateShapeRotations(state);
        state = updateShapeOpacities(state);

        if (state.mode === "TIME_ATTACK") {
          state = updateTimer(state, dt);
          onTimeUpdate?.(state.timeRemaining ?? 0);
          if (state.isGameOver) {
            stateRef.current = state;
            audioService.playFailSound();
            onGameOver(state.score, state.world, state.level);
            return;
          }
        }

        stateRef.current = state;

        // Check auto-fail if shape starts poking out
        if (!checkContainment(state)) {
          miss();
          // In Zen mode, we must continue the loop because miss() doesn't end the game
          if (state.mode === "ZEN") {
            requestAnimationFrame(loop);
          }
          return;
        }

        // Render (use logical dimensions, not scaled canvas size)
        const { width, height } = dimensionsRef.current;
        clearCanvas(ctx, width, height);
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.save();
        drawBackground(ctx, width, height, pulse);

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
    }, [
      audioService,
      endGame,
      miss,
      onGameOver,
      onTimeUpdate,
      onScore,
      onLevelUp,
      onWorldUp,
    ]);
    return (
      <canvas
        ref={canvasRef}
        onClick={handleTap}
        style={{ width: "100%", height: "100%", cursor: "pointer" }}
      />
    );
  }
);
