import { test, expect } from "./fixtures";
import { makeBridge, waitForBridge } from "./bridgeHelpers";

const GAME_URL = "https://thenkei.github.io/jokarikara/";

test.describe("Share any run", () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Clipboard permissions are Chromium-only");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => {
      // Force the clipboard path even on platforms exposing Web Share.
      Object.defineProperty(navigator, "share", { value: undefined });
    });
  });

  test("copies a Classic result with score, bar and URL", async ({ page }) => {
    await page.goto("/");
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.forceStack(0.98); // PERFECT
    await bridge.forceStack(0.93); // GREAT

    // Let the shape outgrow its container: the run ends without a tap.
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    const score = (await page.locator(".score-display").textContent())?.match(/\d+/)?.[0];
    expect(score).toBeTruthy();

    // Keyboard reachable, with an accessible name.
    const share = page.getByRole("button", { name: "SHARE RESULT" });
    await share.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".share-status")).toHaveText("Copied to clipboard");

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const lines = copied.split("\n");
    expect(lines[0]).toBe("Shape Stack · Classic");
    expect(lines[1]).toMatch(new RegExp(`^${score} pts · 2 stacks · W1 L1`));
    expect(lines[2]).toBe("🟨🟩");
    expect(lines[3]).toBe(GAME_URL);
    expect(copied).not.toMatch(/undefined|NaN/);
  });

  test("copies a Time Attack result with no stacks", async ({ page }) => {
    await page.goto("/");
    await page.click('button:has-text("TIME")');
    await page.click(".start-btn");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    await bridge.setTimeRemaining(0.01);
    await bridge.step(0.02);

    await expect(page.locator(".gameover-screen")).toBeVisible();
    await page.click(".share-btn");
    await expect(page.locator(".share-status")).toHaveText("Copied to clipboard");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`Shape Stack · Time Attack\n0 pts · 0 stacks · W1 L1\n${GAME_URL}`);
  });
});

test.describe("Share image card", { tag: "@cross-browser" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: { text?: string; files: File[] }[] };
      w.__shared = [];
      Object.defineProperty(navigator, "canShare", {
        value: (data: { files?: File[] }) => Array.isArray(data.files),
      });
      Object.defineProperty(navigator, "share", {
        value: async (data: { text?: string; files?: File[] }) => {
          w.__shared.push({ text: data.text, files: data.files ?? [] });
        },
      });
    });
  });

  test("shares a PNG of the final board with the result text", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.locator(".start-btn").press("Enter");
    await waitForBridge(page);
    const bridge = makeBridge(page);
    await bridge.pause();
    for (const ratio of [0.98, 0.98, 0.93, 0.85, 0.98]) await bridge.forceStack(ratio);
    const state = await bridge.getState();
    await bridge.setActiveSize((state?.lastSize ?? 1) * 1.2);
    await bridge.step(0.016);
    await expect(page.locator(".gameover-screen")).toBeVisible();

    // The card renders in the background: a share before it is ready is
    // text only, so retry until one carries the file.
    const share = page.getByRole("button", { name: "SHARE RESULT" });
    await expect
      .poll(async () => {
        await share.press("Enter");
        return page.evaluate(
          () =>
            (window as unknown as { __shared: { files: File[] }[] }).__shared.at(-1)?.files
              .length ?? 0,
        );
      })
      .toBe(1);
    await expect(page.locator(".share-status")).toHaveText("Shared!");

    const shared = await page.evaluate(async () => {
      const last = (window as unknown as { __shared: { text: string; files: File[] }[] })
        .__shared.at(-1)!;
      const file = last.files[0];
      const bitmap = await createImageBitmap(file);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return {
        text: last.text,
        name: file.name,
        type: file.type,
        width: bitmap.width,
        height: bitmap.height,
        base64: btoa(binary),
      };
    });
    expect(shared.name).toBe("shape-stack.png");
    expect(shared.type).toBe("image/png");
    expect({ width: shared.width, height: shared.height }).toEqual({ width: 1080, height: 1350 });
    expect(shared.text.split("\n")[0]).toBe("Shape Stack · Classic");
    await testInfo.attach("share-card", {
      body: Buffer.from(shared.base64, "base64"),
      contentType: "image/png",
    });
    if (process.env.SHARE_CARD_OUT) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        `${process.env.SHARE_CARD_OUT}/card-${testInfo.project.name.replace(/\W+/g, "-")}.png`,
        Buffer.from(shared.base64, "base64"),
      );
    }
  });
});
