import { test, expect } from "../fixtures";
import { waitForBridge } from "../bridgeHelpers";

/**
 * Render/simulation benchmark (not run in CI: timings are machine-dependent).
 *
 *   npm run perf
 *
 * Pitfall this guards against: if the growing shape outgrows its container
 * the run ends and the loop stops drawing, so a naive benchmark ends up timing
 * a finished game. Every step therefore pins the shape small, and the test
 * asserts the run is still alive and drawing at the end.
 */
const FRAMES = 600;
/** Generous ceiling for CPU-side simulate+draw; catches gross regressions only. */
const MAX_CPU_MS_PER_FRAME = 2;

for (const scenario of [
  { name: "world 5 (effects-heavy), Time Attack", mode: "TIME", stacks: 74 },
  { name: "world 9 (reverse), Zen", mode: "ZEN", stacks: 124 },
] as const) {
  test(`render cost — ${scenario.name}`, async ({ page }) => {
    await page.goto("/");
    await page.click(`button:has-text("${scenario.mode}")`);
    await page.click(".start-btn");
    await waitForBridge(page);

    const result = await page.evaluate(
      ({ stacks, frames }) => {
        const b = window.__GAME_TEST__!;
        b.pause();
        for (let i = 0; i < stacks; i += 1) b.forceStack(0.9);
        const ctx = document.querySelector("canvas")!.getContext("2d")!;
        const keepAlive = () => {
          b.setTimeRemaining(60);
          b.setActiveSize((b.getState().lastSize ?? 100) * 0.5);
        };

        let t0 = performance.now();
        for (let i = 0; i < frames; i += 1) {
          keepAlive();
          b.step(1 / 60);
        }
        const cpuMs = (performance.now() - t0) / frames;

        // Readback forces rasterisation: includes GPU work + sync (noisy).
        t0 = performance.now();
        for (let i = 0; i < 120; i += 1) {
          keepAlive();
          b.step(1 / 60);
          ctx.getImageData(0, 0, 1, 1);
        }
        const withReadbackMs = (performance.now() - t0) / 120;
        const state = b.getState();
        return {
          cpuMs,
          withReadbackMs,
          alive: !state.isGameOver,
          world: state.world,
          shapes: state.stackCount,
        };
      },
      { stacks: scenario.stacks, frames: FRAMES },
    );

    console.log(
      `[perf] ${scenario.name}: cpu ${result.cpuMs.toFixed(3)} ms/frame, ` +
        `with readback ${result.withReadbackMs.toFixed(2)} ms/frame ` +
        `(world ${result.world})`,
    );
    expect(result.alive, "benchmark must measure a live run").toBe(true);
    expect(result.cpuMs).toBeLessThan(MAX_CPU_MS_PER_FRAME);
  });
}
