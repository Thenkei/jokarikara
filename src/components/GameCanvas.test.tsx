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
  playHeartbeat: vi.fn(),
  playComboMilestone: vi.fn(),
  playChime: vi.fn(),
  playRecord: vi.fn(),
  playUi: vi.fn(),
  playCue: vi.fn(),
  setMuted: vi.fn(),
  isMuted: vi.fn(() => false),
  init: vi.fn(),
  resume: vi.fn(),
  getContextState: vi.fn(() => null),
  startMusic: vi.fn(),
  setMusicIntensity: vi.fn(),
  setMusicWorld: vi.fn(),
  pauseMusic: vi.fn(),
  resumeMusic: vi.fn(),
  stopMusic: vi.fn(),
  setMusicEnabled: vi.fn(),
  isMusicEnabled: vi.fn(() => true),
  getMusicState: vi.fn(() => ({
    active: false,
    paused: false,
    enabled: true,
    playing: false,
    intensity: 0 as const,
    world: 1,
  })),
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

    it("plays an audible beat in sync with the Heartbeat world's tempo", () => {
      render(
        <GameCanvas
          mode="ZEN"
          startWorld={10}
          onScore={vi.fn()}
          onGameOver={vi.fn()}
          onLevelUp={vi.fn()}
          onWorldUp={vi.fn()}
          audioService={mockAudioService}
        />
      );

      // ~2.1 s at 60 Hz; 90 BPM = a beat every 2/3 s -> 3 beats crossed.
      runFrames(1000, 128, 1000 / 60);
      expect(mockAudioService.playHeartbeat).toHaveBeenCalledTimes(3);
    });

    it("plays no beat outside Heartbeat worlds", () => {
      render(
        <GameCanvas
          mode="ZEN"
          onScore={vi.fn()}
          onGameOver={vi.fn()}
          onLevelUp={vi.fn()}
          onWorldUp={vi.fn()}
          audioService={mockAudioService}
        />
      );
      runFrames(1000, 128, 1000 / 60);
      expect(mockAudioService.playHeartbeat).not.toHaveBeenCalled();
    });

    describe("timing cue", () => {
      const renderZen = (props: { timingCue?: boolean; startWorld?: number } = {}) =>
        render(
          <GameCanvas
            mode="ZEN"
            onScore={vi.fn()}
            onGameOver={vi.fn()}
            onLevelUp={vi.fn()}
            onWorldUp={vi.fn()}
            audioService={mockAudioService}
            {...props}
          />
        );
      // ~10 s of 60 Hz frames: the first shape grows through the approach.
      const growThrough = () => runFrames(1000, 600, 1000 / 60);

      it("ticks towards the PERFECT band when enabled", () => {
        renderZen({ timingCue: true });
        growThrough();
        const calls = vi.mocked(mockAudioService.playCue).mock.calls;
        expect(calls.length).toBeGreaterThan(5);
        expect(calls.some(([, inWindow]) => !inWindow)).toBe(true);
      });

      it("is silent when disabled (the default)", () => {
        renderZen();
        growThrough();
        expect(mockAudioService.playCue).not.toHaveBeenCalled();
      });

      it("is silent while muted", () => {
        vi.mocked(mockAudioService.isMuted).mockReturnValue(true);
        try {
          renderZen({ timingCue: true });
          growThrough();
          expect(mockAudioService.playCue).not.toHaveBeenCalled();
        } finally {
          vi.mocked(mockAudioService.isMuted).mockReturnValue(false);
        }
      });

      it("is silent while paused", () => {
        const ref = { current: null as GameCanvasHandle | null };
        render(
          <GameCanvas
            ref={ref}
            mode="ZEN"
            timingCue
            onScore={vi.fn()}
            onGameOver={vi.fn()}
            onLevelUp={vi.fn()}
            onWorldUp={vi.fn()}
            audioService={mockAudioService}
          />
        );
        act(() => ref.current?.setPaused(true));
        growThrough();
        expect(mockAudioService.playCue).not.toHaveBeenCalled();
      });

      it("leaves the Heartbeat world to its own beat", () => {
        renderZen({ timingCue: true, startWorld: 10 });
        growThrough();
        expect(mockAudioService.playHeartbeat).toHaveBeenCalled();
        expect(mockAudioService.playCue).not.toHaveBeenCalled();
      });
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

  describe("soundtrack", () => {
    const renderCanvas = (ref?: { current: GameCanvasHandle | null }) =>
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

    it("starts music for the run in world 1 and stops it on unmount", () => {
      const { unmount } = renderCanvas();
      expect(mockAudioService.startMusic).toHaveBeenCalledWith(1);
      expect(mockAudioService.stopMusic).not.toHaveBeenCalled();
      unmount();
      expect(mockAudioService.stopMusic).toHaveBeenCalled();
    });

    it("pauses and resumes music with the game", () => {
      const ref = { current: null } as { current: GameCanvasHandle | null };
      renderCanvas(ref);
      act(() => ref.current?.setPaused(true));
      expect(mockAudioService.pauseMusic).toHaveBeenCalledTimes(1);
      act(() => ref.current?.setPaused(false));
      expect(mockAudioService.resumeMusic).toHaveBeenCalledTimes(1);
    });

    it("raises the music intensity as the combo streak grows", async () => {
      const { container } = renderCanvas();
      const canvas = container.querySelector("canvas");
      if (!canvas) throw new Error("Canvas not found");
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const intensities: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        tap(canvas);
        const calls = vi.mocked(mockAudioService.setMusicIntensity).mock.calls;
        intensities.push(calls[calls.length - 1]?.[0] as number);
      }
      expect(intensities).toEqual([0, 0, 1, 1, 1, 2]);
      expect(mockAudioService.setMusicWorld).toHaveBeenCalledWith(1);
    });
  });

  it("celebrates combo milestones in Classic but not in Zen", async () => {
    for (const mode of ["CLASSIC", "ZEN"] as const) {
      vi.clearAllMocks();
      const { container, unmount } = render(
        <GameCanvas
          mode={mode}
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
      // Freshly spawned shapes are tiny, so immediate taps always fit
      // (Zen ignores them as too early, so it never stacks at all).
      for (let i = 0; i < 5; i += 1) tap(canvas);

      if (mode === "CLASSIC") {
        expect(mockAudioService.playComboMilestone).toHaveBeenCalledTimes(1);
        expect(mockAudioService.playComboMilestone).toHaveBeenCalledWith(1, 1);
      } else {
        expect(mockAudioService.playComboMilestone).not.toHaveBeenCalled();
      }
      unmount();
    }
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
