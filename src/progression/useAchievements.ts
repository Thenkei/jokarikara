import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameMode, RunStats, StackEvent } from "../types";
import {
  getAchievementRecord,
  updateAchievementRecord,
  type AchievementRecord,
} from "../utils/storage";
import {
  applyPracticeRunToLifetime,
  applyRunToLifetime,
  applyStack,
  breakPerfectRun,
  createRunProgress,
  evaluate,
  grantAchievement,
  type AchievementId,
  type RunProgress,
} from "./achievements";
import {
  elapsedSeconds,
  pauseStopwatch,
  resumeStopwatch,
  startStopwatch,
  type Stopwatch,
} from "./stopwatch";

interface ActiveRun {
  progress: RunProgress;
  stopwatch: Stopwatch;
  /** In unlock order; shown on the game over screen. */
  unlockedThisRun: readonly AchievementId[];
  /** Lifetime stats already include this run. */
  committed: boolean;
  /** Practice run: no unlocks, only `bestWorld` is recorded. */
  practice: boolean;
}

export interface FinishRunInput {
  score: number;
  world: number;
  level: number;
  stats: RunStats;
}

export interface UseAchievementsOptions {
  /** Newly unlocked ids, in catalogue order. Called synchronously. */
  onUnlock?: (ids: readonly AchievementId[]) => void;
  /** Monotonic clock in ms (play-time measurement). */
  monotonicNow?: () => number;
  /** Wall clock in ms (unlock timestamps). */
  wallNow?: () => number;
}

export interface AchievementsApi {
  record: AchievementRecord;
  beginRun: (
    mode: GameMode,
    dailyKey: string | null,
    options?: { practice?: boolean },
  ) => void;
  recordStack: (event: StackEvent) => void;
  recordMiss: (terminal: boolean) => void;
  recordUndo: () => void;
  setPaused: (paused: boolean) => void;
  /** Final evaluation + lifetime commit. Returns everything unlocked this run. */
  finishRun: (input: FinishRunInput) => readonly AchievementId[];
  /**
   * Commits a run left without a game over (menu, restart). Idempotent.
   * Pass the run's current RunStats when known: like at game over, they are
   * authoritative over the stack events (a Zen undo lowers the counts).
   */
  abandonRun: (stats?: Pick<RunStats, "stackCount" | "perfectCount"> | null) => void;
  /**
   * Event unlock outside runs (e.g. a start screen secret). Persists and
   * announces via `onUnlock` once; a no-op when already unlocked.
   */
  unlock: (id: AchievementId) => void;
}

const defaultMonotonicNow = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Achievement bookkeeping is never allowed to break gameplay: every entry
 * point is called from the tap handler or game-over path, so failures are
 * logged and swallowed.
 */
const guarded =
  <Args extends unknown[], R>(label: string, fallback: R, fn: (...args: Args) => R) =>
  (...args: Args): R => {
    try {
      return fn(...args);
    } catch (error) {
      console.error(`[achievements] ${label} failed`, error);
      return fallback;
    }
  };

/**
 * React glue around the pure achievements module. Run state lives in refs
 * (updated per stack, never per frame); React state changes only when the
 * persisted record changes (an unlock or a run commit), so the HUD does not
 * re-render because of achievement tracking.
 */
export function useAchievements(options: UseAchievementsOptions = {}): AchievementsApi {
  const [record, setRecord] = useState<AchievementRecord>(getAchievementRecord);
  const recordRef = useRef(record);
  const runRef = useRef<ActiveRun | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  });

  const monotonicNow = useCallback(
    () => (optionsRef.current.monotonicNow ?? defaultMonotonicNow)(),
    [],
  );

  const publish = useCallback((next: AchievementRecord) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  /** Evaluates the active run and persists/announces any new unlock. */
  const evaluateRun = useCallback(() => {
    const run = runRef.current;
    if (!run || run.practice) return;
    const already = new Set(
      Object.keys(recordRef.current.unlocked) as AchievementId[],
    );
    const ids = evaluate(
      { run: run.progress, lifetime: recordRef.current.lifetime },
      already,
    );
    if (ids.length === 0) return;

    const at = (optionsRef.current.wallNow ?? Date.now)();
    const next = updateAchievementRecord((current) => {
      const unlocked = { ...current.unlocked };
      // First unlock wins (another tab may have unlocked it already).
      for (const id of ids) unlocked[id] ??= at;
      return { ...current, unlocked };
    });
    runRef.current = { ...run, unlockedThisRun: [...run.unlockedThisRun, ...ids] };
    publish(next);
    optionsRef.current.onUnlock?.(ids);
  }, [publish]);

  const commitRun = useCallback(() => {
    const run = runRef.current;
    if (!run || run.committed) return;
    const next = updateAchievementRecord((current) => ({
      ...current,
      lifetime: run.practice
        ? applyPracticeRunToLifetime(current.lifetime, run.progress)
        : applyRunToLifetime(current.lifetime, run.progress),
    }));
    runRef.current = { ...run, committed: true };
    publish(next);
  }, [publish]);

  const beginRun = useMemo(
    () =>
      guarded(
        "beginRun",
        undefined,
        (
          mode: GameMode,
          dailyKey: string | null,
          options: { practice?: boolean } = {},
        ) => {
          commitRun();
          runRef.current = {
            progress: createRunProgress(mode, dailyKey),
            stopwatch: startStopwatch(monotonicNow()),
            unlockedThisRun: [],
            committed: false,
            practice: options.practice ?? false,
          };
        },
      ),
    [commitRun, monotonicNow],
  );

  const recordStack = useMemo(
    () => guarded("recordStack", undefined, (event: StackEvent) => {
      const run = runRef.current;
      if (!run || run.committed) return;
      const elapsed = elapsedSeconds(run.stopwatch, monotonicNow());
      runRef.current = { ...run, progress: applyStack(run.progress, event, elapsed) };
      evaluateRun();
    }),
    [evaluateRun, monotonicNow],
  );

  const breakRun = useCallback(() => {
    const run = runRef.current;
    if (!run || run.committed) return;
    runRef.current = { ...run, progress: breakPerfectRun(run.progress) };
  }, []);

  const recordMiss = useMemo(
    () => guarded("recordMiss", undefined, (terminal: boolean) => {
      // A terminal miss is followed by finishRun; nothing to reset.
      if (!terminal) breakRun();
    }),
    [breakRun],
  );

  const recordUndo = useMemo(() => guarded("recordUndo", undefined, breakRun), [breakRun]);

  const setPaused = useMemo(
    () => guarded("setPaused", undefined, (paused: boolean) => {
      const run = runRef.current;
      if (!run) return;
      const now = monotonicNow();
      const stopwatch = paused
        ? pauseStopwatch(run.stopwatch, now)
        : resumeStopwatch(run.stopwatch, now);
      runRef.current = { ...run, stopwatch };
    }),
    [monotonicNow],
  );

  const finishRun = useMemo(
    () => guarded(
      "finishRun",
      [] as readonly AchievementId[],
      ({ score, world, level, stats }: FinishRunInput): readonly AchievementId[] => {
        const run = runRef.current;
        if (!run) return [];
        if (!run.committed) {
          // RunStats is authoritative at game over (e.g. Zen undo lowers
          // stackCount/perfectCount after the last stack event).
          runRef.current = {
            ...run,
            progress: {
              ...run.progress,
              score,
              world,
              level,
              stackCount: stats.stackCount,
              perfectCount: stats.perfectCount,
              bestStreak: Math.max(run.progress.bestStreak, stats.bestStreak),
            },
          };
          evaluateRun();
          commitRun();
        }
        return runRef.current?.unlockedThisRun ?? [];
      },
    ),
    [evaluateRun, commitRun],
  );

  const abandonRun = useMemo(
    () =>
      guarded(
        "abandonRun",
        undefined,
        (stats?: Pick<RunStats, "stackCount" | "perfectCount"> | null) => {
          const run = runRef.current;
          if (run && !run.committed && stats) {
            runRef.current = {
              ...run,
              progress: {
                ...run.progress,
                stackCount: stats.stackCount,
                perfectCount: stats.perfectCount,
              },
            };
          }
          commitRun();
        },
      ),
    [commitRun],
  );

  const unlock = useMemo(
    () => guarded("unlock", undefined, (id: AchievementId) => {
      if (recordRef.current.unlocked[id] !== undefined) return;
      const at = (optionsRef.current.wallNow ?? Date.now)();
      let granted = false;
      const next = updateAchievementRecord((current) => {
        // Re-checked against storage: another tab may have unlocked it.
        const unlocked = grantAchievement(current.unlocked, id, at);
        granted = unlocked !== null;
        return unlocked ? { ...current, unlocked } : current;
      });
      publish(next);
      if (granted) optionsRef.current.onUnlock?.([id]);
    }),
    [publish],
  );

  return {
    record,
    beginRun,
    recordStack,
    recordMiss,
    recordUndo,
    setPaused,
    finishRun,
    abandonRun,
    unlock,
  };
}
