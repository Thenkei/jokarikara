import { test, expect } from "@playwright/test";

test.describe("Responsive Layout", () => {
  test("should display start screen on desktop", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".title")).toHaveText("SHAPE STACK");
    await expect(page.locator(".start-btn")).toBeVisible();
  });

  test("should display start screen on mobile", async ({ page, isMobile }) => {
    test.skip(!isMobile, "This test is for mobile only");
    await page.goto("/");
    await expect(page.locator(".title")).toHaveText("SHAPE STACK");
    await expect(page.locator(".start-btn")).toBeVisible();

    // Check if subtitle is also visible and readable
    const subtitle = page.locator(".subtitle");
    await expect(subtitle).toBeVisible();
  });

  test("should maintain layout after starting game", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");

    // Check HUD elements
    await expect(page.locator(".hud")).toBeVisible();
    await expect(page.locator(".score")).toBeVisible();

    // Check if canvas is rendered
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
  });
});
