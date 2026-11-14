import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWallClock } from "./useWallClock";

const MINUTE = 60_000;
const START = new Date(2026, 10, 15, 21, 58, 30).getTime();
const FAR = START + 24 * 60 * MINUTE;

describe("useWallClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks once per interval while a countdown runs", () => {
    const { result } = renderHook(() => useWallClock(FAR, MINUTE));
    expect(result.current).toBe(START);
    expect(vi.getTimerCount()).toBe(1);

    act(() => vi.advanceTimersByTime(MINUTE - 1));
    expect(result.current).toBe(START);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(START + MINUTE);
    act(() => vi.advanceTimersByTime(2 * MINUTE));
    expect(result.current).toBe(START + 3 * MINUTE);
  });

  it("runs no timer without a countdown", () => {
    const { result } = renderHook(() => useWallClock(null, MINUTE));
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(10 * MINUTE));
    expect(result.current).toBe(START);
  });

  it("runs no timer for a countdown already over", () => {
    const { result } = renderHook(() => useWallClock(START - 1, MINUTE));
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current).toBe(START);
  });

  it("publishes the tick that reaches the end, then stops", () => {
    const end = START + 90_000;
    const { result } = renderHook(() => useWallClock(end, MINUTE));
    act(() => vi.advanceTimersByTime(MINUTE));
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(MINUTE));
    expect(result.current).toBe(START + 2 * MINUTE);
    expect(result.current).toBeGreaterThanOrEqual(end);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes when a countdown starts and stops its interval when it is hidden", () => {
    const { result, rerender } = renderHook(
      ({ until }: { until: number | null }) => useWallClock(until, MINUTE),
      { initialProps: { until: null as number | null } },
    );
    vi.setSystemTime(START + 5 * MINUTE);
    rerender({ until: FAR });
    expect(result.current).toBe(START + 5 * MINUTE);
    expect(vi.getTimerCount()).toBe(1);

    rerender({ until: null });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes when the reset key changes, even without a countdown", () => {
    const { result, rerender } = renderHook(
      ({ screen }) => useWallClock(null, MINUTE, screen),
      { initialProps: { screen: "PLAYING" } },
    );
    vi.setSystemTime(START + 42 * MINUTE);
    rerender({ screen: "START" });
    expect(result.current).toBe(START + 42 * MINUTE);
  });

  it("catches up when the tab becomes visible again", () => {
    const { result } = renderHook(() => useWallClock(FAR, MINUTE));
    // Background timers can be frozen: time moves without the interval firing.
    vi.setSystemTime(START + 8 * 60 * MINUTE);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe(START + 8 * 60 * MINUTE);
  });

  it("cleans up on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useWallClock(FAR, MINUTE));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    remove.mockRestore();
  });
});
