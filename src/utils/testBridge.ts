import type { MutableRefObject } from "react";
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
  zenLivesRemaining?: number;
  lastStackQuality: GameState["lastStackQuality"];
  themeId?: string;
  themePrimary?: string;
};

export type GameTestBridge = {
  getState: () => GameTestBridgeState;
  setActiveSize: (size: number) => void;
  setTimeRemaining: (time: number) => void;
  forceStack: (sizeRatio: number) => void;
  tap: () => void;
  step: (dtSeconds: number) => void;
  pause: () => void;
  resume: () => void;
  showDiagnostics: () => void;
  hideDiagnostics: () => void;
};

type InstallArgs = {
  stateRef: MutableRefObject<GameState | null>;
  handleTap: () => void;
  tick: (timeMs: number, dtOverrideSeconds?: number) => void;
  setManualMode: (manual: boolean) => void;
  forceStack: (sizeRatio: number) => void;
  getTheme: () => WorldTheme | null;
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
  ].join("\n");
};

export const installGameTestBridge = ({
  stateRef,
  handleTap,
  tick,
  setManualMode,
  forceStack,
  getTheme,
}: InstallArgs): (() => void) | undefined => {
  if (!isE2eMode()) return undefined;

  let manualTimeMs = 0;
  let panel: HTMLElement | null = null;

  const bridge: GameTestBridge = {
    getState: () => {
      const state = stateRef.current;
      const lastShape = state?.shapes[state.shapes.length - 1];
      const theme = getTheme();
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
        zenLivesRemaining: state?.zenLivesRemaining,
        lastStackQuality: state?.lastStackQuality ?? null,
        themeId: theme?.id,
        themePrimary: theme?.hud.primary,
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
