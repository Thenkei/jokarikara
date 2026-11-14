import type { StackQuality } from "../types";
import { STYLE_QUALITY_POINTS } from "../constants/game";

/**
 * Daily Challenge: Classic rules, but the run seed is derived from the local
 * calendar date, so every player gets the same shape/colour/speed sequence
 * for the day. Pure helpers only; persistence lives in utils/storage.
 */

/** Local-date key `YYYY-MM-DD` (the day rolls over at local midnight). */
export const getLocalDateKey = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * 32-bit FNV-1a hash of the date key, finalised with an avalanche step so
 * consecutive days produce unrelated seeds.
 */
export const getDailySeed = (dateKey: string): number => {
  let hash = 0x811c9dc5;
  const salted = `shape-stack:daily:${dateKey}`;
  for (let i = 0; i < salted.length; i += 1) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  return hash >>> 0;
};

/** Human label for the date key, e.g. "Nov 14". Falls back to the key. */
export const formatDailyLabel = (dateKey: string, locale?: string): string => {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  try {
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateKey;
  }
};

const QUALITY_BY_POINTS = new Map<number, StackQuality>([
  [STYLE_QUALITY_POINTS.perfect, "PERFECT"],
  [STYLE_QUALITY_POINTS.great, "GREAT"],
  [STYLE_QUALITY_POINTS.good, "GOOD"],
  [STYLE_QUALITY_POINTS.ok, "OK"],
]);

/** Share legend, shared by the Daily trail and the regular run bar. */
export const QUALITY_EMOJI: Readonly<Record<StackQuality, string>> = {
  PERFECT: "🟨",
  GREAT: "🟩",
  GOOD: "🟦",
  OK: "⬜",
};

/** Max stacks shown in the share trail (keeps the message short). */
export const SHARE_TRAIL_LENGTH = 15;

export const qualitiesFromScoreHistory = (
  scoreHistory: readonly number[],
): StackQuality[] =>
  scoreHistory
    .map((points) => QUALITY_BY_POINTS.get(points))
    .filter((q): q is StackQuality => q !== undefined);

export interface DailyShareInput {
  dateKey: string;
  score: number;
  world: number;
  level: number;
  stackCount: number;
  qualities: readonly StackQuality[];
}

/** Spoiler-free result text, Wordle-style: score + quality trail. */
export const buildDailyShareText = ({
  dateKey,
  score,
  world,
  level,
  stackCount,
  qualities,
}: DailyShareInput): string => {
  const trail = qualities
    .slice(0, SHARE_TRAIL_LENGTH)
    .map((q) => QUALITY_EMOJI[q])
    .join("");
  const overflow =
    qualities.length > SHARE_TRAIL_LENGTH
      ? ` +${qualities.length - SHARE_TRAIL_LENGTH}`
      : "";
  const lines = [
    `Shape Stack Daily ${dateKey}`,
    `${score} pts · ${stackCount} stacks · W${world} L${level}`,
  ];
  if (trail) lines.push(`${trail}${overflow}`);
  return lines.join("\n");
};
