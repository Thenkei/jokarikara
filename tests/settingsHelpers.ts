import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/** Visible titles of the settings sheet switches (their accessible names). */
export type SettingName = "Visual effects" | "Sound" | "Music" | "Haptics" | "Timing cue";

export const settingsDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Settings" });

export const settingSwitch = (page: Page, name: SettingName) =>
  settingsDialog(page).getByRole("switch", { name, exact: true });

/**
 * Open the sheet from whichever entry point is on screen: the corner gear on
 * the start screen or the SETTINGS button of the pause menu.
 */
export const openSettings = async (page: Page) => {
  await page.locator(".settings-gear-btn, .pause-settings-btn").click();
  await expect(settingsDialog(page)).toBeVisible();
};

export const closeSettings = async (page: Page) => {
  await settingsDialog(page).getByRole("button", { name: "DONE" }).click();
  await expect(settingsDialog(page)).toBeHidden();
};

/** Flip one switch and wait until its state actually changed. */
export const flipSetting = async (page: Page, name: SettingName) => {
  const toggle = settingSwitch(page, name);
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    before === "true" ? "false" : "true",
  );
};
