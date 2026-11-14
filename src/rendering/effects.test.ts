import { describe, it, expect, vi } from "vitest";
import {
  createEffects,
  drawFlash,
  getPunchScale,
  getShakeOffset,
  hasActiveEffects,
  MAX_PARTICLES,
  MAX_RINGS,
  PERFECT_PARTICLES,
  spawnStackBurst,
  triggerFail,
  triggerLevelUp,
  triggerWorldUp,
  updateEffects,
  type StackBurst,
} from "./effects";

const burst = (over: Partial<StackBurst> = {}): StackBurst => ({
  quality: "PERFECT",
  x: 100,
  y: 100,
  radius: 50,
  color: "#0ff",
  reducedFx: false,
  rng: () => 0.5,
  ...over,
});

describe("effects", () => {
  it("starts inactive", () => {
    expect(hasActiveEffects(createEffects())).toBe(false);
  });

  it("PERFECT spawns a ring and particles on the outline", () => {
    const fx = spawnStackBurst(createEffects(), burst());
    expect(fx.rings).toHaveLength(1);
    expect(fx.particles).toHaveLength(PERFECT_PARTICLES);
    for (const p of fx.particles) {
      expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(50, 5);
      expect(p.color).toBe("#0ff");
    }
  });

  it("GREAT spawns a smaller ring and no particles; OK/GOOD nothing", () => {
    const perfect = spawnStackBurst(createEffects(), burst());
    const great = spawnStackBurst(createEffects(), burst({ quality: "GREAT" }));
    expect(great.particles).toHaveLength(0);
    expect(great.rings[0].growth).toBeLessThan(perfect.rings[0].growth);
    expect(great.rings[0].life).toBeLessThan(perfect.rings[0].life);
    const good = createEffects();
    expect(spawnStackBurst(good, burst({ quality: "GOOD" }))).toBe(good);
    expect(spawnStackBurst(good, burst({ quality: "OK" }))).toBe(good);
  });

  it("caps particles and rings", () => {
    let fx = createEffects();
    for (let i = 0; i < 20; i++) fx = spawnStackBurst(fx, burst());
    expect(fx.particles.length).toBe(MAX_PARTICLES);
    expect(fx.rings.length).toBe(MAX_RINGS);
  });

  it("decays and removes expired particles and rings", () => {
    let fx = spawnStackBurst(createEffects(), burst());
    fx = updateEffects(fx, 0.1);
    expect(fx.rings[0].radius).toBeGreaterThan(50);
    expect(fx.particles.length).toBe(PERFECT_PARTICLES);
    fx = updateEffects(fx, 1);
    expect(fx.particles).toHaveLength(0);
    expect(fx.rings).toHaveLength(0);
    expect(hasActiveEffects(fx)).toBe(false);
  });

  it("does not mutate previous state and ignores dt <= 0", () => {
    const fx = spawnStackBurst(createEffects(), burst());
    const before = fx.particles[0].x;
    const next = updateEffects(fx, 0.05);
    expect(fx.particles[0].x).toBe(before);
    expect(updateEffects(fx, 0)).toBe(fx);
    expect(next).not.toBe(fx);
  });

  it("fail triggers ~250ms shake and red flash that fade out", () => {
    let fx = triggerFail(createEffects(), false);
    expect(fx.shake.t).toBeCloseTo(0.25);
    expect(fx.flash.color).toBe("#ff2a2a");
    expect(Math.abs(getShakeOffset(fx, () => 1).x)).toBeGreaterThan(0);
    fx = updateEffects(fx, 0.26);
    expect(fx.shake.t).toBe(0);
    expect(getShakeOffset(fx)).toEqual({ x: 0, y: 0 });
  });

  it("zen miss shakes more subtly and without flash", () => {
    const fail = triggerFail(createEffects(), false);
    const zen = triggerFail(createEffects(), false, true);
    expect(zen.shake.amp).toBeLessThan(fail.shake.amp);
    expect(zen.flash.t).toBe(0);
  });

  it("level up punches zoom; world up flashes white", () => {
    let fx = triggerLevelUp(createEffects(), false);
    fx = updateEffects(fx, 0.1);
    expect(getPunchScale(fx)).toBeGreaterThan(1);
    expect(getPunchScale(createEffects())).toBe(1);
    const w = triggerWorldUp(createEffects(), false);
    expect(w.flash.color).toBe("#ffffff");
    expect(w.flash.t).toBeGreaterThan(0);
  });

  it("reducedFx: no shake, particles, punch; only faint ring/flash", () => {
    const fail = triggerFail(createEffects(), true);
    expect(fail.shake.t).toBe(0);
    expect(fail.flash.t).toBe(0);
    const s = spawnStackBurst(createEffects(), burst({ reducedFx: true }));
    expect(s.particles).toHaveLength(0);
    expect(s.rings).toHaveLength(1);
    expect(s.rings[0].alpha).toBeLessThan(0.5);
    expect(triggerLevelUp(createEffects(), true).punch.t).toBe(0);
    expect(triggerWorldUp(createEffects(), true).punch.t).toBe(0);
  });
});

describe("drawFlash", () => {
  const flashCtx = () =>
    ({
      fillRect: vi.fn(),
      fillStyle: "",
      globalAlpha: 1,
    }) as unknown as CanvasRenderingContext2D;
  const monoTint = (color: string) => `tinted(${color})`;

  it("tints a palette flash but keeps the fail flash on the danger colour", () => {
    const world = flashCtx();
    drawFlash(world, triggerWorldUp(createEffects(), false), 10, 10, monoTint, "#ff4a1f");
    expect(world.fillStyle).toBe("tinted(#ffffff)");

    const fail = flashCtx();
    drawFlash(fail, triggerFail(createEffects(), false), 10, 10, monoTint, "#ff4a1f");
    expect(fail.fillStyle).toBe("#ff4a1f");
    expect(fail.fillRect).toHaveBeenCalledWith(0, 0, 10, 10);
  });

  it("falls back to the stored colour without a danger colour", () => {
    const ctx = flashCtx();
    drawFlash(ctx, triggerFail(createEffects(), false), 10, 10);
    expect(ctx.fillStyle).toBe("#ff2a2a");
  });
});
