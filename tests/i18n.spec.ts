import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  ALL_WORLDS_REACHED,
  makeBridge,
  seedBestWorld,
  waitForBridge,
} from "./bridgeHelpers";
import {
  boxOf,
  expectHudClearOfPause,
  insideViewport,
  intersects,
  overflowingText,
  seedBest,
  settleAnimations,
  stackMany,
  STACKS_TO_W10_L5,
} from "./layoutHelpers";
import { expectNoViolations } from "./axeHelpers";
import { GAME_URL } from "../src/modes/share";

/**
 * French UI, picked from the browser language. The rest of the suite runs on
 * Playwright's default en-US and stays English; this spec runs the browser in
 * French. Menus are driven by the keyboard (`locator.press`): same handlers,
 * no per-click actionability wait (seconds on WebKit in CI).
 */
test.use({ locale: "fr-FR" });

const SETTINGS_KEY = "shape-stack-settings";
const KEPT = "e2e-kept-settings";
const SMALL_PHONE = { width: 320, height: 568 };
/** French narrow no-break space (before ! and units). */
const NNBSP = "\u202f";

const settingsDialog = (page: Page, name: string) => page.getByRole("dialog", { name });

/** START from the keyboard, then freeze the loop (bridge manual mode). */
const startFrozenRun = async (page: Page) => {
  await page.locator(".start-btn").press("Enter");
  await waitForBridge(page);
  const bridge = makeBridge(page);
  await bridge.pause();
  await expect(page.locator(".hud-primary")).toBeVisible();
  return bridge;
};

/** A few PERFECT stacks, then outgrow the last shape: the Classic run ends. */
const loseClassicRun = async (page: Page) => {
  const bridge = await startFrozenRun(page);
  for (let i = 0; i < 3; i += 1) await bridge.forceStack(0.98);
  const state = await bridge.getState();
  await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
  await bridge.step(0.016);
  await expect(page.locator(".gameover-screen")).toBeVisible();
};

const pickMode = async (page: Page, name: string) => {
  const radio = page.getByRole("radio", { name });
  await radio.press("Enter");
  await expect(radio).toBeChecked();
};

test.describe("French UI", () => {
  test.beforeEach(({ browserName }) => {
    // WebKit in CI takes seconds per click.
    test.slow(browserName === "webkit");
  });

  test("the start screen follows the French browser", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator(".start-btn")).toHaveText("JOUER");
    await expect(page.locator(".subtitle")).toHaveText("Touche pour empiler. Sans déborder.");
    const modes = page.getByRole("radiogroup", { name: "Mode de jeu" });
    await expect(modes.getByRole("radio")).toHaveText(["CLASSIQUE", "ZEN", "CHRONO"]);
    await expect(page.locator(".mode-description")).toHaveText("Une erreur et c'est fini.");
    await expect(page.locator(".daily-btn-title")).toHaveText("DÉFI DU JOUR");
    // "15 novembre · À JOUER": the day is spelled out in French.
    await expect(page.locator(".daily-btn-meta")).toHaveText(/^\d{1,2} \p{L}+ · À JOUER$/u);
    await expect(page.locator(".achievements-btn")).toHaveAttribute(
      "aria-label",
      "Succès\u00a0: 0 sur 14 débloqués",
    );
    await expect(page.getByRole("button", { name: "Réglages" })).toBeVisible();
  });

  test("the settings sheet overrides the browser, and the choice survives a reload", async ({
    page,
  }) => {
    // The fixture clears localStorage on every navigation (reloads included):
    // carry the saved settings across each reload via sessionStorage.
    await page.addInitScript((key) => {
      const kept = sessionStorage.getItem(key);
      if (kept) localStorage.setItem("shape-stack-settings", kept);
    }, KEPT);
    const reloadKeepingSettings = async () => {
      await page.evaluate(
        ({ kept, settings }) =>
          sessionStorage.setItem(kept, localStorage.getItem(settings) ?? ""),
        { kept: KEPT, settings: SETTINGS_KEY },
      );
      await page.reload();
    };

    await page.goto("/");
    await page.locator(".settings-gear-btn").press("Enter");
    const french = settingsDialog(page, "RÉGLAGES");
    await expect(french).toBeVisible();
    const languages = french.getByRole("radiogroup", { name: "Langue" });
    await expect(languages.getByRole("radio")).toHaveText(["Auto", "English", "Français"]);
    await expect(languages.getByRole("radio", { name: "Auto" })).toBeChecked();

    // English now: the sheet itself switches at once, focus stays on the choice.
    const english = languages.getByRole("radio", { name: "English" });
    await english.press("Enter");
    const sheet = settingsDialog(page, "SETTINGS");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("radio", { name: "English" })).toBeChecked();
    await expect(sheet.getByRole("radio", { name: "English" })).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await sheet.getByRole("button", { name: "DONE" }).press("Enter");
    await expect(page.locator(".start-btn")).toHaveText("START");

    // A French browser, but the stored choice wins after a reload.
    await reloadKeepingSettings();
    await expect(page.locator(".start-btn")).toHaveText("START");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Back to Auto with the arrow keys (radio group): French again, and kept.
    await page.locator(".settings-gear-btn").press("Enter");
    const group = settingsDialog(page, "SETTINGS").getByRole("radiogroup", { name: "Language" });
    await group.getByRole("radio", { name: "English" }).press("ArrowLeft");
    await expect(
      settingsDialog(page, "RÉGLAGES").getByRole("radio", { name: "Auto" }),
    ).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(page.locator(".start-btn")).toHaveText("JOUER");
    await reloadKeepingSettings();
    await expect(page.locator(".start-btn")).toHaveText("JOUER");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("a lost Classic run ends in French, and the share text too", async ({
    page,
    context,
    browserName,
  }) => {
    const clipboard = browserName === "chromium";
    if (clipboard) {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.addInitScript(() => {
        // Force the clipboard path even on platforms exposing Web Share.
        Object.defineProperty(navigator, "share", { value: undefined });
      });
    }
    await page.goto("/");
    await loseClassicRun(page);

    await expect(page.locator(".gameover-title")).toHaveText("FIN DE PARTIE");
    await expect(page.locator(".final-level")).toHaveText(/^MONDE 1\s*·\s*,?\s*NIVEAU 2$/);
    const insight = page.locator(".end-insight");
    await expect(insight.locator(".end-insight-margin")).toHaveText(
      new RegExp(`^En retard de \\d+,\\d${NNBSP}s$`),
    );
    await expect(insight.locator(".end-insight-title")).toHaveText("La forme a dépassé le bord.");
    await expect(insight.locator(".end-insight-tip")).toContainText("Touche un poil plus tôt.");
    await expect(page.locator(".leaderboard h3")).toHaveText("MEILLEURS SCORES - CLASSIQUE");
    await expect(page.locator(".retry-btn")).toHaveText("REJOUER");

    if (!clipboard) return; // Clipboard permissions are Chromium-only.
    const share = page.getByRole("button", { name: "PARTAGER" });
    await share.press("Enter");
    await expect(page.locator(".share-status")).toHaveText("Copié dans le presse-papiers");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const lines = copied.split("\n");
    expect(lines[0]).toBe("Shape Stack · Classique");
    expect(lines[1]).toMatch(/^\d+ pts · 3 formes · M1 N2 · combo x3$/);
    expect(lines[lines.length - 1]).toBe(GAME_URL);
  });

  test.describe("fits a 320 px phone", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(SMALL_PHONE);
    });

    test("HUD: French chips stay clear of PAUSE (Time Attack, widest content)", async ({
      page,
    }) => {
      await seedBest(page, "TIME_ATTACK", 99999);
      await seedBestWorld(page, ALL_WORLDS_REACHED);
      await page.goto("/");
      await pickMode(page, "Mode chrono");
      const bridge = await startFrozenRun(page);
      await stackMany(page, STACKS_TO_W10_L5);
      await bridge.setTimeRemaining(60);
      await bridge.step(0.001);

      await expect(page.getByTestId("pb-target")).toHaveText("RECORD 99999");
      await expect(page.locator(".world-badge")).toHaveText("M 10");
      await expect(page.locator(".level-badge")).toHaveText("N 5");
      await expect(page.getByRole("timer")).toHaveText(`60${NNBSP}s`);
      await expect(page.getByRole("timer")).toHaveAttribute("aria-label", "60 secondes restantes");
      await expect(page.locator(".pause-btn")).toHaveText("PAUSE");
      await expectHudClearOfPause(page, SMALL_PHONE);
      expect(await overflowingText(page, ".hud-meta > *, .hud-primary > *")).toEqual([]);
    });

    test("HUD: Zen lives stay clear of PAUSE", async ({ page }) => {
      await seedBestWorld(page, ALL_WORLDS_REACHED);
      await page.goto("/");
      await pickMode(page, "Mode zen");
      await startFrozenRun(page);
      await stackMany(page, STACKS_TO_W10_L5);
      await expect(page.locator(".lives-badge")).toHaveText(/^VIES \d+$/);
      await expectHudClearOfPause(page, SMALL_PHONE);
    });

    test("pause menu: every French label fits its button, armed FINISH included", async ({
      page,
    }) => {
      await page.goto("/");
      await pickMode(page, "Mode zen");
      const bridge = await startFrozenRun(page);
      await bridge.forceStack(0.98);
      await page.keyboard.press("Escape");
      const menu = page.getByRole("dialog", { name: "Jeu en pause" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("button")).toHaveText([
        "REPRENDRE",
        "RECOMMENCER",
        "FINIR LA PARTIE",
        "RÉGLAGES",
        "MENU PRINCIPAL",
      ]);

      const finish = page.locator(".pause-finish-btn");
      const unarmed = await boxOf(page, ".pause-finish-btn");
      await finish.press("Enter");
      await expect(finish).toHaveText("CONFIRMER LA FIN");
      // Arming never wraps the label onto a second line (the menu would jump).
      expect((await boxOf(page, ".pause-finish-btn")).height).toBeCloseTo(unarmed.height, 0);

      const buttons = await menu.getByRole("button").all();
      const boxes = await Promise.all(buttons.map((button) => button.boundingBox()));
      for (const [index, box] of boxes.entries()) {
        if (!box) throw new Error(`pause button ${index} has no layout box`);
        expect(insideViewport(box, SMALL_PHONE), `pause button ${index} is clipped`).toBe(true);
        for (const other of boxes.slice(index + 1)) {
          if (other) expect(intersects(box, other), "pause buttons overlap").toBe(false);
        }
      }
      expect(await overflowingText(page, ".pause-overlay button")).toEqual([]);
    });

    test("game over: headline, cards and action bar fit", async ({ page }) => {
      await page.goto("/");
      await loseClassicRun(page);
      await expect(page.locator(".gameover-title")).toHaveText("FIN DE PARTIE");
      // The action bar slides in: measure its resting place.
      await settleAnimations(page);

      for (const selector of [".gameover-title", ".retry-btn", ".share-btn", ".gameover-actions .menu-btn"]) {
        const box = await boxOf(page, selector);
        expect(insideViewport(box, SMALL_PHONE), `${selector} is clipped`).toBe(true);
      }
      const share = await boxOf(page, ".share-btn");
      const menu = await boxOf(page, ".gameover-actions .menu-btn");
      const retry = await boxOf(page, ".retry-btn");
      expect(intersects(share, menu), "share overlaps MENU PRINCIPAL").toBe(false);
      expect(intersects(retry, share) || intersects(retry, menu), "action bar overlap").toBe(false);
      expect(
        await overflowingText(
          page,
          ".gameover-title, .gameover-actions button, .run-stats dt, .quality-breakdown-legend li",
        ),
      ).toEqual([]);
    });

    test("the first-visit world intro (longest French how-to) stays clear of PAUSE", async ({
      page,
    }) => {
      await seedBestWorld(page, 2);
      await page.goto("/");
      const bridge = await startFrozenRun(page);
      await page.evaluate(() => window.__GAME_TEST__!.setWorldIntroMaxHold(10 * 60_000));
      // World 3: 2 worlds x 5 levels x 3 stacks.
      for (let i = 0; i < 30; i += 1) await bridge.forceStack(0.9);
      await expect(page.getByTestId("world-up-howto")).toContainText("secteurs rouges");
      const panel = await boxOf(page, '[data-testid="world-up"]');
      expect(insideViewport(panel, SMALL_PHONE), "teaching panel is clipped").toBe(true);
      expect(intersects(panel, await boxOf(page, ".pause-btn")), "panel under PAUSE").toBe(false);
    });
  });

  test.describe("axe audit in French (WCAG 2.1 A/AA)", () => {
    test("start screen", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".start-btn")).toHaveText("JOUER");
      await expectNoViolations(page);
    });

    test("game over, Classic miss", async ({ page }) => {
      await page.goto("/");
      await loseClassicRun(page);
      await expect(page.locator(".end-insight")).toBeVisible();
      await expectNoViolations(page);
    });
  });
});
