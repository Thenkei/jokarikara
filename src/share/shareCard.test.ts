import { describe, expect, it } from "vitest";
import {
  BOARD_SNAPSHOT_SIZE,
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  captureBoardSnapshot,
  drawShareCard,
  parseShareText,
  renderShareCardFile,
} from "./shareCard";
import { buildRunShareText } from "../modes/share";
import { buildDailyShareText } from "../modes/daily";
import { getTranslator } from "../i18n";
import type { StackQuality } from "../types";

const en = getTranslator("en");
const theme = { fontFamily: "Outfit, sans-serif" };

type DrawCall = { type: string; props: Record<string, unknown> };
const drawCalls = (ctx: CanvasRenderingContext2D): DrawCall[] =>
  (ctx as unknown as { __getDrawCalls: () => DrawCall[] }).__getDrawCalls();
const newContext = () => {
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  return canvas.getContext("2d")!;
};

describe("parseShareText", () => {
  it("reads a regular run's title, stats, bar and URL", () => {
    const text = buildRunShareText(en, {
      mode: "CLASSIC",
      score: 1240,
      world: 3,
      level: 2,
      stackCount: 4,
      bestCombo: 3,
      breakdown: { PERFECT: 2, GREAT: 1, GOOD: 0, OK: 1 },
    });
    expect(parseShareText(text)).toEqual({
      title: "Shape Stack · Classic",
      stats: "1240 pts · 4 stacks · W3 L2 · combo x3",
      qualities: ["PERFECT", "PERFECT", "GREAT", "OK"],
      barSuffix: "",
      url: "thenkei.github.io/jokarikara",
    });
  });

  it("keeps a Daily trail in order with its overflow count", () => {
    const qualities = Array.from({ length: 17 }, (_, i): StackQuality =>
      i % 2 ? "GOOD" : "PERFECT",
    );
    const card = parseShareText(
      buildDailyShareText(en, {
        dateKey: "2026-11-15",
        score: 900,
        world: 2,
        level: 1,
        stackCount: 17,
        qualities,
      }),
    );
    expect(card.title).toBe("Shape Stack Daily 2026-11-15");
    expect(card.qualities).toEqual(qualities.slice(0, 15));
    expect(card.barSuffix).toBe("+2");
    expect(card.url).toBe("thenkei.github.io/jokarikara");
  });

  it("has no bar for a run without stacks and never throws on odd input", () => {
    const text = buildRunShareText(en, {
      mode: "TIME_ATTACK",
      score: 0,
      world: 1,
      level: 1,
      stackCount: 0,
      breakdown: { PERFECT: 0, GREAT: 0, GOOD: 0, OK: 0 },
    });
    expect(parseShareText(text).qualities).toEqual([]);
    expect(parseShareText("")).toEqual({
      title: "",
      stats: "",
      qualities: [],
      barSuffix: "",
      url: "thenkei.github.io/jokarikara",
    });
  });
});

describe("drawShareCard", () => {
  const content = parseShareText(
    buildRunShareText(en, {
      mode: "ZEN",
      score: 640,
      world: 2,
      level: 3,
      stackCount: 9,
      breakdown: { PERFECT: 5, GREAT: 3, GOOD: 1, OK: 0 },
    }),
  );

  it("draws the board, the score, the words and one cell per quality", () => {
    const ctx = newContext();
    const board = document.createElement("canvas");
    board.width = BOARD_SNAPSHOT_SIZE;
    board.height = BOARD_SNAPSHOT_SIZE;
    drawShareCard(ctx, content, 640, board, theme);

    const calls = drawCalls(ctx);
    expect(calls.filter((c) => c.type === "drawImage")).toHaveLength(1);
    const texts = calls.filter((c) => c.type === "fillText").map((c) => c.props.text);
    expect(texts).toEqual([
      "SHAPE STACK · ZEN",
      "640",
      "640 pts · 9 stacks · W2 L3",
      "thenkei.github.io/jokarikara",
    ]);
    // Background, board frame, then 9 cells.
    const fills = calls.filter((c) => c.type === "fill");
    expect(fills).toHaveLength(1 + content.qualities.length);
  });

  it("still draws a card without a board snapshot", () => {
    const ctx = newContext();
    drawShareCard(ctx, content, Number.NaN, null, theme);
    const calls = drawCalls(ctx);
    expect(calls.some((c) => c.type === "drawImage")).toBe(false);
    expect(calls.find((c) => c.type === "fillText" && c.props.text === "0")).toBeTruthy();
  });
});

describe("captureBoardSnapshot", () => {
  it("crops the centre square to the snapshot size", () => {
    const source = document.createElement("canvas");
    source.width = 800;
    source.height = 1200;
    const snapshot = captureBoardSnapshot(source);
    expect(snapshot?.width).toBe(BOARD_SNAPSHOT_SIZE);
    const draw = drawCalls(snapshot!.getContext("2d")!).find((c) => c.type === "drawImage");
    expect(draw?.props).toMatchObject({ sx: 0, sy: 200, sWidth: 800, sHeight: 800 });
  });

  it("returns null without a readable canvas", () => {
    expect(captureBoardSnapshot(null)).toBeNull();
    const empty = document.createElement("canvas");
    empty.width = 0;
    expect(captureBoardSnapshot(empty)).toBeNull();
  });
});

describe("renderShareCardFile", () => {
  it("returns a PNG file, or null when the canvas yields no blob", async () => {
    const file = await renderShareCardFile("Shape Stack · Classic\n1 pts", 1, null, theme);
    // vitest-canvas-mock's toBlob yields a blob: a named PNG file.
    if (file) {
      expect(file.type).toBe("image/png");
      expect(file.name).toBe("shape-stack.png");
    } else {
      expect(file).toBeNull();
    }
  });
});
