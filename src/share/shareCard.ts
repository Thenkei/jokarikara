import type { StackQuality } from "../types";
import { QUALITY_EMOJI } from "../modes/daily";
import { GAME_URL } from "../modes/share";

/**
 * Share image: the board as the run ended, under the same words as the share
 * text. The card is a rendering of that text (title, stats, quality bar, URL)
 * so both stay in sync with one source of wording and i18n. Pure drawing on
 * a 2D context; the DOM glue (snapshot, blob) is at the bottom.
 */

/** 4:5 portrait: fills a phone share preview and most feeds without a crop. */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;
/** Side of the square board snapshot kept at run end (device pixels). */
export const BOARD_SNAPSHOT_SIZE = 960;

/** Quality bar cells, the colours of the share text's emoji legend. */
export const QUALITY_CELL_COLORS: Readonly<Record<StackQuality, string>> = {
  PERFECT: "#f7c52b",
  GREAT: "#3fc46e",
  GOOD: "#3d8bf2",
  OK: "#e6e8ee",
};

const EMOJI_TO_QUALITY = new Map<string, StackQuality>(
  (Object.entries(QUALITY_EMOJI) as [StackQuality, string][]).map(([q, e]) => [e, q]),
);

export interface ShareCardContent {
  title: string;
  stats: string;
  /** Quality cells, in the order of the text's bar (may be empty). */
  qualities: StackQuality[];
  /** Text after the bar's cells (Daily "+12" overflow), trimmed. */
  barSuffix: string;
  /** Display URL, without the scheme. */
  url: string;
}

/**
 * Reads a share text (`buildRunShareText` / `buildDailyShareText`): title,
 * stats, an optional emoji bar, then the URL (the game's when absent).
 * Unknown extra lines are ignored, a missing line reads as empty: never
 * throws.
 */
export const parseShareText = (text: string): ShareCardContent => {
  const lines = text.split("\n").map((line) => line.trim());
  const [title = "", stats = ""] = lines;
  // The Daily text carries no link: the card always names the game.
  const urlLine = lines.slice(2).find((line) => /^https?:\/\//.test(line)) ?? GAME_URL;
  const barLine =
    lines.slice(2).find((line) => EMOJI_TO_QUALITY.has(Array.from(line)[0] ?? "")) ?? "";

  const qualities: StackQuality[] = [];
  const chars = Array.from(barLine);
  let index = 0;
  for (; index < chars.length; index += 1) {
    const quality = EMOJI_TO_QUALITY.get(chars[index]);
    if (!quality) break;
    qualities.push(quality);
  }
  return {
    title,
    stats,
    qualities,
    barSuffix: chars.slice(index).join("").trim(),
    url: urlLine.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  };
};

export interface ShareCardTheme {
  /** CSS font-family list (the app's, so the card reads like the game). */
  fontFamily: string;
}

/** Drawable board snapshot (a canvas in the app, any image source in tests). */
export type BoardImage = CanvasImageSource & { width: number; height: number };

const BG_TOP = "#14141b";
const BG_BOTTOM = "#09090c";
const TEXT_MAIN = "#f5f7fb";
const TEXT_MUTED = "#a9b0bf";
const TEXT_FAINT = "#7d8494";

const BOARD_TOP = 70;
const BOARD_SIDE = 820;
const CELL = 46;
const CELL_GAP = 10;
const CELL_RADIUS = 10;
const MAX_CELLS = 15;

/** Separator between the share text's stats ("1240 pts · 42 stacks · W3 L2"). */
const STATS_SEPARATOR = " · ";

/**
 * The stats line without its score segment: the card already shows the score
 * as its headline. Drops only the first segment that starts with the score
 * ("1240 pts"), so a run of 0 points keeps its "0 stacks".
 */
export const statsWithoutScore = (stats: string, score: number): string => {
  const segments = stats.split(STATS_SEPARATOR);
  const index = segments.findIndex((segment) => segment.startsWith(`${score} `));
  if (index === -1) return stats;
  return segments.filter((_, i) => i !== index).join(STATS_SEPARATOR);
};

/** Shrinks the font until `text` fits `maxWidth` (long French titles). */
const fitFont = (
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  family: string,
  maxWidth: number,
): void => {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (px > 18 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/**
 * Draws the card on a SHARE_CARD_WIDTH × SHARE_CARD_HEIGHT context: the board
 * in a rounded frame, then title, score, stats, the quality bar and the URL.
 */
export const drawShareCard = (
  ctx: CanvasRenderingContext2D,
  content: ShareCardContent,
  score: number,
  board: BoardImage | null,
  { fontFamily }: ShareCardTheme,
): void => {
  const W = SHARE_CARD_WIDTH;
  const H = SHARE_CARD_HEIGHT;
  const textWidth = W - 120;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const boardX = (W - BOARD_SIDE) / 2;
  ctx.save();
  roundedRect(ctx, boardX, BOARD_TOP, BOARD_SIDE, BOARD_SIDE, 36);
  ctx.fillStyle = "#0d0d12";
  ctx.fill();
  if (board) {
    ctx.clip();
    ctx.drawImage(board, boardX, BOARD_TOP, BOARD_SIDE, BOARD_SIDE);
  }
  ctx.restore();
  roundedRect(ctx, boardX, BOARD_TOP, BOARD_SIDE, BOARD_SIDE, 36);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let y = BOARD_TOP + BOARD_SIDE + 72;

  ctx.fillStyle = TEXT_MUTED;
  fitFont(ctx, content.title.toUpperCase(), 700, 38, fontFamily, textWidth);
  ctx.fillText(content.title.toUpperCase(), W / 2, y);

  y += 132;
  ctx.fillStyle = TEXT_MAIN;
  const shownScore = Math.max(0, Math.floor(Number.isFinite(score) ? score : 0));
  const scoreText = String(shownScore);
  fitFont(ctx, scoreText, 800, 136, fontFamily, textWidth);
  ctx.fillText(scoreText, W / 2, y);

  y += 62;
  ctx.fillStyle = TEXT_MUTED;
  const stats = statsWithoutScore(content.stats, shownScore);
  fitFont(ctx, stats, 600, 36, fontFamily, textWidth);
  ctx.fillText(stats, W / 2, y);

  const cells = content.qualities.slice(0, MAX_CELLS);
  if (cells.length > 0) {
    y += 40;
    ctx.font = `700 34px ${fontFamily}`;
    const suffix = content.barSuffix;
    const suffixWidth = suffix ? ctx.measureText(suffix).width + 16 : 0;
    const barWidth = cells.length * CELL + (cells.length - 1) * CELL_GAP + suffixWidth;
    let x = (W - barWidth) / 2;
    for (const quality of cells) {
      roundedRect(ctx, x, y, CELL, CELL, CELL_RADIUS);
      ctx.fillStyle = QUALITY_CELL_COLORS[quality];
      ctx.fill();
      x += CELL + CELL_GAP;
    }
    if (suffix) {
      ctx.fillStyle = TEXT_MUTED;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(suffix, x - CELL_GAP + 16, y + CELL / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
    }
  }

  ctx.fillStyle = TEXT_FAINT;
  ctx.font = `600 30px ${fontFamily}`;
  ctx.fillText(content.url, W / 2, H - 44);
};

/**
 * Square crop of the board around its centre, scaled to BOARD_SNAPSHOT_SIZE.
 * Called once when a run ends, while the canvas still holds the last frame
 * the player saw. Null when the canvas can't be read (no 2D context).
 */
export const captureBoardSnapshot = (
  canvas: HTMLCanvasElement | null,
): HTMLCanvasElement | null => {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    const side = Math.min(canvas.width, canvas.height);
    const snapshot = document.createElement("canvas");
    snapshot.width = BOARD_SNAPSHOT_SIZE;
    snapshot.height = BOARD_SNAPSHOT_SIZE;
    const ctx = snapshot.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      canvas,
      (canvas.width - side) / 2,
      (canvas.height - side) / 2,
      side,
      side,
      0,
      0,
      BOARD_SNAPSHOT_SIZE,
      BOARD_SNAPSHOT_SIZE,
    );
    return snapshot;
  } catch {
    return null;
  }
};

/** File name of the shared image. */
export const SHARE_IMAGE_NAME = "shape-stack.png";

/**
 * Renders the card to a PNG `File` for `navigator.share({ files })`. Null on
 * any failure (no 2D context, toBlob unsupported or empty): the caller then
 * shares the text alone.
 */
export const renderShareCardFile = async (
  text: string,
  score: number,
  board: BoardImage | null,
  theme: ShareCardTheme,
): Promise<File | null> => {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = SHARE_CARD_WIDTH;
    canvas.height = SHARE_CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    drawShareCard(ctx, parseShareText(text), score, board, theme);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob || blob.size === 0) return null;
    return new File([blob], SHARE_IMAGE_NAME, { type: "image/png" });
  } catch {
    return null;
  }
};
