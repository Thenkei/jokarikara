import { getWorldMechanics } from "../constants/game";
import type { GameState } from "../types";
import { getVertices, type Point } from "../utils/geometry";
import type { WorldMechanics } from "./types";

export interface FractureOverlay {
  centers: number[];
  widthRad: number;
}

const TWO_PI = Math.PI * 2;

const normalizeAngle = (angleRad: number): number => {
  const normalized = angleRad % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
};

const shortestAngularDistance = (aRad: number, bRad: number): number => {
  const diff = Math.abs(normalizeAngle(aRad) - normalizeAngle(bRad));
  return Math.min(diff, TWO_PI - diff);
};

const getCircleProbePoints = (state: GameState): Point[] => {
  if (!state.activeShape) return [];
  const radius = state.activeShape.size / 2;
  const rotation = state.activeShape.rotation;

  return [0, 1, 2, 3].map((index) => {
    const angle = rotation + index * (Math.PI / 2);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  });
};

export const isFractureActive = (state: GameState): boolean => {
  if (state.mode !== "CLASSIC" && state.mode !== "TIME_ATTACK") {
    return false;
  }

  const mechanics = getWorldMechanics(state.world);
  if (!mechanics.fractureWindows) return false;
  if (mechanics.fractureDisableOnBoss && state.isBossLevel) return false;
  if (mechanics.fractureSectorCount <= 0) return false;
  if (mechanics.fractureSectorWidthDeg <= 0) return false;
  return true;
};

export const getFractureRotationSpeed = (
  state: GameState,
  mechanics: WorldMechanics,
): number => {
  const levelBoost = Math.max(0, state.level - 1) * 0.06;
  const worldBoost = Math.max(0, state.world - 3) * 0.08;
  const effective = mechanics.fractureBaseRotationSpeed + levelBoost + worldBoost;
  return Math.max(0, Math.min(1.6, effective));
};

export const getFractureSectorCenters = (
  timeSec: number,
  state: GameState,
  mechanics: WorldMechanics,
): number[] => {
  if (mechanics.fractureSectorCount <= 0) return [];

  const speed = getFractureRotationSpeed(state, mechanics);
  const baseAngle = normalizeAngle(timeSec * speed);
  const spacing = TWO_PI / mechanics.fractureSectorCount;

  const centers: number[] = [];
  for (let i = 0; i < mechanics.fractureSectorCount; i += 1) {
    centers.push(normalizeAngle(baseAngle + i * spacing));
  }
  return centers;
};

export const getFractureProbeAngles = (state: GameState): number[] => {
  if (!state.activeShape) return [];

  const localProbePoints =
    state.activeShape.type === "circle"
      ? getCircleProbePoints(state)
      : getVertices(state.activeShape);

  const offset = state.activeOffset ?? { x: 0, y: 0 };
  return localProbePoints.map((point) =>
    normalizeAngle(Math.atan2(point.y + offset.y, point.x + offset.x)),
  );
};

export const isTapBlockedByFracture = (
  state: GameState,
  timeSec: number,
): boolean => {
  if (!state.activeShape) return false;
  if (!isFractureActive(state)) return false;

  const container = state.shapes[state.shapes.length - 1];
  if (!container) return false;

  const mechanics = getWorldMechanics(state.world);
  const sizeRatio = state.activeShape.size / container.size;
  if (sizeRatio < mechanics.fractureBandMinRatio) return false;

  const widthRad = (mechanics.fractureSectorWidthDeg * Math.PI) / 180;
  if (widthRad <= 0) return false;
  const halfWidth = widthRad / 2;

  const sectorCenters = getFractureSectorCenters(timeSec, state, mechanics);
  if (sectorCenters.length === 0) return false;

  const probes = getFractureProbeAngles(state);
  return probes.some((probeAngle) =>
    sectorCenters.some(
      (sectorCenter) =>
        shortestAngularDistance(probeAngle, sectorCenter) <= halfWidth,
    ),
  );
};

export const getFractureOverlay = (
  state: GameState,
  timeSec: number,
): FractureOverlay | null => {
  if (!isFractureActive(state)) return null;

  const mechanics = getWorldMechanics(state.world);
  const widthRad = (mechanics.fractureSectorWidthDeg * Math.PI) / 180;
  if (widthRad <= 0) return null;

  const centers = getFractureSectorCenters(timeSec, state, mechanics);
  if (centers.length === 0) return null;

  return { centers, widthRad };
};
