/**
 * Canvas "juice": rings, particles, screen shake, flashes and zoom punch.
 *
 * Purely cosmetic and deliberately decoupled from GameState: effects live in
 * their own ref-held value, advance with dt, and are never read by gameplay or
 * containment code. All functions are pure (they return a new EffectsState).
 */
import type { StackQuality } from "../types";
import { isE2eMode } from "../utils/e2e";

export const MAX_PARTICLES = 48;
export const MAX_RINGS = 6;
export const PERFECT_PARTICLES = 14;
export const SHAKE_DURATION = 0.25;
export const ZEN_SHAKE_DURATION = 0.15;
export const FAIL_SHAKE_AMPLITUDE = 9;
export const ZEN_SHAKE_AMPLITUDE = 3;
export const FAIL_FLASH_DURATION = 0.3;
export const WORLD_FLASH_DURATION = 0.45;
export const PUNCH_DURATION = 0.2;
export const PUNCH_SCALE = 0.04;
/** Delay before onGameOver so the fail feedback is visible; 0 under E2E. */
const E2E = isE2eMode();
export const GAME_OVER_DELAY_MS = E2E ? 0 : 400;
/**
 * Time Attack timeout: longer than a fail's beat so the "TIME!" banner and
 * the bell read before the game over screen (the cadence rings on over it).
 * 0 under E2E, like the fail delay.
 */
export const TIME_UP_DELAY_MS = E2E ? 0 : 1000;
/** Time-up ring: life (s), growth (radii per second) and stroke. */
export const TIME_UP_RING_LIFE = 0.8;
export const TIME_UP_RING_GROWTH = 0.9;
export const TIME_UP_RING_WIDTH = 4;
export const TIME_UP_FLASH_DURATION = 0.5;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Ring {
  x: number;
  y: number;
  radius: number;
  growth: number; // px/s
  life: number;
  maxLife: number;
  lineWidth: number;
  color: string;
  alpha: number;
}

interface Timed {
  t: number; // remaining seconds
  dur: number;
}

export interface EffectsState {
  particles: readonly Particle[];
  rings: readonly Ring[];
  shake: Timed & { amp: number };
  /**
   * `danger` marks the fail flash: a semantic signal drawn with the theme's
   * danger colour (kept red-orange in Mono) instead of the palette tint.
   */
  flash: Timed & { color: string; alpha: number; danger: boolean };
  punch: Timed;
}

export const createEffects = (): EffectsState => ({
  particles: [],
  rings: [],
  shake: { t: 0, dur: 0, amp: 0 },
  flash: { t: 0, dur: 0, color: "#fff", alpha: 0, danger: false },
  punch: { t: 0, dur: 0 },
});

export const hasActiveEffects = (fx: EffectsState): boolean =>
  fx.particles.length > 0 ||
  fx.rings.length > 0 ||
  fx.shake.t > 0 ||
  fx.flash.t > 0 ||
  fx.punch.t > 0;

export type Rng = () => number;

export interface StackBurst {
  quality: StackQuality;
  x: number;
  y: number;
  /** On-screen radius of the stacked shape outline. */
  radius: number;
  color: string;
  reducedFx: boolean;
  rng?: Rng;
}

export const spawnStackBurst = (
  fx: EffectsState,
  { quality, x, y, radius, color, reducedFx, rng = Math.random }: StackBurst,
): EffectsState => {
  if (quality !== "PERFECT" && quality !== "GREAT") return fx;
  const perfect = quality === "PERFECT";
  const life = perfect ? 0.45 : 0.3;
  const ring: Ring = {
    x,
    y,
    radius,
    growth: radius * (perfect ? 1.6 : 1.0),
    life,
    maxLife: life,
    lineWidth: perfect ? 3 : 2,
    color,
    alpha: reducedFx ? 0.25 : perfect ? 0.8 : 0.5,
  };
  const rings = [...fx.rings, ring].slice(-MAX_RINGS);
  if (!perfect || reducedFx) return { ...fx, rings };

  const fresh: Particle[] = [];
  for (let i = 0; i < PERFECT_PARTICLES; i++) {
    const angle = ((i + rng() * 0.8) / PERFECT_PARTICLES) * Math.PI * 2;
    const speed = 90 + rng() * 140;
    const pLife = 0.35 + rng() * 0.25;
    fresh.push({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: pLife,
      maxLife: pLife,
      size: 2 + rng() * 2,
      color,
    });
  }
  return {
    ...fx,
    rings,
    particles: [...fx.particles, ...fresh].slice(-MAX_PARTICLES),
  };
};

export const triggerFail = (
  fx: EffectsState,
  reducedFx: boolean,
  zen = false,
): EffectsState => {
  if (reducedFx) return fx;
  const dur = zen ? ZEN_SHAKE_DURATION : SHAKE_DURATION;
  return {
    ...fx,
    shake: {
      t: dur,
      dur,
      amp: zen ? ZEN_SHAKE_AMPLITUDE : FAIL_SHAKE_AMPLITUDE,
    },
    flash: zen
      ? fx.flash
      : {
          t: FAIL_FLASH_DURATION,
          dur: FAIL_FLASH_DURATION,
          color: "#ff2a2a",
          alpha: 0.35,
          danger: true,
        },
  };
};

export const triggerLevelUp = (
  fx: EffectsState,
  reducedFx: boolean,
): EffectsState =>
  reducedFx ? fx : { ...fx, punch: { t: PUNCH_DURATION, dur: PUNCH_DURATION } };

export const triggerWorldUp = (
  fx: EffectsState,
  reducedFx: boolean,
): EffectsState => ({
  ...fx,
  punch: reducedFx ? fx.punch : { t: PUNCH_DURATION, dur: PUNCH_DURATION },
  flash: {
    t: WORLD_FLASH_DURATION,
    dur: WORLD_FLASH_DURATION,
    color: "#ffffff",
    alpha: reducedFx ? 0.15 : 0.6,
    danger: false,
  },
});

export interface TimeUpMark {
  x: number;
  y: number;
  /** On-screen radius of the top stacked shape (where the ring starts). */
  radius: number;
  /** World colour (the theme's HUD primary); Mono tints it at draw time. */
  color: string;
  reducedFx: boolean;
}

/**
 * Time Attack's clock ran out: the calm counterpart of `triggerFail`. One
 * bright ring in the world colour opens from the stack and a soft flash in
 * the same colour fades; it adds no shake and nothing red (a miss that
 * drained the clock keeps the small shake it already started). Reduced
 * effects (the setting defaults to prefers-reduced-motion) keep the signal
 * without the motion: the ring stays in place and both are fainter. Replaces
 * any ring left from the last stack so the mark reads on its own.
 */
export const triggerTimeUp = (
  fx: EffectsState,
  { x, y, radius, color, reducedFx }: TimeUpMark,
): EffectsState => ({
  ...fx,
  rings: [
    {
      x,
      y,
      radius,
      growth: reducedFx ? 0 : radius * TIME_UP_RING_GROWTH,
      life: TIME_UP_RING_LIFE,
      maxLife: TIME_UP_RING_LIFE,
      lineWidth: TIME_UP_RING_WIDTH,
      color,
      alpha: reducedFx ? 0.35 : 0.9,
    },
  ],
  flash: {
    t: TIME_UP_FLASH_DURATION,
    dur: TIME_UP_FLASH_DURATION,
    color,
    alpha: reducedFx ? 0.1 : 0.28,
    danger: false,
  },
});

const decay = <T extends Timed>(v: T, dt: number): T =>
  v.t > 0 ? { ...v, t: Math.max(0, v.t - dt) } : v;

export const updateEffects = (fx: EffectsState, dt: number): EffectsState => {
  if (dt <= 0 || !hasActiveEffects(fx)) return fx;
  const drag = 1 - Math.min(1, 3 * dt);
  return {
    particles: fx.particles
      .filter((p) => p.life - dt > 0)
      .map((p) => ({
        ...p,
        x: p.x + p.vx * dt,
        y: p.y + p.vy * dt,
        vx: p.vx * drag,
        vy: p.vy * drag,
        life: p.life - dt,
      })),
    rings: fx.rings
      .filter((r) => r.life - dt > 0)
      .map((r) => ({
        ...r,
        radius: r.radius + r.growth * dt,
        life: r.life - dt,
      })),
    shake: decay(fx.shake, dt),
    flash: decay(fx.flash, dt),
    punch: decay(fx.punch, dt),
  };
};

/** Screen offset for the current shake, linearly damped. */
export const getShakeOffset = (
  fx: EffectsState,
  rng: Rng = Math.random,
): { x: number; y: number } => {
  const { t, dur, amp } = fx.shake;
  if (t <= 0 || dur <= 0) return { x: 0, y: 0 };
  const k = (t / dur) * amp;
  return { x: (rng() * 2 - 1) * k, y: (rng() * 2 - 1) * k };
};

/** Zoom multiplier (>= 1) for the level-up punch: quick rise, ease-out fall. */
export const getPunchScale = (fx: EffectsState): number => {
  const { t, dur } = fx.punch;
  if (t <= 0 || dur <= 0) return 1;
  const p = 1 - t / dur;
  return 1 + PUNCH_SCALE * Math.sin(Math.PI * p);
};

/**
 * Maps an effect colour at draw time (the Mono look). Must be cheap and
 * allocation-free per call, e.g. a memoised lookup like `toMonoColor`.
 */
export type ColorTint = (color: string) => string;

const identity: ColorTint = (color) => color;

/** Draws rings + particles (world space; call inside the shake/punch transform). */
export const drawEffects = (
  ctx: CanvasRenderingContext2D,
  fx: EffectsState,
  tint: ColorTint = identity,
) => {
  for (const r of fx.rings) {
    ctx.globalAlpha = r.alpha * (r.life / r.maxLife);
    ctx.strokeStyle = tint(r.color);
    ctx.lineWidth = r.lineWidth;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (fx.particles.length > 0) {
    // Batch by colour: one path + fill per colour, no shadowBlur.
    const byColor = new Map<string, Particle[]>();
    for (const p of fx.particles) {
      const list = byColor.get(p.color);
      if (list) list.push(p);
      else byColor.set(p.color, [p]);
    }
    ctx.globalAlpha = 0.9;
    for (const [color, list] of byColor) {
      ctx.fillStyle = tint(color);
      ctx.beginPath();
      for (const p of list) {
        const s = p.size * (p.life / p.maxLife);
        ctx.rect(p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

/**
 * Full-screen flash overlay (screen space). A danger flash uses
 * `dangerColor` (the theme's, e.g. Mono's red-orange) when given: tinting it
 * like a palette colour would turn the fail signal into a "good" green.
 */
export const drawFlash = (
  ctx: CanvasRenderingContext2D,
  fx: EffectsState,
  width: number,
  height: number,
  tint: ColorTint = identity,
  dangerColor?: string,
) => {
  const { t, dur, color, alpha, danger } = fx.flash;
  if (t <= 0 || dur <= 0) return;
  ctx.globalAlpha = alpha * (t / dur);
  ctx.fillStyle = danger && dangerColor ? dangerColor : tint(color);
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
};
