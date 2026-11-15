import { test, expect } from "./fixtures";

/**
 * Install surfaces: the web manifest's icons and the iOS touch icon must be
 * real, loadable images of the declared size. iOS ignores SVG touch icons and
 * install prompts want 192/512 PNGs (see scripts/generate-icons.mjs).
 */
const naturalSize = (page: import("@playwright/test").Page, url: string) =>
  page.evaluate(
    (src) =>
      new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => reject(new Error(`failed to load ${src}`));
        img.src = src;
      }),
    url,
  );

test.describe("PWA install surfaces", () => {
  test("manifest declares loadable PNG icons, including a maskable one", async ({ page }) => {
    await page.goto("/");
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBeTruthy();
    const manifestUrl = new URL(manifestHref!, page.url()).href;
    const manifest = await (await page.request.get(manifestUrl)).json();

    const icons: { src: string; sizes: string; type: string; purpose?: string }[] =
      manifest.icons;
    const png = (size: number, purpose: string) =>
      icons.find(
        (icon) =>
          icon.type === "image/png" &&
          icon.sizes === `${size}x${size}` &&
          (icon.purpose ?? "any").split(" ").includes(purpose),
      );
    for (const [size, purpose] of [
      [192, "any"],
      [512, "any"],
      [512, "maskable"],
    ] as const) {
      const icon = png(size, purpose);
      expect(icon, `${size}px ${purpose} PNG icon`).toBeTruthy();
      const url = new URL(icon!.src, manifestUrl).href;
      expect(await naturalSize(page, url)).toEqual({ width: size, height: size });
    }
  });

  test("iOS touch icon is a 180px PNG", async ({ page }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(href).toMatch(/\.png$/);
    const url = new URL(href!, page.url()).href;
    const response = await page.request.get(url);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect(await naturalSize(page, url)).toEqual({ width: 180, height: 180 });
  });
});
