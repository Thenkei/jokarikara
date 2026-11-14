import { useRef, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { audioManager as defaultAudioManager } from "../utils/audioManager";
import type { IAudioService } from "../audio/types";
import type { GameState, StyleUpdate } from "../types";
import {
  createInitialState,
  spawnActiveShape,
  updateActiveShape,
  updateZoom,
  updateShapeRotations,
  updateShapeOpacities,
  stackActiveShape,
  checkContainment,
  updateTimer,
  handleMiss,
  restartActiveShape,
  undoLastStack,
} from "../core/gameState";
import { getWorldMechanics, ZEN_MIN_CLICK_RATIO } from "../constants/game";
import type { GameMode } from "../types";
import { forwardRef, useImperativeHandle } from "react";
import {
  drawShape,
  drawBackground,
  clearCanvas,
} from "../rendering/shapeRenderer";
import { getFractureOverlay, isTapBlockedByFracture } from "../gameplay/fracture";
import { installGameTestBridge } from "../utils/testBridge";
import { getWorldTheme } from "../visual/theme";

/**
 * Upper bound for a single simulation step. Browsers stop rAF in background
 * tabs and GC/JIT hitches can stall a frame; without a clamp the first frame
 * after resuming would grow the active shape by seconds' worth of size and
 * auto-fail the player through no fault of their own.
 */
export const MAX_FRAME_DT = 0.05;

/**
 * Backing-store scale cap. 3x screens triple the fill cost (9x pixels vs 1x)
 * for no perceptible gain on flat-coloured vector shapes.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

/**
 * Only the newest stacked layers get the (expensive) shadow-blur glow. Deeper
 * layers are mostly covered and fade out anyway.
 */
export const GLOW_LAYER_DEPTH = 5;

interface GameCanvasProps {
  mode?: GameMode;
  runSeed?: number;
  reducedFx?: boolean;
  onScore: (score: number) => void;
  onGameOver: (finalScore: number, world: number, level: number) => void;
  onLevelUp: (level: number) => void;
  onWorldUp: (world: number) => void;
  onTimeUpdate?: (time: number) => void;
  onStyleUpdate?: (style: StyleUpdate) => void;
  onZenLivesChange?: (lives: number | null) => void;
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
      runSeed = 0,
      reducedFx = false,
      onScore,
      onGameOver,
      onLevelUp,
      onWorldUp,
      onTimeUpdate,
      onStyleUpdate,
      onZenLivesChange,
      audioService = defaultAudioManager,
    },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const stateRef = useRef<GameState | null>(null);
    const lastTimeRef = useRef(0);
    const restartRequestedRef = useRef(false);
    const undoRequestedRef = useRef(false);
    const dimensionsRef = useRef({ width: 0, height: 0 });
    const manualModeRef = useRef(false);
    const loopRef = useRef<(time: number) => void>(undefined);
    const reducedFxRef = useRef(reducedFx);
    // Last whole second reported to onTimeUpdate. The HUD only shows
    // Math.ceil(time), so reporting every frame re-rendered <App/> ~60x/s.
    const lastReportedSecondRef = useRef<number | null>(null);

    useEffect(() => {
      reducedFxRef.current = reducedFx;
    }, [reducedFx]);

    // Initialize game state
    useEffect(() => {
      const viewportSize = Math.min(window.innerWidth, window.innerHeight);
      const initialState = createInitialState(
        viewportSize,
        mode,
        runSeed,
        reducedFxRef.current,
      );
      stateRef.current = spawnActiveShape(initialState, reducedFxRef.current);
      lastReportedSecondRef.current = null;
      onZenLivesChange?.(
        stateRef.current.mode === "ZEN"
          ? (stateRef.current.zenLivesRemaining ?? null)
          : null,
      );
    }, [mode, runSeed, onZenLivesChange]);

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
      [],
    );

    const setManualMode = useCallback((manual: boolean) => {
      manualModeRef.current = manual;
      if (!manual && loopRef.current) {
        lastTimeRef.current = 0;
        requestAnimationFrame(loopRef.current);
      }
    }, []);

    const miss = useCallback(() => {
      if (!stateRef.current) return;

      const wasGameOver = stateRef.current.isGameOver;
      stateRef.current = handleMiss(stateRef.current);
      onStyleUpdate?.({
        styleScore: stateRef.current.styleScore,
        streak: stateRef.current.streak,
        bestStreak: stateRef.current.bestStreak,
        lastStackQuality: stateRef.current.lastStackQuality,
      });
      onZenLivesChange?.(
        stateRef.current.mode === "ZEN"
          ? (stateRef.current.zenLivesRemaining ?? null)
          : null,
      );

      if (stateRef.current.isGameOver && !wasGameOver) {
        audioService.playFailSound();
        onGameOver(
          stateRef.current.score,
          stateRef.current.world,
          stateRef.current.level,
        );
      } else {
        // Just reset shape in Zen
        audioService.playFailSound(); // Or a less "fail" sound?
      }
    }, [onGameOver, onStyleUpdate, onZenLivesChange, audioService]);

    const handleTap = useCallback(() => {
      if (
        !stateRef.current ||
        stateRef.current.isGameOver ||
        !stateRef.current.activeShape
      )
        return;

      const state = stateRef.current;
      const lastShape = state.shapes[state.shapes.length - 1];

      // Zen mode: require minimum size ratio to prevent spam-clicking
      if (state.mode === "ZEN") {
        const sizeRatio = state.activeShape!.size / lastShape.size;
        if (sizeRatio < ZEN_MIN_CLICK_RATIO) {
          audioService.playEarlyClickSound();
          return;
        }
      }

      // Check if active shape is contained
      if (!checkContainment(stateRef.current)) {
        miss();
        return;
      }

      const tapTimeSec = Date.now() / 1000;
      if (isTapBlockedByFracture(state, tapTimeSec)) {
        miss();
        return;
      }

      // Stack the shape
      const result = stackActiveShape(stateRef.current);
      stateRef.current = result.state;

      onScore(result.state.score);
      onStyleUpdate?.({
        styleScore: result.state.styleScore,
        streak: result.state.streak,
        bestStreak: result.state.bestStreak,
        lastStackQuality: result.state.lastStackQuality,
      });
      audioService.playStackSound(result.state.stackCount);

      // Check for level up
      if (result.leveledUp) {
        if (result.worldUp) {
          onWorldUp(result.state.world);
          // Maybe a special sound?
          audioService.playStackSound(result.state.stackCount * 3);
        } else {
          onLevelUp(result.newLevel);
          audioService.playStackSound(result.state.stackCount * 2); // Double pitch for level up
        }
      }

      // Spawn next active shape
      stateRef.current = spawnActiveShape(stateRef.current, reducedFx);
    }, [
      onScore,
      onLevelUp,
      onWorldUp,
      onStyleUpdate,
      miss,
      reducedFx,
      audioService,
    ]);

    const forceStack = useCallback(
      (sizeRatio: number) => {
        if (!stateRef.current || !stateRef.current.activeShape) return;
        const lastShape =
          stateRef.current.shapes[stateRef.current.shapes.length - 1];
        stateRef.current = {
          ...stateRef.current,
          activeShape: {
            ...stateRef.current.activeShape,
            size: lastShape.size * sizeRatio,
          },
        };

        const result = stackActiveShape(stateRef.current);
        stateRef.current = result.state;
        onScore(result.state.score);
        onStyleUpdate?.({
          styleScore: result.state.styleScore,
          streak: result.state.streak,
          bestStreak: result.state.bestStreak,
          lastStackQuality: result.state.lastStackQuality,
        });

        if (result.leveledUp) {
          if (result.worldUp) {
            onWorldUp(result.state.world);
          } else {
            onLevelUp(result.newLevel);
          }
        }

        stateRef.current = spawnActiveShape(stateRef.current, reducedFx);
      },
      [onScore, onLevelUp, onWorldUp, onStyleUpdate, reducedFx],
    );

    const tick = useCallback(
      (timeMs: number, dtOverrideSeconds?: number) => {
        if (!stateRef.current || stateRef.current.isGameOver) return;

        const ctx = ctxRef.current;
        if (!ctx) return;

        const rawDt =
          dtOverrideSeconds ??
          (lastTimeRef.current === 0
            ? 0
            : (timeMs - lastTimeRef.current) / 1000);
        const dt = Math.min(Math.max(rawDt, 0), MAX_FRAME_DT);

        const pulse = (Math.sin(timeMs / 500) + 1) / 2;

        // Update state
        let state = stateRef.current;

        // Process restart request within the loop context
        if (restartRequestedRef.current) {
          state = restartActiveShape(state, reducedFx);
          restartRequestedRef.current = false;
          audioService.playStackSound(0);
        }

        if (undoRequestedRef.current) {
          state = undoLastStack(state);
          undoRequestedRef.current = false;
          // If undo resulted in no active shape, spawn one
          if (!state.activeShape) {
            state = spawnActiveShape(state, reducedFx);
          }
          onScore(state.score);
          onLevelUp(state.level);
          onWorldUp(state.world);
          audioService.playStackSound(state.stackCount);
        }

        if (dt > 0) {
          state = updateActiveShape(state, dt);
          state = updateZoom(state, dt);
          state = updateShapeRotations(state, dt);
          state = updateShapeOpacities(state, dt);

          if (state.mode === "TIME_ATTACK") {
            state = updateTimer(state, dt);
            const remaining = state.timeRemaining ?? 0;
            const wholeSecond = Math.ceil(remaining);
            if (
              wholeSecond !== lastReportedSecondRef.current ||
              state.isGameOver
            ) {
              lastReportedSecondRef.current = wholeSecond;
              onTimeUpdate?.(remaining);
            }
            if (state.isGameOver) {
              stateRef.current = state;
              audioService.playFailSound();
              onGameOver(state.score, state.world, state.level);
              return;
            }
          }
        }

        stateRef.current = state;

        // Check auto-fail if shape starts poking out
        if (!checkContainment(state)) {
          miss();
          return;
        }

        // Render (use logical dimensions, not scaled canvas size)
        const { width, height } = dimensionsRef.current;
        clearCanvas(ctx, width, height);
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.save();

        // Get world mechanics for current world
        const mechanics = getWorldMechanics(state.world);
        const theme = getWorldTheme(state.world, state.runSeed, reducedFx);
        const timeInSeconds = timeMs / 1000;
        const fractureOverlay = getFractureOverlay(state, Date.now() / 1000);

        drawBackground(ctx, width, height, pulse, mechanics, theme);

        const glowFloor = state.shapes.length - GLOW_LAYER_DEPTH;
        state.shapes.forEach((shape, index) => {
          const isContainer = index === state.shapes.length - 1;
          drawShape(
            ctx,
            shape,
            centerX,
            centerY,
            state.zoom,
            mechanics,
            timeInSeconds,
            true, // isStacked
            index, // stackIndex
            isContainer,
            theme,
            isContainer ? (fractureOverlay ?? undefined) : undefined,
            index >= glowFloor,
          );
        });

        if (state.activeShape) {
          const offsetX = state.activeOffset?.x ?? 0;
          const offsetY = state.activeOffset?.y ?? 0;
          drawShape(
            ctx,
            state.activeShape,
            centerX + offsetX,
            centerY + offsetY,
            state.zoom,
            mechanics,
            timeInSeconds,
            false, // NOT stacked (active)
            state.shapes.length, // stackIndex for phase offset
            false,
            theme,
          );
        }

        ctx.restore();
      },
      [
        audioService,
        miss,
        onGameOver,
        onLevelUp,
        onScore,
        onTimeUpdate,
        onWorldUp,
        reducedFx,
      ],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctxRef.current = ctx;

      lastTimeRef.current = 0; // Reset time when loop starts/restarts

      const resize = () => {
        const dpr = Math.min(
          window.devicePixelRatio || 1,
          MAX_DEVICE_PIXEL_RATIO,
        );
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

        // Resizing the backing store resets the context, but setTransform is
        // explicit and idempotent should the browser keep the old matrix.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      window.addEventListener("resize", resize);
      resize();

      const loop = (time: number) => {
        loopRef.current = loop;
        if (!stateRef.current || stateRef.current.isGameOver) return;

        if (lastTimeRef.current === 0) {
          lastTimeRef.current = time;
          if (!manualModeRef.current) {
            requestAnimationFrame(loop);
          }
          return;
        }

        const dt = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        tick(time, dt);

        if (!manualModeRef.current) {
          requestAnimationFrame(loop);
        }
      };

      const animId = requestAnimationFrame(loop);
      const cleanupBridge = installGameTestBridge({
        stateRef,
        handleTap,
        tick,
        setManualMode,
        forceStack,
        getTheme: () =>
          stateRef.current
            ? getWorldTheme(
                stateRef.current.world,
                stateRef.current.runSeed,
                reducedFx,
              )
            : null,
      });
      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", resize);
        cleanupBridge?.();
      };
    }, [
      audioService,
      miss,
      onGameOver,
      onTimeUpdate,
      onScore,
      onLevelUp,
      onWorldUp,
      onStyleUpdate,
      setManualMode,
      tick,
      handleTap,
      forceStack,
      reducedFx,
    ]);
    // pointerdown fires on contact; click waits for release (and on touch
    // devices for gesture disambiguation), adding 50-150 ms of latency to a
    // game that is entirely about timing.
    const handlePointerDown = useCallback(
      (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (event.isPrimary === false) return;
        handleTap();
      },
      [handleTap],
    );

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{ width: "100%", height: "100%", cursor: "pointer" }}
      />
    );
  },
);
