import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/**
 * Phone layout geometry shared by tests/hud-layout.spec.ts (English) and
 * tests/i18n.spec.ts (French, ~20 % longer labels): every HUD piece is
 * checked against PAUSE and the viewport.
 */

export type Box = { x: number; y: number; width: number; height: number };

/** Stacks for world 10, level 5: (9 worlds x 5 levels + 4 levels) x 3. */
export const STACKS_TO_W10_L5 = 147;

export const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
];

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const insideViewport = (box: Box, viewport: { width: number; height: number }) =>
  box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;

/** Registered after the fixture's localStorage.clear(), so it survives it. */
export const seedBest = (page: Page, mode: "TIME_ATTACK" | "ZEN", score: number) =>
  page.addInitScript(
    ({ mode, score }) => {
      localStorage.setItem(
        "shape-stack-high-scores-v3",
        JSON.stringify({
          CLASSIC: [],
          ZEN: [],
          TIME_ATTACK: [],
          [mode]: [{ score, date: "1/1/2026" }],
        }),
      );
    },
    { mode, score },
  );

/** PERFECT stacks on a paused game, in one round trip. */
export const stackMany = (page: Page, stacks: number) =>
  page.evaluate((count) => {
    for (let i = 0; i < count; i += 1) window.__GAME_TEST__?.forceStack(0.98);
  }, stacks);

export const boxOf = async (page: Page, selector: string): Promise<Box> => {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} has no layout box`);
  return box;
};

/** Every HUD piece in the two always-visible rows, with its row's box. */
const hudPieces = (page: Page) =>
  page.evaluate(() => {
    const toBox = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return Array.from(document.querySelectorAll(".hud-primary, .hud-meta")).flatMap((row) => [
      { label: `${row.className}: ${row.textContent ?? ""}`, box: toBox(row), row: null },
      ...Array.from(row.children).map((piece) => ({
        label: `${piece.className}: ${piece.textContent ?? ""}`,
        box: toBox(piece),
        row: toBox(row),
      })),
    ]);
  });

/** Within its row (a chip pushed past the pill's edge is a hidden chip). */
const insideRow = (box: Box, row: Box) =>
  box.x >= row.x - 0.5 && box.x + box.width <= row.x + row.width + 0.5;

export const expectHudClearOfPause = async (
  page: Page,
  viewport: { width: number; height: number },
) => {
  const pause = await boxOf(page, ".pause-btn");
  expect(insideViewport(pause, viewport)).toBe(true);
  const pill = await boxOf(page, ".hud-primary");
  expect(intersects(pill, pause), "score pill overlaps PAUSE").toBe(false);
  for (const piece of await hudPieces(page)) {
    expect(insideViewport(piece.box, viewport), `${piece.label} is clipped`).toBe(true);
    expect(intersects(piece.box, pause), `${piece.label} overlaps PAUSE`).toBe(false);
    if (piece.row) expect(insideRow(piece.box, piece.row), `${piece.label} overflows`).toBe(true);
  }
};

/**
 * Waits for running finite animations (entrances) to end, so boxes are
 * measured on the resting frame, not mid-slide.
 */
export const settleAnimations = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const finite = document.getAnimations().filter((animation) => {
      const end = Number(animation.effect?.getComputedTiming().endTime);
      return animation.playState === "running" && Number.isFinite(end);
    });
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });

/**
 * Text that does not fit its box: wider than the element (clipped or
 * ellipsised) for every element matching `selector`. Returns their labels.
 */
export const overflowingText = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      Array.from(document.querySelectorAll<HTMLElement>(sel))
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => `${element.className}: ${element.textContent ?? ""}`),
    selector,
  );
