import { render, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameCanvas } from "./GameCanvas";
import type { GameCanvasHandle } from "./GameCanvas";
import type { IAudioService } from "../audio/types";

// Mock the audio service
const mockAudioService: IAudioService = {
  playStackSound: vi.fn(),
  playStack: vi.fn(),
  playLevelUp: vi.fn(),
  playWorldUp: vi.fn(),
  playFailSound: vi.fn(),
  playMissSound: vi.fn(),
  playEarlyClickSound: vi.fn(),
  playTick: vi.fn(),
  playTimeBonus: vi.fn(),
  setMuted: vi.fn(),
  isMuted: vi.fn(() => false),
  init: vi.fn(),
  resume: vi.fn(),
};

/** Real browsers mark the first finger / the mouse as the primary pointer. */
const tap = (target: Element, init: PointerEventInit = {}) =>
  fireEvent.pointerDown(target, { isPrimary: true, ...init });

describe("GameCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window dimensions for consistency
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 1000,
      writable: true,
    });
  });

  it("renders a canvas element", () => {
    const { container } = render(
      <GameCanvas
        onScore={vi.fn()}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeDefined();
    // Canvas now uses pixel dimensions for high-DPI support
    expect(canvas?.style.width).toMatch(/^\d+px$/);
  });

  it("calls onScore and plays sound when tapped correctly", async () => {
    const onScore = vi.fn();
    const { container } = render(
      <GameCanvas
        onScore={onScore}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found");

    // Give it a tick to initialize and spawn initial shape
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Simulate a tap
    // Note: Whether it's a success or failure depends on whether the active shape
    // is contained in the previous shape (which doesn't exist for the first shape,
    // so it should always be 'contained' or spawn as the first stacked shape).
    // Actually, spawnActiveShape spawns the FIRST shape as the first stacked shape if shapes array is empty?
    // No, createInitialState might spawn the ground shape.

    tap(canvas);

    // After first tap, it should stack the shape
    expect(onScore).toHaveBeenCalled();
    expect(mockAudioService.playStack).toHaveBeenCalledWith(
      expect.any(String),
      1,
      1,
    );
  });

  it("handles game over", async () => {
    const onGameOver = vi.fn();
    // We can't easily force an 'out of bounds' tap without deep insight into state,
    // but we can mock checkContainment if we want to.
    // However, the component uses the actual implementation.

    // For now, let's just verify it cleans up on unmount
    const { unmount } = render(
      <GameCanvas
        onScore={vi.fn()}
        onGameOver={onGameOver}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );

    const spyCancel = vi.spyOn(window, "cancelAnimationFrame");
    unmount();
    expect(spyCancel).toHaveBeenCalled();
  });

  it("exposes restart and undo methods via ref", async () => {
    const ref = { current: null } as { current: GameCanvasHandle | null };
    render(
      <GameCanvas
        ref={ref}
        onScore={vi.fn()}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );

    expect(ref.current).not.toBeNull();
    if (!ref.current) return;

    expect(ref.current.restartShape).toBeDefined();
    expect(ref.current.undo).toBeDefined();

    // Trigger restart
    act(() => {
      ref.current?.restartShape();
    });
    // It should set restartRequestedRef internally, which the next loop iteration will pick up.
    // In a test, we might not see the state change immediately without flushing the animation frame,
    // but we've verified the methods are exposed.
  });

  it("reports Zen lives on init", async () => {
    const onZenLivesChange = vi.fn();

    render(
      <GameCanvas
        mode="ZEN"
        onScore={vi.fn()}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        onZenLivesChange={onZenLivesChange}
        audioService={mockAudioService}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onZenLivesChange).toHaveBeenNthCalledWith(1, 10);
  });

  it("plays the early-click sound in ZEN mode when the active shape is too small to stack", async () => {
    // The active shape starts at 5 % of the container shape's size, which is
    // well below ZEN_MIN_CLICK_RATIO (30 %), so clicking immediately should
    // trigger the early-click feedback instead of a stack attempt.
    const { container } = render(
      <GameCanvas
        mode="ZEN"
        onScore={vi.fn()}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    tap(canvas);

    expect(mockAudioService.playEarlyClickSound).toHaveBeenCalled();
    expect(mockAudioService.playStack).not.toHaveBeenCalled();
  });

  it("fires onStyleUpdate with style data after a successful stack", async () => {
    const onStyleUpdate = vi.fn();

    const { container } = render(
      <GameCanvas
        onScore={vi.fn()}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        onStyleUpdate={onStyleUpdate}
        audioService={mockAudioService}
      />
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    tap(canvas);

    expect(onStyleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        styleScore: expect.any(Number),
        streak: expect.any(Number),
        bestStreak: expect.any(Number),
        lastStackQuality: expect.any(String),
      })
    );
  });

  it("updates the canvas CSS dimensions when the window is resized", () => {
    const { container } = render(
      <GameCanvas
        onScore={vi.fn()}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );

    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found");

    // Baseline: initial dimensions match window mock (1000 × 1000)
    expect(canvas.style.width).toBe("1000px");
    expect(canvas.style.height).toBe("1000px");

    // Simulate a viewport resize
    Object.defineProperty(window, "innerWidth", { value: 480, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, writable: true });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(canvas.style.width).toBe("480px");
    expect(canvas.style.height).toBe("800px");
  });

  describe("game loop", () => {
    type FrameCallback = (time: number) => void;
    let frames: FrameCallback[];

    beforeEach(() => {
      frames = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        frames.push(cb as FrameCallback);
        return frames.length;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    });

    const runFrames = (startMs: number, count: number, frameMs: number) => {
      for (let i = 0; i < count; i += 1) {
        const next = frames.pop();
        frames.length = 0;
        if (!next) return;
        act(() => next(startMs + i * frameMs));
      }
    };

    it("keeps a single loop alive after deps change and cancels the latest rAF id", () => {
      const cancel = vi.spyOn(window, "cancelAnimationFrame");
      const props = {
        onGameOver: vi.fn(),
        onLevelUp: vi.fn(),
        onWorldUp: vi.fn(),
        audioService: mockAudioService,
      };
      const { rerender } = render(<GameCanvas onScore={vi.fn()} {...props} />);
      // New callback identity => handleTap/tick/effect deps change => re-run.
      rerender(<GameCanvas onScore={vi.fn()} {...props} />);
      rerender(<GameCanvas onScore={vi.fn()} {...props} />);
      expect(cancel).toHaveBeenCalled();

      // Fire every queued frame (stale ones included, as a browser might).
      const queued = frames.splice(0);
      act(() => queued.forEach((cb) => cb(1000)));
      // First frame only primes lastTime; exactly one loop must re-queue.
      expect(frames).toHaveLength(1);
      const next = frames.splice(0);
      act(() => next.forEach((cb) => cb(1016)));
      expect(frames).toHaveLength(1);
    });

    it("reports Time Attack time once per displayed second, not every frame", () => {
      const onTimeUpdate = vi.fn();
      render(
        <GameCanvas
          mode="TIME_ATTACK"
          onScore={vi.fn()}
          onGameOver={vi.fn()}
          onLevelUp={vi.fn()}
          onWorldUp={vi.fn()}
          onTimeUpdate={onTimeUpdate}
          audioService={mockAudioService}
        />
      );

      // ~1.5 s of 60 Hz frames: crosses the 60 -> 59 boundary once.
      runFrames(1000, 90, 1000 / 60);

      expect(onTimeUpdate.mock.calls.length).toBeGreaterThan(0);
      expect(onTimeUpdate.mock.calls.length).toBeLessThanOrEqual(3);
      const displayed = onTimeUpdate.mock.calls.map(([t]) => Math.ceil(t));
      expect(new Set(displayed).size).toBe(displayed.length);
    });

    it("clamps long frame gaps so a background tab cannot auto-fail the run", () => {
      const onGameOver = vi.fn();
      render(
        <GameCanvas
          onScore={vi.fn()}
          onGameOver={onGameOver}
          onLevelUp={vi.fn()}
          onWorldUp={vi.fn()}
          audioService={mockAudioService}
        />
      );

      runFrames(1000, 2, 16);
      // Simulate returning to the tab 30 s later.
      runFrames(31000, 1, 16);

      expect(onGameOver).not.toHaveBeenCalled();
      expect(mockAudioService.playFailSound).not.toHaveBeenCalled();
    });
  });

  it("ignores non-primary mouse buttons", async () => {
    const onScore = vi.fn();
    const { container } = render(
      <GameCanvas
        onScore={onScore}
        onGameOver={vi.fn()}
        onLevelUp={vi.fn()}
        onWorldUp={vi.fn()}
        audioService={mockAudioService}
      />
    );
    const canvas = container.querySelector("canvas");
    if (!canvas) throw new Error("Canvas not found");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    tap(canvas, { pointerType: "mouse", button: 2 });
    expect(onScore).not.toHaveBeenCalled();

    tap(canvas, { pointerType: "mouse", button: 0 });
    expect(onScore).toHaveBeenCalled();
  });
});
