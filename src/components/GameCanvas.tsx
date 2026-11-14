import { useRef, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { audioManager as defaultAudioManager } from "../utils/audioManager";
import type { IAudioService } from "../audio/types";
import { getMusicIntensity } from "../audio/soundtrack";
import type { GameState, RunStats, StackEvent, StackQuality, StyleUpdate } from "../types";
import {
  createInitialState,
  spawnActiveShape,
  updateActiveShape,
  advanceClock,
  updateZoom,
  updateShapeRotations,
  updateShapeOpacities,
  stackActiveShape,
  checkContainment,
  isStackValid,
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
  drawPerfectGuide,
  drawArena,
  drawBackground,
  clearCanvas,
} from "../rendering/shapeRenderer";
import { getFractureOverlay, isTapBlockedByFracture } from "../gameplay/fracture";
import { getPerfectGuide } from "../gameplay/guide";
import {
  getArenaRadius,
  isEarlyReverseTap,
  isReverseState,
} from "../gameplay/reverse";
import { getBeatPhase, getHeartbeatPulse } from "../gameplay/heartbeat";
import { installGameTestBridge } from "../utils/testBridge";
import { getWorldTheme } from "../visual/theme";
import { haptic } from "../utils/haptics";
import {
  createEffects,
  drawEffects,
  drawFlash,
  GAME_OVER_DELAY_MS,
  getPunchScale,
  getShakeOffset,
  hasActiveEffects,
  spawnStackBurst,
  triggerFail,
  triggerLevelUp,
  triggerWorldUp,
  updateEffects,
  type EffectsState,
} from "../rendering/effects";

/** Matches the PERFECT quality colour used by the HUD overlay. */
const PERFECT_GUIDE_COLOR = "#fff3a8";

/** Time Attack: tick every second once this few seconds remain. */
export const COUNTDOWN_TICK_FROM = 5;

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
  /** Practice: start at level 1 of this world (default 1). */
  startWorld?: number;
  reducedFx?: boolean;
  onScore: (score: number) => void;
  onGameOver: (
    finalScore: number,
    world: number,
    level: number,
    stats?: RunStats,
  ) => void;
  onLevelUp: (level: number) => void;
  onWorldUp: (world: number) => void;
  onTimeUpdate?: (time: number) => void;
  onStyleUpdate?: (style: StyleUpdate) => void;
  onZenLivesChange?: (lives: number | null) => void;
  /** After every successful stack (taps and the e2e bridge alike). */
  onStack?: (event: StackEvent) => void;
  /** After a miss; `terminal` is true when it ended the run. */
  onMiss?: (terminal: boolean) => void;
  /** Optional audio service for dependency injection (testing) */
  audioService?: IAudioService;
}

export interface GameCanvasHandle {
  restartShape: () => void;
  undo: () => void;
  /**
   * Player-facing pause (overlay). Freezes simulation, timer and input, and
   * resets the frame clock on resume so dt does not spike. Independent from
   * the e2e bridge's manual stepping mode.
   */
  setPaused: (paused: boolean) => void;
  /** Programmatic tap (keyboard). No-op while paused or after game over. */
  tap: () => void;
}

const toRunStats = (state: GameState): RunStats => ({
  stackCount: state.stackCount,
  perfectCount: state.perfectCount,
  bestStreak: state.bestStreak,
  scoreHistory: state.scoreHistory,
});

/** `wasBoss` must be read from the pre-stack state (spawn sets the flag). */
const toStackEvent = (
  stacked: GameState,
  quality: StackQuality,
  wasBoss: boolean,
): StackEvent => ({
  quality,
  stackCount: stacked.stackCount,
  perfectCount: stacked.perfectCount,
  score: stacked.score,
  world: stacked.world,
  level: stacked.level,
  streak: stacked.streak,
  wasBoss,
});

/**
 * GameCanvas - Orchestrates the game loop and React lifecycle.
 * Delegates to extracted modules for state, rendering, and audio.
 */
export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  (
    {
      mode = "CLASSIC",
      runSeed = 0,
      startWorld = 1,
      reducedFx = false,
      onScore,
      onGameOver,
      onLevelUp,
      onWorldUp,
      onTimeUpdate,
      onStyleUpdate,
      onZenLivesChange,
      onStack,
      onMiss,
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
    const pausedRef = useRef(false);
    const handleTapRef = useRef<() => void>(() => {});
    const loopRef = useRef<(time: number) => void>(undefined);
    const reducedFxRef = useRef(reducedFx);
    const effectsRef = useRef<EffectsState>(createEffects());
    const rafIdRef = useRef(0);
    const gameOverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Last whole second reported to onTimeUpdate. The HUD only shows
    // Math.ceil(time), so reporting every frame re-rendered <App/> ~60x/s.
    const lastReportedSecondRef = useRef<number | null>(null);
    // Zen has no combo streak: the soundtrack follows stacks since the last
    // miss instead. UI/audio-only bookkeeping, deliberately not in GameState.
    const zenCleanStacksRef = useRef(0);

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
        startWorld,
      );
      stateRef.current = spawnActiveShape(initialState, reducedFxRef.current);
      lastReportedSecondRef.current = null;
      effectsRef.current = createEffects();
      onZenLivesChange?.(
        stateRef.current.mode === "ZEN"
          ? (stateRef.current.zenLivesRemaining ?? null)
          : null,
      );
    }, [mode, runSeed, startWorld, onZenLivesChange]);

    useEffect(
      () => () => {
        if (gameOverTimerRef.current) clearTimeout(gameOverTimerRef.current);
      },
      [],
    );

    // Soundtrack lifecycle follows the run: a new run (mode/seed) starts a
    // fresh drone; unmounting (main menu, game-over screen, restart) stops it.
    useEffect(() => {
      zenCleanStacksRef.current = 0;
      audioService.startMusic(stateRef.current?.world ?? 1);
      return () => audioService.stopMusic();
    }, [audioService, mode, runSeed]);

    /** Push the run's momentum and key to the soundtrack. */
    const syncMusic = useCallback(
      (state: GameState) => {
        audioService.setMusicWorld(state.world);
        audioService.setMusicIntensity(
          getMusicIntensity({
            mode: state.mode,
            streak: state.streak,
            zenCleanStacks: zenCleanStacksRef.current,
          }),
        );
      },
      [audioService],
    );

    /** Delay the callback so fail feedback is visible; state is already over. */
    const notifyGameOver = useCallback(
      (score: number, world: number, level: number, stats?: RunStats) => {
        if (GAME_OVER_DELAY_MS <= 0) {
          onGameOver(score, world, level, stats);
          return;
        }
        if (gameOverTimerRef.current) clearTimeout(gameOverTimerRef.current);
        gameOverTimerRef.current = setTimeout(() => {
          gameOverTimerRef.current = null;
          onGameOver(score, world, level, stats);
        }, GAME_OVER_DELAY_MS);
      },
      [onGameOver],
    );

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
        setPaused: (paused: boolean) => {
          pausedRef.current = paused;
          // Drop the stale timestamp so the first frame after resume is a
          // baseline frame (dt = 0) instead of one huge delta.
          lastTimeRef.current = 0;
          // No-op after game over: stopMusic already cleared the intent.
          if (paused) audioService.pauseMusic();
          else audioService.resumeMusic();
        },
        tap: () => handleTapRef.current(),
      }),
      [audioService],
    );

    const setManualMode = useCallback((manual: boolean) => {
      manualModeRef.current = manual;
      if (!manual && loopRef.current) {
        lastTimeRef.current = 0;
        rafIdRef.current = requestAnimationFrame(loopRef.current);
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

      if (!wasGameOver) onMiss?.(stateRef.current.isGameOver);

      if (stateRef.current.isGameOver && !wasGameOver) {
        audioService.stopMusic();
        audioService.playFailSound();
        haptic("fail");
        effectsRef.current = triggerFail(effectsRef.current, reducedFxRef.current);
        notifyGameOver(
          stateRef.current.score,
          stateRef.current.world,
          stateRef.current.level,
          toRunStats(stateRef.current),
        );
      } else {
        // Zen: a life is lost but the run continues; momentum resets.
        zenCleanStacksRef.current = 0;
        syncMusic(stateRef.current);
        audioService.playMissSound();
        haptic("miss");
        effectsRef.current = triggerFail(
          effectsRef.current,
          reducedFxRef.current,
          true,
        );
      }
    }, [
      notifyGameOver,
      onStyleUpdate,
      onZenLivesChange,
      onMiss,
      audioService,
      syncMusic,
    ]);

    const handleTap = useCallback(() => {
      if (
        pausedRef.current ||
        !stateRef.current ||
        stateRef.current.isGameOver ||
        !stateRef.current.activeShape
      )
        return;

      const state = stateRef.current;
      const lastShape = state.shapes[state.shapes.length - 1];
      const reverse = isReverseState(state);

      // Zen mode: ignore premature taps instead of costing a life.
      if (state.mode === "ZEN") {
        const tooEarly = reverse
          ? isEarlyReverseTap(state)
          : state.activeShape!.size / lastShape.size < ZEN_MIN_CLICK_RATIO;
        if (tooEarly) {
          audioService.playEarlyClickSound();
          return;
        }
      }

      // Regular: inside the container. Reverse: contains the previous shape
      // and still inside the arena.
      if (!isStackValid(state)) {
        miss();
        return;
      }

      if (isTapBlockedByFracture(state, state.elapsedTime)) {
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
      onStack?.(toStackEvent(result.state, result.quality, !!state.isBossLevel));
      // Zen has no combo streak; use the stack position so the melody still climbs.
      const melodyStep =
        result.state.mode === "ZEN"
          ? (result.state.stackCount % 10) + 1
          : result.state.streak;
      audioService.playStack(result.quality, melodyStep, state.world);
      haptic(result.quality === "PERFECT" ? "perfect" : "tap");
      {
        const stacked = result.state.shapes[result.state.shapes.length - 1];
        const { width, height } = dimensionsRef.current;
        if (stacked) {
          effectsRef.current = spawnStackBurst(effectsRef.current, {
            quality: result.quality,
            x: width / 2,
            y: height / 2,
            radius: (stacked.size / 2) * result.state.zoom,
            color: stacked.color,
            reducedFx,
          });
        }
      }
      if (result.isPerfect && result.state.mode === "TIME_ATTACK") {
        audioService.playTimeBonus();
      }

      // Check for level up
      if (result.leveledUp) {
        haptic("levelUp");
        effectsRef.current = result.worldUp
          ? triggerWorldUp(effectsRef.current, reducedFx)
          : triggerLevelUp(effectsRef.current, reducedFx);
        if (result.worldUp) {
          onWorldUp(result.state.world);
          audioService.playWorldUp(result.state.world);
        } else {
          onLevelUp(result.newLevel);
          audioService.playLevelUp(result.state.world);
        }
      }

      if (result.state.mode === "ZEN") zenCleanStacksRef.current += 1;
      syncMusic(result.state);

      // Spawn next active shape
      stateRef.current = spawnActiveShape(stateRef.current, reducedFx);
    }, [
      onScore,
      onLevelUp,
      onWorldUp,
      onStyleUpdate,
      onStack,
      miss,
      reducedFx,
      audioService,
      syncMusic,
    ]);

    useEffect(() => {
      handleTapRef.current = handleTap;
    }, [handleTap]);

    const forceStack = useCallback(
      (sizeRatio: number) => {
        if (!stateRef.current || !stateRef.current.activeShape) return;
        const lastShape =
          stateRef.current.shapes[stateRef.current.shapes.length - 1];
        const wasBoss = !!stateRef.current.isBossLevel;
        // `sizeRatio` is the quality ratio: active/last in regular worlds,
        // last/active in reverse worlds (the new shape surrounds the last).
        const size = isReverseState(stateRef.current)
          ? lastShape.size / Math.max(sizeRatio, 1e-6)
          : lastShape.size * sizeRatio;
        stateRef.current = {
          ...stateRef.current,
          activeShape: { ...stateRef.current.activeShape, size },
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
        onStack?.(toStackEvent(result.state, result.quality, wasBoss));

        if (result.leveledUp) {
          if (result.worldUp) {
            onWorldUp(result.state.world);
          } else {
            onLevelUp(result.newLevel);
          }
        }

        // Mirror real play so the soundtrack can be exercised end to end.
        if (result.state.mode === "ZEN") zenCleanStacksRef.current += 1;
        syncMusic(result.state);

        stateRef.current = spawnActiveShape(stateRef.current, reducedFx);
      },
      [onScore, onLevelUp, onWorldUp, onStyleUpdate, onStack, reducedFx, syncMusic],
    );

    const tick = useCallback(
      (timeMs: number, dtOverrideSeconds?: number) => {
        if (!stateRef.current) return;
        // After game over only the fail feedback keeps animating.
        if (
          stateRef.current.isGameOver &&
          !hasActiveEffects(effectsRef.current)
        )
          return;

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
        const wasOver = state.isGameOver;
        if (dt > 0) {
          effectsRef.current = updateEffects(effectsRef.current, dt);
        }

        // Process restart request within the loop context
        if (restartRequestedRef.current && !wasOver) {
          state = restartActiveShape(state, reducedFx);
          restartRequestedRef.current = false;
          audioService.playStackSound(0);
        }

        if (undoRequestedRef.current && !wasOver) {
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
          // Undo can step back into the previous world's key.
          zenCleanStacksRef.current = Math.max(0, zenCleanStacksRef.current - 1);
          syncMusic(state);
        }

        if (dt > 0 && !wasOver) {
          state = advanceClock(state, dt);
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
              const previous = lastReportedSecondRef.current;
              lastReportedSecondRef.current = wholeSecond;
              onTimeUpdate?.(remaining);
              if (
                previous !== null &&
                wholeSecond < previous &&
                wholeSecond > 0 &&
                wholeSecond <= COUNTDOWN_TICK_FROM
              ) {
                audioService.playTick(wholeSecond <= 2);
              }
            }
            if (state.isGameOver) {
              stateRef.current = state;
              audioService.stopMusic();
              audioService.playFailSound();
              effectsRef.current = triggerFail(
                effectsRef.current,
                reducedFx,
              );
              notifyGameOver(
                state.score,
                state.world,
                state.level,
                toRunStats(state),
              );
              return;
            }
          }
        }

        stateRef.current = state;

        // Check auto-fail if shape starts poking out
        if (!wasOver && !checkContainment(state)) {
          miss();
          return;
        }

        // Render (use logical dimensions, not scaled canvas size)
        const { width, height } = dimensionsRef.current;
        clearCanvas(ctx, width, height);
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.save();
        const fx = effectsRef.current;
        if (hasActiveEffects(fx)) {
          const shake = getShakeOffset(fx);
          const punch = getPunchScale(fx);
          ctx.translate(
            shake.x + centerX * (1 - punch),
            shake.y + centerY * (1 - punch),
          );
          ctx.scale(punch, punch);
        }

        // Get world mechanics for current world
        const mechanics = getWorldMechanics(state.world);
        const theme = getWorldTheme(state.world, state.runSeed, reducedFx);
        const timeInSeconds = timeMs / 1000;
        const fractureOverlay = getFractureOverlay(state, state.elapsedTime);

        const reverse = isReverseState(state);
        // Heartbeat worlds pulse the scene on the beat instead of the idle breath.
        const scenePulse = mechanics.heartbeat
          ? getHeartbeatPulse(
              getBeatPhase(state.elapsedTime, mechanics.heartbeatBpm),
            )
          : pulse;

        drawBackground(ctx, width, height, scenePulse, mechanics, theme);

        const glowFloor = state.shapes.length - GLOW_LAYER_DEPTH;
        const drawStacked = (index: number) => {
          const shape = state.shapes[index];
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
        };

        const offsetX = state.activeOffset?.x ?? 0;
        const offsetY = state.activeOffset?.y ?? 0;
        const guide = state.activeShape ? getPerfectGuide(state) : null;
        const drawGuide = () => {
          if (!guide || !state.activeShape) return;
          drawPerfectGuide(
            ctx,
            state.activeShape,
            guide.perfectSize,
            centerX + offsetX,
            centerY + offsetY,
            state.zoom,
            guide.inPerfectBand,
            PERFECT_GUIDE_COLOR,
          );
        };
        const drawActive = () => {
          if (!state.activeShape) return;
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
        };

        if (reverse) {
          // Outward stacking: the growing shape is the largest, so paint it
          // first, then the stack from newest (largest) to oldest (smallest).
          const arenaRadius = getArenaRadius(state);
          const reach = state.activeShape
            ? state.activeShape.size / 2 / arenaRadius
            : 0;
          drawArena(ctx, centerX, centerY, arenaRadius * state.zoom, reach, scenePulse);
          drawActive();
          for (let index = state.shapes.length - 1; index >= 0; index -= 1) {
            drawStacked(index);
          }
          drawGuide();
        } else {
          for (let index = 0; index < state.shapes.length; index += 1) {
            drawStacked(index);
          }
          drawGuide();
          drawActive();
        }

        if (fx.rings.length > 0 || fx.particles.length > 0) {
          drawEffects(ctx, fx);
        }

        ctx.restore();
        if (fx.flash.t > 0) drawFlash(ctx, fx, width, height);
      },
      [
        audioService,
        miss,
        notifyGameOver,
        onLevelUp,
        onScore,
        onTimeUpdate,
        onWorldUp,
        reducedFx,
        syncMusic,
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

      // Per-effect flag: a re-run of this effect must retire this loop even
      // if a rAF callback is already queued (or re-queued via setManualMode).
      let cancelled = false;

      const loop = (time: number) => {
        if (cancelled) return;
        loopRef.current = loop;
        if (!stateRef.current) return;
        if (
          stateRef.current.isGameOver &&
          !hasActiveEffects(effectsRef.current)
        )
          return;

        if (pausedRef.current) {
          // Keep the rAF chain alive but do no simulation or drawing; the
          // last rendered frame stays on screen behind the overlay.
          lastTimeRef.current = 0;
          if (!manualModeRef.current) {
            rafIdRef.current = requestAnimationFrame(loop);
          }
          return;
        }

        if (lastTimeRef.current === 0) {
          lastTimeRef.current = time;
          if (!manualModeRef.current) {
            rafIdRef.current = requestAnimationFrame(loop);
          }
          return;
        }

        const dt = (time - lastTimeRef.current) / 1000;
        lastTimeRef.current = time;
        tick(time, dt);

        if (!cancelled && !manualModeRef.current) {
          rafIdRef.current = requestAnimationFrame(loop);
        }
      };

      rafIdRef.current = requestAnimationFrame(loop);
      const cleanupBridge = installGameTestBridge({
        stateRef,
        handleTap,
        tick,
        setManualMode,
        forceStack,
        isPaused: () => pausedRef.current,
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
        cancelled = true;
        cancelAnimationFrame(rafIdRef.current);
        window.removeEventListener("resize", resize);
        cleanupBridge?.();
      };
    }, [
      audioService,
      miss,
      notifyGameOver,
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
