import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, seedBestWorld, waitForBridge } from "./bridgeHelpers";
import { WORLD_HOW_TO } from "../src/gameplay/atlas";
import { FIRST_VISIT_GRACE_MS } from "../src/gameplay/worldIntro";

/**
 * First visit to a world: the world-up overlay teaches the mechanic (atlas
 * how-to line) and holds the game until a key press / tap. Driven by the
 * keyboard (WebKit in CI spends seconds per click).
 */

const STACKS_PER_WORLD = 15;

const startClassic = async (page: Page) => {
  await page.goto("/");
  await page.locator(".start-btn").press("Enter");
  await waitForBridge(page);
};

/** Stack straight into `world` in one round trip (the real loop keeps running). */
const reachWorld = (page: Page, world: number) =>
  page.evaluate((stacks) => {
    for (let i = 0; i < stacks; i += 1) window.__GAME_TEST__!.forceStack(0.9);
    return window.__GAME_TEST__!.getState();
  }, (world - 1) * STACKS_PER_WORLD);

/** Let the real loop run a few frames. */
const frames = (page: Page, count: number) =>
  page.evaluate(
    (total) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const next = () => (++seen >= total ? resolve() : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    count,
  );

test.describe("First-visit world intro", () => {
  test("teaches a new world and holds the game until a key press @cross-browser", async ({
    page,
  }) => {
    await seedBestWorld(page, 1);
    await startClassic(page);
    const bridge = makeBridge(page);
    // WebKit in CI can spend the real 9 s max wait between two assertions;
    // this test is about the key press (the timeout is unit-tested).
    await page.evaluate(() => window.__GAME_TEST__!.setWorldIntroMaxHold(10 * 60_000));

    const held = await reachWorld(page, 2);
    expect(held.world).toBe(2);
    await expect(page.locator(".world-up-name")).toHaveText("Breathing");
    await expect(page.getByTestId("world-up-howto")).toHaveText(WORLD_HOW_TO[2]);
    await expect(page.locator(".world-up-continue")).toHaveText("TAP TO PLAY");
    await expect(page.locator(".sr-only[aria-live='polite']")).toContainText(
      WORLD_HOW_TO[2],
    );

    // The real loop keeps rendering, but the shape does not grow.
    await frames(page, 30);
    const still = await bridge.getState();
    expect(still?.worldIntro).toBe(2);
    expect(still?.activeSize).toBe(held.activeSize);
    expect(still?.isGameOver).toBe(false);

    // Past the grace period, one key press only dismisses (no stack).
    await page.waitForTimeout(FIRST_VISIT_GRACE_MS + 50);
    await page.keyboard.press("Space");
    await expect(page.getByTestId("world-up")).toBeHidden();
    const resumed = await bridge.getState();
    expect(resumed?.worldIntro).toBeNull();
    expect(resumed?.stackCount).toBe(held.stackCount);

    // Play resumes: the shape grows again.
    await expect
      .poll(async () => (await bridge.getState())?.activeSize ?? 0)
      .toBeGreaterThan(held.activeSize ?? 0);
  });

  test("a world already reached keeps the short overlay and the game running", async ({
    page,
  }) => {
    await seedBestWorld(page, 5);
    await startClassic(page);
    const bridge = makeBridge(page);

    const entered = await reachWorld(page, 2);
    await expect(page.locator(".world-up-name")).toHaveText("Breathing");
    await expect(page.getByTestId("world-up-howto")).toHaveCount(0);
    expect((await bridge.getState())?.worldIntro).toBeNull();
    await expect
      .poll(async () => (await bridge.getState())?.activeSize ?? 0)
      .toBeGreaterThan(entered.activeSize ?? 0);
    // The short overlay goes by itself.
    await expect(page.getByTestId("world-up")).toBeHidden();
  });

  test("the teaching panel fits a small phone and stays clear of PAUSE", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await seedBestWorld(page, 1);
    await startClassic(page);

    // World 3 has the longest how-to line.
    await reachWorld(page, 3);
    const panel = page.getByTestId("world-up");
    await expect(page.getByTestId("world-up-howto")).toHaveText(WORLD_HOW_TO[3]);
    const box = await panel.boundingBox();
    const pause = await page.locator(".pause-btn").boundingBox();
    if (!box || !pause) throw new Error("missing layout box");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(568);
    const overlaps =
      box.x < pause.x + pause.width &&
      pause.x < box.x + box.width &&
      box.y < pause.y + pause.height &&
      pause.y < box.y + box.height;
    expect(overlaps, "teaching panel under PAUSE").toBe(false);
  });
});
