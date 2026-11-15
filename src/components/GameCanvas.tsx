import { useRef, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { audioManager as defaultAudioManager } from "../utils/audioManager";
import type { IAudioService } from "../audio/types";
import { getMusicIntensity, getMusicTension } from "../audio/soundtrack";
import type { GameState, MissMargin, MissReason, RunStats, StackEvent, StackQuality, StyleUpdate } from "../types";
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
  getEndReason,
  finishRun as finishRunState,
  restartActiveShape,
  undoLastStack,
} from "../core/gameState";
import { getWorldMechanics, ZEN_MIN_CLICK_RATIO } from "../constants/game";
import type { GameMode } from "../types";
import { forwardRef, useImperativeHandle } from "react";
import { captureBoardSnapshot } from "../share/shareCard";
import { useI18n } from "../i18n/context";
import {
  drawShape,
  drawPerfectGuide,
  drawArena,
  drawBackground,
  clearCanvas,
} from "../rendering/shapeRenderer";
import { getFractureOverlay, isTapBlockedByFracture } from "../gameplay/fracture";
import { getPerfectGuide } from "../gameplay/guide";
import { advanceTimingCue, IDLE_CUE_CLOCK, type CueClock } from "../gameplay/timingCue";
import { getComboTier, isComboMilestone } from "../gameplay/combo";
import {
  getArenaRadius,
  isEarlyReverseTap,
  isReverseState,
} from "../gameplay/reverse";
import {
  crossedBeat,
  getBeatPhase,
  getHeartbeatPulse,
} from "../gameplay/heartbeat";
import { installGameTestBridge } from "../utils/testBridge";
import { isE2eMode } from "../utils/e2e";
import { useResumeCountdown, type ResumeGoSource } from "../gameplay/useResumeCountdown";
import { useWorldIntroHold } from "../gameplay/useWorldIntroHold";
import { FIRST_VISIT_MAX_HOLD_MS, shouldTeachWorld } from "../gameplay/worldIntro";
import { getWorldTheme, toMonoColor } from "../visual/theme";
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
  TIME_UP_DELAY_MS,
  triggerFail,
  triggerLevelUp,
  triggerTimeUp,
  triggerWorldUp,
  updateEffects,
  type EffectsState,
} from "../rendering/effects";
import { getMedal } from "../modes/medals";
import {
  selectEndFeedback,
  type EndHold,
  type TimeUpResult,
} from "../modes/endFeedback";

/** How long each kind of ending holds the board before `onGameOver`. */
const END_HOLD_MS: Readonly<Record<EndHold, number>> = {
  fail: GAME_OVER_DELAY_MS,
  timeUp: TIME_UP_DELAY_MS,
  none: 0,
};

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
 * Only the newest stacked layers cast a shadow (two extra outline strokes
 * each). Deeper layers are mostly covered or off screen.
 */
export const SHADOW_LAYER_DEPTH = 8;

interface GameCanvasProps {
  mode?: GameMode;
  runSeed?: number;
  /** Practice: start at level 1 of this world (default 1). */
  startWorld?: number;
  reducedFx?: boolean;
  /** Session-only Mono look (start screen secret): one-tint rendering. */
  mono?: boolean;
  /** Opt-in audio ticks towards the PERFECT window (see gameplay/timingCue). */
  timingCue?: boolean;
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
  /**
   * After a miss; `terminal` is true when it ended the run. `margin` says how
   * far it was off (see `getMissMargin`), null when not computable.
   */
  onMiss?: (terminal: boolean, margin: MissMargin | null) => void;
  /**
   * Resume countdown (see `resumeWithCountdown`): the digit on screen (3, 2,
   * 1), once per digit, then null when play resumes. Not called on cancel
   * (re-pause): the caller initiated it.
   */
  onResumeCountdown?: (digit: number | null) => void;
  /**
   * Highest world the player has already met (lifetime best world when the
   * run starts). Entering a world above it holds the game on a first-visit
   * intro (see gameplay/worldIntro). Read once per run (GameCanvas is keyed
   * by run); omitted = never hold.
   */
  introTaughtThrough?: number;
  /**
   * First-visit intro: the world the game is held on, once when the hold
   * starts, then null when play resumes (tap, timeout, pause, Zen action).
   */
  onWorldIntro?: (world: number | null) => void;
  /**
   * The run has Time Attack medals (regular Time Attack, see `hasMedals`):
   * the time-up cue and `onTimeUp` then carry the final medal. Default false.
   */
  medals?: boolean;
  /**
   * Time Attack clock reached 0 (timer or a miss penalty): the "TIME!"
   * moment, reported at once with the final score and medal, before the
   * (longer) hold that leads to `onGameOver`. Not called for other endings.
   */
  onTimeUp?: (result: TimeUpResult) => void;
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
  /**
   * Player-facing resume: stays frozen through a short "3 · 2 · 1" (reported
   * via `onResumeCountdown`, soft ticks + light haptics), then resumes play
   * and the soundtrack. Re-pausing cancels it; a second call while counting
   * keeps the running count. A run that is over resumes at once.
   */
  resumeWithCountdown: () => void;
  /**
   * Programmatic tap (keyboard). No-op while paused or after game over;
   * during a first-visit intro hold it only dismisses the intro.
   */
  tap: () => void;
  /**
   * Zen FINISH RUN: ends the run as a regular game over (reason "finished")
   * with a gentle resolving cue instead of the fail buzz, and reports it via
   * `onGameOver` at once (no fail-feedback delay). Returns false, doing
   * nothing, when the run cannot be finished (not Zen, already over).
   */
  finishRun: () => boolean;
  /**
   * Authoritative stats of the run in progress (null before the first frame).
   * Zen UNDO lowers them after the last stack event, so anything committing
   * a run mid-way (MAIN MENU) must read these rather than replay events.
   */
  getRunStats: () => RunStats | null;
  /**
   * Square snapshot of the board as the run ended (the last frame the player
   * saw, before the end effects), for the share image. Null mid-run.
   */
  getEndSnapshot: () => HTMLCanvasElement | null;
}

const toRunStats = (state: GameState): RunStats => {
  const endReason = getEndReason(state);
  return {
    stackCount: state.stackCount,
    perfectCount: state.perfectCount,
    bestStreak: state.bestStreak,
    scoreHistory: state.scoreHistory,
    endReason,
    // Only a run ended by the miss itself carries its margin (not clock/lives).
    endMargin:
      endReason !== null && endReason === state.lastMissReason
        ? (state.lastMissMargin ?? null)
        : null,
  };
};

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
      mono = false,
      timingCue = false,
      onScore,
      onGameOver,
      onLevelUp,
      onWorldUp,
      onTimeUpdate,
      onStyleUpdate,
      onZenLivesChange,
      onStack,
      onMiss,
      onResumeCountdown,
      introTaughtThrough = Number.POSITIVE_INFINITY,
      onWorldIntro,
      medals = false,
      onTimeUp,
      audioService = defaultAudioManager,
    },
    ref,
  ) => {
    const i18n = useI18n();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const endSnapshotRef = useRef<HTMLCanvasElement | null>(null);
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
    // Timing cue: the setting lives in a ref so toggling it from the pause
    // menu never rebuilds the loop; the stepper memory is plain loop state.
    const timingCueRef = useRef(timingCue);
    const cueClockRef = useRef<CueClock>(IDLE_CUE_CLOCK);
    // Presentation only, read by the renderer: a ref keeps the loop and its
    // callbacks independent from it (it only changes on the start screen).
    const monoRef = useRef(mono);
    // Max wait of a first-visit hold; only the E2E bridge changes it (slow CI
    // browsers would otherwise hit the timeout mid-test).
    const introMaxHoldRef = useRef(FIRST_VISIT_MAX_HOLD_MS);
    // First-visit intros: raised by every world taught this run, so a world
    // is taught once per run at most (a Zen undo can re-enter it).
    const taughtThroughRef = useRef(introTaughtThrough);
    // Read only when the run ends: refs keep them out of the loop's deps.
    const medalsRef = useRef(medals);
    const onTimeUpRef = useRef(onTimeUp);

    useEffect(() => {
      medalsRef.current = medals;
      onTimeUpRef.current = onTimeUp;
    }, [medals, onTimeUp]);

    useEffect(() => {
      reducedFxRef.current = reducedFx;
    }, [reducedFx]);

    useEffect(() => {
      timingCueRef.current = timingCue;
    }, [timingCue]);

    useEffect(() => {
      monoRef.current = mono;
    }, [mono]);

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

    /**
     * Report the end after `delayMs` so its feedback is seen first (the state
     * is already over); 0 reports at once.
     */
    const notifyGameOver = useCallback(
      (state: GameState, delayMs: number) => {
        const report = () =>
          onGameOver(state.score, state.world, state.level, toRunStats(state));
        if (gameOverTimerRef.current) {
          clearTimeout(gameOverTimerRef.current);
          gameOverTimerRef.current = null;
        }
        if (delayMs <= 0) {
          report();
          return;
        }
        gameOverTimerRef.current = setTimeout(() => {
          gameOverTimerRef.current = null;
          report();
        }, delayMs);
      },
      [onGameOver],
    );

    /**
     * The run in `state` just ended: play the ending its reason calls for
     * (fail, Time Attack time-up or Zen finish; see modes/endFeedback), then
     * report it after that ending's hold. Once per run, never per frame.
     */
    const endRun = useCallback(
      (state: GameState) => {
        // Before any end effect is drawn: the canvas still holds the stack
        // as the player last saw it.
        endSnapshotRef.current = captureBoardSnapshot(canvasRef.current);
        const medal = medalsRef.current ? getMedal(state.score) : null;
        const feedback = selectEndFeedback(getEndReason(state), state.mode, medal);
        audioService.stopMusic();
        switch (feedback.cue.kind) {
          case "fail":
            audioService.playFailSound();
            break;
          case "timeUp":
            audioService.playTimeUp(state.world, feedback.cue.medal);
            break;
          case "finish":
            // The world's resolving chord: a session closing, not a loss.
            audioService.playWorldUp(state.world);
            break;
        }
        haptic(feedback.haptic);
        if (feedback.effect === "fail") {
          effectsRef.current = triggerFail(effectsRef.current, reducedFxRef.current);
        } else if (feedback.effect === "timeUp") {
          const top = state.shapes[state.shapes.length - 1];
          const { width, height } = dimensionsRef.current;
          effectsRef.current = triggerTimeUp(effectsRef.current, {
            x: width / 2,
            y: height / 2,
            radius: top ? (top.size / 2) * state.zoom : Math.min(width, height) / 4,
            // Raw world colour: the Mono look tints effects at draw time.
            color: getWorldTheme(state.world, state.runSeed, reducedFxRef.current, false)
              .hud.primary,
            reducedFx: reducedFxRef.current,
          });
        }
        if (feedback.timeUpBanner) {
          onTimeUpRef.current?.({ score: state.score, medal });
        }
        notifyGameOver(state, END_HOLD_MS[feedback.hold]);
      },
      [audioService, notifyGameOver],
    );

    const setLoopPaused = useCallback(
      (paused: boolean) => {
        pausedRef.current = paused;
        // Drop the stale timestamp so the first frame after resume is a
        // baseline frame (dt = 0) instead of one huge delta.
        lastTimeRef.current = 0;
        // No-op after game over: stopMusic already cleared the intent.
        if (paused) audioService.pauseMusic();
        else audioService.resumeMusic();
      },
      [audioService],
    );

    // Resume countdown: the loop simply stays paused (no clock, growth, cue
    // ticks or Time Attack timer) until "go"; taps are already ignored while
    // paused, so they never count as misses or early taps.
    const resumeCountdown = useResumeCountdown({
      onDigit: (digit) => {
        audioService.playTick(false, true);
        haptic("tap");
        onResumeCountdown?.(digit);
      },
      onGo: (source: ResumeGoSource) => {
        setLoopPaused(false);
        // A skip (Zen restart/undo, test bridge) has its own feedback.
        if (source === "countdown") {
          audioService.playTick(true, true);
          haptic("tap");
        }
        onResumeCountdown?.(null);
      },
      isGameOver: () => stateRef.current?.isGameOver ?? true,
    });

    // First-visit world intro: while holding, the loop keeps rendering but
    // skips the simulation (no growth, clock, timer, cue or containment
    // check), and taps only dismiss it. See gameplay/worldIntro.
    const worldIntro = useWorldIntroHold({
      onHold: (world) => onWorldIntro?.(world),
      onRelease: (reason) => {
        // The player's own "go": same soft tick as the resume countdown's.
        if (reason === "tap") {
          audioService.playTick(true, true);
          haptic("tap");
        }
        onWorldIntro?.(null);
      },
      maxHoldMs: () => introMaxHoldRef.current,
    });

    /** Hold on the intro when `world` is entered for the first time ever. */
    const teachWorldOnEntry = useCallback(
      (world: number) => {
        if (!shouldTeachWorld(world, taughtThroughRef.current)) return;
        taughtThroughRef.current = world;
        worldIntro.start(world);
      },
      [worldIntro],
    );

    useImperativeHandle(
      ref,
      () => ({
        restartShape: () => {
          if (!stateRef.current || stateRef.current.isGameOver) return;
          worldIntro.release("board");
          restartRequestedRef.current = true;
          // A fresh shape starts small: no reason to keep the player waiting.
          resumeCountdown.finish("skipped");
        },
        undo: () => {
          if (!stateRef.current || stateRef.current.isGameOver) return;
          worldIntro.release("board");
          undoRequestedRef.current = true;
          resumeCountdown.finish("skipped");
        },
        setPaused: (paused: boolean) => {
          resumeCountdown.cancel();
          // Pausing ends an intro hold: RESUME's 3 · 2 · 1 protects the
          // restart, and two centred overlays would fight for the screen.
          if (paused) worldIntro.release("pause");
          setLoopPaused(paused);
        },
        resumeWithCountdown: () => {
          if (!pausedRef.current) return;
          if (!stateRef.current || stateRef.current.isGameOver) {
            resumeCountdown.cancel();
            setLoopPaused(false);
            onResumeCountdown?.(null);
            return;
          }
          resumeCountdown.start();
        },
        tap: () => handleTapRef.current(),
        getRunStats: () => (stateRef.current ? toRunStats(stateRef.current) : null),
        getEndSnapshot: () => endSnapshotRef.current,
        finishRun: () => {
          const state = stateRef.current;
          if (!state) return false;
          const finished = finishRunState(state);
          if (finished === state) return false;
          stateRef.current = finished;
          resumeCountdown.cancel();
          worldIntro.cancel();
          if (gameOverTimerRef.current) {
            clearTimeout(gameOverTimerRef.current);
            gameOverTimerRef.current = null;
          }
          // Same game-over path as a lost run, minus the failure: the world's
          // resolving chord and a light pulse instead of the buzz and shake,
          // reported at once (see modes/endFeedback).
          endRun(finished);
          return true;
        },
      }),
      [
        setLoopPaused,
        resumeCountdown,
        worldIntro,
        onResumeCountdown,
        endRun,
      ],
    );

    const setManualMode = useCallback((manual: boolean) => {
      manualModeRef.current = manual;
      if (!manual && loopRef.current) {
        lastTimeRef.current = 0;
        rafIdRef.current = requestAnimationFrame(loopRef.current);
      }
    }, []);

    const miss = useCallback((reason: MissReason) => {
      if (!stateRef.current) return;

      const wasGameOver = stateRef.current.isGameOver;
      stateRef.current = handleMiss(stateRef.current, reason);
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

      if (!wasGameOver) {
        onMiss?.(
          stateRef.current.isGameOver,
          stateRef.current.lastMissMargin ?? null,
        );
      }

      const ended = stateRef.current.isGameOver && !wasGameOver;
      // A miss that ends the run is a fail, except when its Time Attack
      // penalty drained the clock: the clock hit 0, so that run ends on
      // time ("timeout", like the timer itself reaching 0), and the miss
      // still plays its own feedback first (sound, small shake), exactly as
      // any Time Attack miss, before the time-up ending.
      const timedOut = ended && getEndReason(stateRef.current) === "timeout";
      if (!ended || timedOut) {
        // The miss's own feedback (Zen: a life lost, Time Attack: seconds
        // lost); momentum resets.
        zenCleanStacksRef.current = 0;
        if (!ended) syncMusic(stateRef.current);
        audioService.playMissSound();
        // An ending's haptic replaces a running pattern: skip the miss's.
        if (!ended) haptic("miss");
        effectsRef.current = triggerFail(
          effectsRef.current,
          reducedFxRef.current,
          true,
        );
      }
      if (ended) endRun(stateRef.current);
    }, [
      endRun,
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

      // A tap during a first-visit intro only dismisses it (after a short
      // grace): never a stack, a miss or an early tap.
      if (worldIntro.tap() !== "play") return;

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
        miss("badTap");
        return;
      }

      if (isTapBlockedByFracture(state, state.elapsedTime)) {
        miss("fracture");
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
      if (result.state.mode !== "ZEN" && isComboMilestone(result.state.streak)) {
        audioService.playComboMilestone(
          getComboTier(result.state.streak),
          result.state.world,
        );
        haptic("levelUp");
      }
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
      if (result.lifeRegained) {
        // Zen: a clean run earned a life back (App shows "+1 LIFE").
        audioService.playTimeBonus();
        haptic("life");
        onZenLivesChange?.(result.state.zenLivesRemaining ?? null);
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
          teachWorldOnEntry(result.state.world);
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
      onZenLivesChange,
      miss,
      reducedFx,
      audioService,
      syncMusic,
      worldIntro,
      teachWorldOnEntry,
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
            teachWorldOnEntry(result.state.world);
          } else {
            onLevelUp(result.newLevel);
          }
        }

        if (result.lifeRegained) onZenLivesChange?.(result.state.zenLivesRemaining ?? null);

        // Mirror real play so the soundtrack can be exercised end to end.
        if (result.state.mode === "ZEN") zenCleanStacksRef.current += 1;
        syncMusic(result.state);

        stateRef.current = spawnActiveShape(stateRef.current, reducedFx);
      },
      [
        onScore,
        onLevelUp,
        onWorldUp,
        onStyleUpdate,
        onStack,
        onZenLivesChange,
        reducedFx,
        syncMusic,
        teachWorldOnEntry,
      ],
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

        // First-visit intro: the frame still renders (new world look, effects)
        // but the game itself waits for the player.
        const held = worldIntro.isHolding();

        if (dt > 0 && !wasOver && !held) {
          const clockBefore = state.elapsedTime;
          state = advanceClock(state, dt);
          // Heartbeat worlds: audible beat, driven by the same game clock as
          // the growth bursts and the visual pulse (so all three line up).
          const beatMechanics = getWorldMechanics(state.world);
          if (
            beatMechanics.heartbeat &&
            state.activeShape &&
            crossedBeat(clockBefore, state.elapsedTime, beatMechanics.heartbeatBpm)
          ) {
            audioService.playHeartbeat();
          }
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
              // Same once-per-displayed-second cadence: the soundtrack
              // tightens over the last seconds and eases back out when a
              // bonus lifts the clock (the manager drops repeats).
              audioService.setMusicTension(getMusicTension(state.mode, remaining));
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
              // The clock ran out: Time Attack's normal ending, not a fail.
              stateRef.current = state;
              endRun(state);
              return;
            }
          }
        }

        stateRef.current = state;

        // Check auto-fail if shape starts poking out
        if (!wasOver && !held && !checkContainment(state)) {
          miss("overflow");
          return;
        }

        // Timing cue: the pure stepper decides on the game clock, the loop
        // only plays. Paused frames never reach this point; muted or disabled
        // forgets the phase so re-enabling starts a clean approach.
        if (dt > 0 && !wasOver && !held) {
          if (timingCueRef.current && !audioService.isMuted()) {
            const cue = advanceTimingCue(cueClockRef.current, state);
            cueClockRef.current = cue.clock;
            if (cue.tick) audioService.playCue(cue.tick.step, cue.tick.inWindow);
          } else {
            cueClockRef.current = IDLE_CUE_CLOCK;
          }
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
        const theme = getWorldTheme(
          state.world,
          state.runSeed,
          reducedFx,
          monoRef.current,
        );
        const tint = theme.mono ? toMonoColor : undefined;
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

        const shadowFloor = state.shapes.length - SHADOW_LAYER_DEPTH;
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
            index >= shadowFloor,
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
            tint ? tint(PERFECT_GUIDE_COLOR) : PERFECT_GUIDE_COLOR,
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
          drawArena(
            ctx,
            centerX,
            centerY,
            arenaRadius * state.zoom,
            reach,
            scenePulse,
            theme.danger,
          );
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
          drawEffects(ctx, fx, tint);
        }

        ctx.restore();
        if (fx.flash.t > 0) {
          drawFlash(ctx, fx, width, height, tint, theme.danger.flash);
        }
      },
      [
        audioService,
        miss,
        endRun,
        onLevelUp,
        onScore,
        onTimeUpdate,
        onWorldUp,
        reducedFx,
        syncMusic,
        worldIntro,
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
        // Manual (test-driven) mode: the bridge steps the simulation itself.
        // A frame queued before pause() or by an effect re-run must not
        // advance the game with a real dt behind the test's back.
        if (manualModeRef.current) return;
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
      // Guarded at the call site too: production builds then drop this whole
      // argument object (closures included), not just the installer's body.
      const cleanupBridge = isE2eMode() ? installGameTestBridge({
        stateRef,
        handleTap,
        tick,
        setManualMode,
        forceStack,
        isPaused: () => pausedRef.current,
        getResumeCountdown: () => resumeCountdown.digit(),
        finishResumeCountdown: () => resumeCountdown.finish("test"),
        getWorldIntro: () => worldIntro.world(),
        dismissWorldIntro: () => worldIntro.release("test"),
        setWorldIntroMaxHold: (ms: number) => {
          introMaxHoldRef.current = ms;
        },
        getTheme: () =>
          stateRef.current
            ? getWorldTheme(
                stateRef.current.world,
                stateRef.current.runSeed,
                reducedFx,
                monoRef.current,
              )
            : null,
      }) : undefined;
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafIdRef.current);
        window.removeEventListener("resize", resize);
        cleanupBridge?.();
      };
    }, [
      audioService,
      miss,
      endRun,
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
      resumeCountdown,
      worldIntro,
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
        role="img"
        aria-label={i18n.t("app.gameBoard")}
        onPointerDown={handlePointerDown}
        style={{ width: "100%", height: "100%", cursor: "pointer" }}
      />
    );
  },
);
