/**
 * Layers of the start screen backdrop (kept out of the component module so
 * React Fast Refresh only sees component exports there).
 */
export interface BackdropLayer {
  /** Regular polygon side count; 0 = circle. */
  sides: number;
  /** Circumradius in viewBox units (viewBox is 100 wide). */
  radius: number;
  /** Seconds per revolution; negative spins counter-clockwise. */
  period: number;
}

/** Outside-in, mirroring how a run unlocks shapes. */
export const BACKDROP_LAYERS: readonly BackdropLayer[] = [
  { sides: 0, radius: 48, period: 0 },
  { sides: 8, radius: 44, period: 90 },
  { sides: 6, radius: 37, period: -70 },
  { sides: 5, radius: 30, period: 55 },
  { sides: 4, radius: 23, period: -45 },
  { sides: 3, radius: 17, period: 35 },
];
