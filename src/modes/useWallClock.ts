import { useCallback, useState, useSyncExternalStore } from "react";

interface WallClockStore {
  read: () => number;
  refresh: () => void;
}

/**
 * Same clock source as `getLocalDateKey()` (the Date constructor, not
 * `Date.now`), so the countdown's day always agrees with the day a Daily is
 * recorded under, even where `Date.now` is stubbed (E2E fixtures).
 */
const readClock = (): number => new Date().getTime();

/** Outside the hook so the initial clock read is not a render-time call. */
const createWallClockStore = (): WallClockStore => {
  let now = readClock();
  return {
    read: () => now,
    refresh: () => {
      now = readClock();
    },
  };
};

const NO_UNSUBSCRIBE = () => {};

/**
 * Wall-clock time (epoch ms) for a slow UI countdown, outside the game loop.
 *
 * - While a countdown runs (`activeUntil` is set and not reached), a single
 *   interval refreshes the time every `intervalMs`, plus once when the tab
 *   becomes visible again (background timers are throttled or frozen, e.g. a
 *   phone locked overnight). The tick that reaches `activeUntil` publishes
 *   that time and stops the interval: nothing runs once the countdown is
 *   over, or while none is shown.
 * - Each (re)subscription refreshes the value, so a new `activeUntil` or a
 *   new `resetKey` (e.g. the screen) never renders a stale time.
 * - Read through useSyncExternalStore: renders stay pure (no clock calls)
 *   and the value is stable between ticks.
 */
export function useWallClock(
  activeUntil: number | null,
  intervalMs: number,
  resetKey?: unknown,
): number {
  const [store] = useState(createWallClockStore);

  const subscribe = useCallback(
    (onChange: () => void) => {
      // A changed `resetKey` resubscribes: React compares the snapshot right
      // after subscribing and re-renders when this refresh moved it.
      void resetKey;
      store.refresh();
      if (activeUntil === null || store.read() >= activeUntil) return NO_UNSUBSCRIBE;

      // `tick` only runs after this callback returns, once `stop` exists.
      const tick = () => {
        store.refresh();
        if (store.read() >= activeUntil) stop();
        onChange();
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") tick();
      };
      const id = window.setInterval(tick, intervalMs);
      document.addEventListener("visibilitychange", onVisibility);
      const stop = () => {
        window.clearInterval(id);
        document.removeEventListener("visibilitychange", onVisibility);
      };
      return stop;
    },
    [store, activeUntil, intervalMs, resetKey],
  );

  return useSyncExternalStore(subscribe, store.read);
}
