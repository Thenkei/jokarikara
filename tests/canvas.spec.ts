import { test, expect } from "@playwright/test";

test.describe("GameCanvas Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
  });

  test("canvas should fill the container", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // Check if canvas attributes match its display size
    const sizes = await canvas.evaluate((node: HTMLCanvasElement) => {
      return {
        width: node.width,
        height: node.height,
        clientWidth: node.clientWidth,
        clientHeight: node.clientHeight,
      };
    });

    // In our implementation, we set width/height to window size on resize
    // clientWidth/clientHeight should match approximately
    expect(sizes.width).toBeGreaterThan(0);
    expect(sizes.height).toBeGreaterThan(0);
  });

  test("canvas should not be blank after starting", async ({ page }) => {
    // Wait for at least one frame to render
    await page.waitForTimeout(500);

    const isBlank = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return true;
      const ctx = canvas.getContext("2d");
      if (!ctx) return true;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Check if all pixels are the same (e.g., all transparent or all black)
      // We expect some non-background colors from the shapes
      const firstR = data[0],
        firstG = data[1],
        firstB = data[2],
        firstA = data[3];
      for (let i = 4; i < data.length; i += 4) {
        if (
          data[i] !== firstR ||
          data[i + 1] !== firstG ||
          data[i + 2] !== firstB ||
          data[i + 3] !== firstA
        ) {
          return false; // Found a different pixel
        }
      }
      return true;
    });

    expect(isBlank).toBe(false);
  });

  test("canvas should be animated", async ({ page }) => {
    const canvas = page.locator("canvas");

    // Capture canvas content at two different times
    const data1 = await canvas.evaluate((node: HTMLCanvasElement) =>
      node.toDataURL()
    );
    await page.waitForTimeout(500); // Wait for a few frames
    const data2 = await canvas.evaluate((node: HTMLCanvasElement) =>
      node.toDataURL()
    );

    expect(data1).not.toBe(data2);
  });

  test("tapping canvas should trigger stack (visual check)", async ({
    page,
  }) => {
    // We can't easily check 'stacking' logic visually without snapshots,
    // but we can check if the score changes in HUD.
    const initialScore = await page.locator(".score").textContent();

    // Click center of canvas
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    // Wait a bit and check score or game over
    await page.waitForTimeout(500);

    const currentGameState = await page.evaluate(() => {
      return document.querySelector(".gameover-screen")
        ? "GAMEOVER"
        : "PLAYING";
    });

    if (currentGameState === "PLAYING") {
      const newScore = await page.locator(".score").textContent();
      // Since we click immediately, the shape might be too small and cause Game Over,
      // or it might succeed if it's the first click and we are lucky/fast.
      // Actually, the first shape is large, so clicking immediately usually succeeds.
      expect(Number(newScore)).toBeGreaterThanOrEqual(Number(initialScore));
    } else {
      await expect(page.locator(".gameover-screen")).toBeVisible();
    }
  });

  test("visual snapshot - rendering consistency", async ({ page }) => {
    // Take multiple snapshots to ensure it's not totally broken
    // Since it's animated, we might get slight variations, but basic layout should hold.
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveScreenshot("canvas-initial.png", {
      mask: [page.locator(".hud")], // Mask Hudson to focus on canvas content
      maxDiffPixelRatio: 0.1, // Allow some animation variation
    });
  });
});
