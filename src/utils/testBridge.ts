import type { MutableRefObject } from "react";
import type { IAudioService, MusicState } from "../audio/types";
import { getWorldMechanics } from "../constants/game";
import { isFractureActive, isTapBlockedByFracture } from "../gameplay/fracture";
import type { Medal } from "../modes/medals";
import type { GameState } from "../types";
import type { WorldTheme } from "../visual/theme";

export type GameTestBridgeState = {
  score: number;
  stackCount: number;
  level: number;
  world: number;
  mode: GameState["mode"];
  isGameOver: boolean;
  timeRemaining?: number;
  activeSize?: number;
  lastSize?: number;
  isBossLevel?: boolean;
  styleScore: number;
  streak: number;
  bestStreak: number;
  perfectCount: number;
  /** Simulation frozen: pause menu open or resume countdown running. */
  paused: boolean;
  /** Resume countdown digit on screen (3, 2, 1), null when not counting. */
  resumeCountdown: number | null;
  /** World whose first-visit intro holds the game, null when not holding. */
  worldIntro: number | null;
  zenLivesRemaining?: number;
  lastStackQuality: GameState["lastStackQuality"];
  themeId?: string;
  themePrimary?: string;
  fractureActive?: boolean;
  fractureWillMissOnTap?: boolean;
  fractureSectorWidthDeg?: number;
  /** How far the last miss was off (core value behind the UI wording). */
  lastMissMargin: GameState["lastMissMargin"];
};

export type GameTestBridge = {
  getState: () => GameTestBridgeState;
  setActiveSize: (size: number) => void;
  setTimeRemaining: (time: number) => void;
  forceStack: (sizeRatio: number) => void;
  tap: () => void;
  step: (dtSeconds: number) => void;
  /** Manual stepping mode (independent from the player-facing pause). */
  pause: () => void;
  resume: () => void;
  /** Whether the player-facing resume countdown ("3 · 2 · 1") is running. */
  isResumeCountdownRunning: () => boolean;
  /** Skip the resume countdown: play resumes now (no-op when not counting). */
  finishResumeCountdown: () => void;
  /** End a first-visit intro hold: play resumes now (no-op when not holding). */
  dismissWorldIntro: () => void;
  /**
   * Max wait of the next first-visit holds (ms). Slow CI browsers can spend
   * the real 9 s between two assertions; tests of the tap path lengthen it.
   */
  setWorldIntroMaxHold: (ms: number) => void;
  showDiagnostics: () => void;
  hideDiagnostics: () => void;
};

export type CueCall = { step: number; inWindow: boolean };

/** A run-ending sound the audio service was asked to play. */
export type EndSoundCall =
  | { sound: "fail" }
  | { sound: "timeUp"; world: number; medal: Medal | null };

/** E2E-only, read-only view of the audio service (outlives GameCanvas). */
export type AudioTestBridge = {
  getMusicState: () => MusicState;
  /** AudioContext state (`null` before the first sound/gesture creates it). */
  getContextState: () => AudioContextState | null;
  /** Every `playCue` call the audio service received, oldest first. */
  getCueCalls: () => CueCall[];
  clearCueCalls: () => void;
  /** Every fail / time-up sound the audio service received, oldest first. */
  getEndSoundCalls: () => EndSoundCall[];
};

type InstallArgs = {
  stateRef: MutableRefObject<GameState | null>;
  handleTap: () => void;
  tick: (timeMs: number, dtOverrideSeconds?: number) => void;
  setManualMode: (manual: boolean) => void;
  forceStack: (sizeRatio: number) => void;
  getTheme: () => WorldTheme | null;
  isPaused: () => boolean;
  getResumeCountdown: () => number | null;
  finishResumeCountdown: () => void;
  getWorldIntro: () => number | null;
  dismissWorldIntro: () => void;
  setWorldIntroMaxHold: (ms: number) => void;
};

const isE2eMode = (): boolean =>
  typeof import.meta !== "undefined" && import.meta.env?.VITE_E2E === "true";

const advanceTestClock = (dtSeconds: number) => {
  const win = window as Window & { __TEST_NOW__?: number };
  if (typeof win.__TEST_NOW__ === "number") {
    win.__TEST_NOW__ += dtSeconds * 1000;
  }
};

const shouldShowDiagnostics = (): boolean => {
  const win = window as Window & {
    __GAME_TEST_DEBUG__?: boolean;
    __GAME_TEST_AUTO_DIAG__?: boolean;
  };
  if (win.__GAME_TEST_AUTO_DIAG__ === false) return false;
  if (win.__GAME_TEST_DEBUG__ === true) return true;
  if (window.localStorage.getItem("E2E_DEBUG") === "true") return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get("e2eDebug") === "1") return true;
  return true;
};

const createDiagnosticsPanel = () => {
  const existing = document.getElementById("game-test-diagnostics");
  if (existing) return existing;
  const panel = document.createElement("div");
  panel.id = "game-test-diagnostics";
  panel.style.position = "fixed";
  panel.style.top = "12px";
  panel.style.right = "12px";
  panel.style.zIndex = "99999";
  panel.style.background = "rgba(10, 10, 10, 0.85)";
  panel.style.color = "#f5f5f5";
  panel.style.font = "12px/1.4 monospace";
  panel.style.padding = "10px 12px";
  panel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
  panel.style.borderRadius = "6px";
  panel.style.whiteSpace = "pre";
  panel.style.maxWidth = "320px";
  panel.style.pointerEvents = "none";
  document.body.appendChild(panel);
  return panel;
};

const updateDiagnosticsPanel = (
  panel: HTMLElement,
  state: GameTestBridgeState,
) => {
  panel.textContent = [
    `mode: ${state.mode}`,
    `score: ${state.score}`,
    `stacks: ${state.stackCount}`,
    `world: ${state.world}`,
    `level: ${state.level}`,
    `gameOver: ${state.isGameOver}`,
    `time: ${state.timeRemaining ?? "-"}`,
    `active: ${state.activeSize?.toFixed(2) ?? "-"}`,
    `last: ${state.lastSize?.toFixed(2) ?? "-"}`,
    `boss: ${state.isBossLevel ? "yes" : "no"}`,
    `style: ${state.styleScore}`,
    `streak: ${state.streak}`,
    `best: ${state.bestStreak}`,
    `lives: ${state.zenLivesRemaining ?? "-"}`,
    `quality: ${state.lastStackQuality ?? "-"}`,
    `theme: ${state.themeId ?? "-"}`,
    `fracture: ${state.fractureActive ? "on" : "off"}`,
    `fractureMiss: ${state.fractureWillMissOnTap ? "yes" : "no"}`,
  ].join("\n");
};

export const installGameTestBridge = ({
  stateRef,
  handleTap,
  tick,
  setManualMode,
  forceStack,
  getTheme,
  isPaused,
  getResumeCountdown,
  finishResumeCountdown,
  getWorldIntro,
  dismissWorldIntro,
  setWorldIntroMaxHold,
}: InstallArgs): (() => void) | undefined => {
  if (!isE2eMode()) return undefined;

  let manualTimeMs = 0;
  let panel: HTMLElement | null = null;

  const bridge: GameTestBridge = {
    getState: () => {
      const state = stateRef.current;
      const lastShape = state?.shapes[state.shapes.length - 1];
      const theme = getTheme();
      const fractureActive = state ? isFractureActive(state) : undefined;
      const fractureWillMissOnTap = state
        ? isTapBlockedByFracture(state, state.elapsedTime)
        : undefined;
      const fractureSectorWidthDeg = state
        ? getWorldMechanics(state.world).fractureSectorWidthDeg
        : undefined;
      return {
        score: state?.score ?? 0,
        stackCount: state?.stackCount ?? 0,
        level: state?.level ?? 1,
        world: state?.world ?? 1,
        mode: state?.mode ?? "CLASSIC",
        isGameOver: state?.isGameOver ?? false,
        timeRemaining: state?.timeRemaining,
        activeSize: state?.activeShape?.size,
        lastSize: lastShape?.size,
        isBossLevel: state?.isBossLevel,
        styleScore: state?.styleScore ?? 0,
        streak: state?.streak ?? 0,
        bestStreak: state?.bestStreak ?? 0,
        perfectCount: state?.perfectCount ?? 0,
        paused: isPaused(),
        resumeCountdown: getResumeCountdown(),
        worldIntro: getWorldIntro(),
        zenLivesRemaining: state?.zenLivesRemaining,
        lastStackQuality: state?.lastStackQuality ?? null,
        themeId: theme?.id,
        themePrimary: theme?.hud.primary,
        fractureActive,
        fractureWillMissOnTap,
        fractureSectorWidthDeg,
        lastMissMargin: state?.lastMissMargin ?? null,
      };
    },
    setActiveSize: (size: number) => {
      if (!stateRef.current?.activeShape) return;
      stateRef.current.activeShape = {
        ...stateRef.current.activeShape,
        size,
      };
    },
    setTimeRemaining: (time: number) => {
      if (!stateRef.current) return;
      stateRef.current.timeRemaining = time;
    },
    forceStack: (sizeRatio: number) => forceStack(sizeRatio),
    tap: () => handleTap(),
    step: (dtSeconds: number) => {
      manualTimeMs += dtSeconds * 1000;
      advanceTestClock(dtSeconds);
      tick(manualTimeMs, dtSeconds);
      if (panel) {
        updateDiagnosticsPanel(panel, bridge.getState());
      }
    },
    pause: () => setManualMode(true),
    resume: () => setManualMode(false),
    isResumeCountdownRunning: () => getResumeCountdown() !== null,
    finishResumeCountdown: () => finishResumeCountdown(),
    dismissWorldIntro: () => dismissWorldIntro(),
    setWorldIntroMaxHold: (ms: number) => setWorldIntroMaxHold(ms),
    showDiagnostics: () => {
      panel = createDiagnosticsPanel();
      updateDiagnosticsPanel(panel, bridge.getState());
    },
    hideDiagnostics: () => {
      if (panel) {
        panel.remove();
        panel = null;
      }
    },
  };

  if (shouldShowDiagnostics()) {
    panel = createDiagnosticsPanel();
    updateDiagnosticsPanel(panel, bridge.getState());
  }

  (window as Window & { __GAME_TEST__?: GameTestBridge }).__GAME_TEST__ = bridge;

  return () => {
    if (panel) {
      panel.remove();
      panel = null;
    }
    if ((window as Window & { __GAME_TEST__?: GameTestBridge }).__GAME_TEST__) {
      delete (window as Window & { __GAME_TEST__?: GameTestBridge }).__GAME_TEST__;
    }
  };
};

/**
 * Exposes the soundtrack state to E2E tests. Installed by <App/> (not
 * GameCanvas) so it stays readable on the start and game-over screens, where
 * music must be stopped.
 */
export const installAudioTestBridge = (
  audio: IAudioService,
): (() => void) | undefined => {
  if (!isE2eMode()) return undefined;
  // Record timing cue calls at the service boundary (a test cannot hear
  // them); the real method still runs, so audio behaviour is unchanged.
  const cueCalls: CueCall[] = [];
  const playCue = audio.playCue;
  audio.playCue = (step, inWindow) => {
    cueCalls.push({ step, inWindow });
    playCue.call(audio, step, inWindow);
  };
  // Same for the run-ending sounds: which one a run ended on (Firefox in the
  // CI container never starts audio, so recorded calls are the only proof).
  const endSoundCalls: EndSoundCall[] = [];
  const playFailSound = audio.playFailSound;
  audio.playFailSound = () => {
    endSoundCalls.push({ sound: "fail" });
    playFailSound.call(audio);
  };
  const playTimeUp = audio.playTimeUp;
  audio.playTimeUp = (world, medal) => {
    endSoundCalls.push({ sound: "timeUp", world, medal });
    playTimeUp.call(audio, world, medal);
  };
  window.__GAME_AUDIO__ = {
    getMusicState: () => audio.getMusicState(),
    getContextState: () => audio.getContextState(),
    getCueCalls: () => cueCalls.slice(),
    clearCueCalls: () => {
      cueCalls.length = 0;
    },
    getEndSoundCalls: () => endSoundCalls.map((call) => ({ ...call })),
  };
  return () => {
    audio.playCue = playCue;
    audio.playFailSound = playFailSound;
    audio.playTimeUp = playTimeUp;
    delete window.__GAME_AUDIO__;
  };
};
