import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";
import { closeSettings, openSettings } from "./settingsHelpers";

/**
 * Start screen secrets: title taps (backdrop flourish) and the arrow sequence
 * (Mono look). Both unlock the hidden "Curious Mind" achievement.
 */

const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
];

const typeSequence = async (page: Page) => {
  for (const key of SEQUENCE) await page.keyboard.press(key);
};

const title = (page: Page) => page.getByRole("heading", { level: 1, name: "SHAPE STACK" });

/**
 * Tap the title `count` times as raw pointer input at its centre. Locator
 * clicks wait for actionability on every call, which takes 0.5-1.2 s each on
 * software-rendered WebKit in CI: seven of them overrun the 3 s tap window.
 */
const tapTitle = async (page: Page, count: number) => {
  const box = await title(page).boundingBox();
  if (!box) throw new Error("Title not rendered");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  for (let i = 0; i < count; i += 1) await page.mouse.click(x, y);
};

test.describe("Start screen secrets", () => {
  test("7 quick title taps play the backdrop flourish and unlock the hidden achievement", async ({
    page,
  }) => {
    await page.goto("/");
    const backdrop = page.locator(".start-backdrop");
    const heading = title(page);

    // Still a plain heading: not focusable, no button semantics.
    await expect(heading).toBeVisible();
    await expect(heading).not.toHaveAttribute("tabindex");
    await expect(heading).not.toHaveAttribute("role");

    // Locked secret: listed, counted, but tells nothing.
    await expect(page.locator(".achievements-btn")).toHaveText("ACHIEVEMENTS 0/13");
    await page.click(".achievements-btn");
    const secret = page.locator('[data-achievement-id="curious-mind"]');
    await expect(secret).toHaveClass(/locked/);
    await expect(secret.locator(".achievement-title")).toHaveText("???");
    await expect(page.locator(".achievements-screen")).not.toContainText("Curious Mind");
    await page.click(".achievements-back-btn");

    // Six taps are not enough.
    await tapTitle(page, 6);
    await expect(backdrop).not.toHaveClass(/flourish/);

    await tapTitle(page, 1);
    await expect(backdrop).toHaveClass(/flourish/);
    await expect(page.locator(".achievement-toast")).toHaveText(
      "ACHIEVEMENT · Curious Mind",
    );
    await expect(page.locator(".achievements-btn")).toHaveText("ACHIEVEMENTS 1/13");

    // The flourish settles back to the idle backdrop on its own.
    await expect(backdrop).not.toHaveClass(/flourish/, { timeout: 4000 });

    await page.click(".achievements-btn");
    await expect(secret).toHaveClass(/unlocked/);
    await expect(secret.locator(".achievement-title")).toHaveText("Curious Mind");
  });

  test("the arrow sequence toggles the Mono look; game keys still work", async ({ page }) => {
    await page.goto("/");
    const root = page.locator(".game-container");
    await expect(page.locator(".start-btn")).toBeVisible();
    await expect(root).not.toHaveAttribute("data-theme");

    // Ignored while the settings sheet owns the keyboard.
    await openSettings(page);
    await typeSequence(page);
    await closeSettings(page);
    await expect(root).not.toHaveAttribute("data-theme");

    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await typeSequence(page);
    await expect(root).toHaveAttribute("data-theme", "mono");
    await expect(page.locator(".achievement-toast")).toHaveText(
      "ACHIEVEMENT · Curious Mind",
    );
    // The arrows went through the mode radio group too, but net out.
    await expect(page.getByRole("radio", { name: "Classic mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Entering it again turns it off; a third time back on.
    await typeSequence(page);
    await expect(root).not.toHaveAttribute("data-theme");
    await typeSequence(page);
    await expect(root).toHaveAttribute("data-theme", "mono");

    // Game keys are untouched: Enter starts, Space taps, P pauses, Escape resumes.
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    expect((await bridge.getState())?.themeId).toMatch(/:mono$/);

    await page.keyboard.press("Space");
    await expect.poll(async () => (await bridge.getState())?.stackCount).toBe(1);

    // The sequence is a start screen secret only: mid-run it does nothing.
    await typeSequence(page);
    await expect(root).toHaveAttribute("data-theme", "mono");

    await page.keyboard.press("p");
    await expect(page.locator(".pause-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".pause-overlay")).toBeHidden();
    expect((await bridge.getState())?.paused).toBe(false);
  });
});
