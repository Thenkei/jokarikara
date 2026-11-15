import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";
import { openSettings, settingSwitch, settingsDialog } from "./settingsHelpers";

const KEPT = "e2e-kept-settings";

test.describe("Settings sheet", () => {
  test("keyboard: opens from the gear, traps focus, closes on Escape; persists after reload", async ({
    page,
  }) => {
    // The fixture clears localStorage on every navigation (reloads included):
    // carry the saved settings across the reload under test via sessionStorage.
    await page.addInitScript((key) => {
      const kept = sessionStorage.getItem(key);
      if (kept) localStorage.setItem("shape-stack-settings", kept);
    }, KEPT);
    await page.goto("/");

    const gear = page.getByRole("button", { name: "Settings" });
    const dialog = settingsDialog(page);
    const fx = settingSwitch(page, "Visual effects");
    const music = settingSwitch(page, "Music");
    const done = dialog.getByRole("button", { name: "DONE" });

    await gear.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(fx).toBeFocused();
    await expect(page.locator(".start-screen")).toHaveAttribute("inert", "");

    // Tab wraps inside the sheet in both directions.
    await page.keyboard.press("Shift+Tab");
    await expect(done).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(fx).toBeFocused();

    // Real switches: Space and Enter flip the focused one.
    await page.keyboard.press("Space");
    await expect(fx).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Tab"); // Sound
    await page.keyboard.press("Tab"); // Music
    await expect(music).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(music).toHaveAttribute("aria-checked", "false");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(gear).toBeFocused();
    await expect(page.locator(".start-screen")).not.toHaveAttribute("inert", "");

    await page.evaluate(
      (key) =>
        sessionStorage.setItem(key, localStorage.getItem("shape-stack-settings") ?? ""),
      KEPT,
    );
    await page.reload();
    await openSettings(page);
    await expect(fx).toHaveAttribute("aria-checked", "false");
    await expect(music).toHaveAttribute("aria-checked", "false");
    await expect(settingSwitch(page, "Sound")).toHaveAttribute("aria-checked", "true");
  });

  test("over the pause menu: keys stay in the sheet and Escape closes only the sheet", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    const pauseOverlay = page.locator(".pause-overlay");
    const dialog = settingsDialog(page);

    await page.keyboard.press("Escape");
    await expect(pauseOverlay).toBeVisible();

    const settingsButton = pauseOverlay.getByRole("button", { name: "SETTINGS" });
    await settingsButton.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(settingSwitch(page, "Visual effects")).toBeFocused();

    // The pause shortcut must not resume the run from behind the sheet.
    await page.keyboard.press("p");
    await expect(dialog).toBeVisible();
    expect((await bridge.getState())?.paused).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(pauseOverlay).toBeVisible();
    expect((await bridge.getState())?.paused).toBe(true);
    await expect(settingsButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(pauseOverlay).toBeHidden();
    await bridge.finishResumeCountdown();
    expect((await bridge.getState())?.paused).toBe(false);
  });

  test("M toggles sound anywhere, shows it briefly and keeps the setting", async ({ page }) => {
    await page.goto("/");
    const toast = page.locator(".sound-toast");
    const live = page.locator(".sr-only[aria-live='polite']");
    const storedMuted = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("shape-stack-settings") ?? "{}").muted);

    await expect(page.locator(".start-btn")).toBeVisible();
    await page.keyboard.press("m");
    await expect(toast).toHaveText("SOUND OFF");
    await expect(live).toHaveText("Sound off");
    expect(await storedMuted()).toBe(true);
    await expect(toast).toHaveCount(0, { timeout: 5_000 });

    // The settings switch follows, and advertises the shortcut.
    await openSettings(page);
    const sound = settingSwitch(page, "Sound");
    await expect(sound).toHaveAttribute("aria-checked", "false");
    await expect(sound).toHaveAttribute("aria-keyshortcuts", "M");
    // While the sheet is open it owns the keyboard: M does nothing.
    await page.keyboard.press("M");
    await expect(sound).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Escape");

    // Mid-run: M neither taps nor pauses.
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await page.keyboard.press("m");
    await expect(toast).toHaveText("SOUND ON");
    expect(await storedMuted()).toBe(false);
    expect((await bridge.getState())?.stackCount).toBe(0);
    await expect(page.locator(".pause-overlay")).toHaveCount(0);
  });
});

