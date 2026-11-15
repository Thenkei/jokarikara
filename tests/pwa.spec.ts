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

test.describe("Link preview", () => {
  test("declares an Open Graph card with a 1200×630 image served by the build", async ({
    page,
  }) => {
    await page.goto("/");
    const meta = (selector: string) => page.locator(selector).getAttribute("content");
    const publicUrl = "https://thenkei.github.io/jokarikara/";

    expect(await meta('meta[property="og:title"]')).toBe("Shape Stack");
    expect(await meta('meta[property="og:description"]')).toBeTruthy();
    expect(await meta('meta[property="og:url"]')).toBe(publicUrl);
    expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(publicUrl);

    // Absolute (crawlers don't resolve relative URLs) and under the public
    // build; the same path must exist in this build.
    const image = await meta('meta[property="og:image"]');
    expect(image?.startsWith(publicUrl)).toBe(true);
    const local = new URL(image!.slice(publicUrl.length), page.url()).href;
    const response = await page.request.get(local);
    expect(response.headers()["content-type"]).toContain("image/jpeg");
    expect((await response.body()).length).toBeLessThan(300_000);
    expect(await naturalSize(page, local)).toEqual({ width: 1200, height: 630 });
    expect(await meta('meta[property="og:image:width"]')).toBe("1200");
    expect(await meta('meta[property="og:image:height"]')).toBe("630");
  });
});

test.describe("Install offer", { tag: "@cross-browser" }, () => {
  test("INSTALL appears when the browser offers it and opens its dialog once", async ({
    page,
  }) => {
    await page.goto("/");
    const install = page.getByRole("button", { name: "Install Shape Stack as an app, playable offline" });
    await expect(page.locator(".start-btn")).toBeVisible();
    // No offer from the browser (Safari, already installed...): no button.
    await expect(install).toHaveCount(0);

    // What Chromium fires when the page is installable.
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      const w = window as unknown as { __installPrompts: number };
      w.__installPrompts = 0;
      Object.assign(event, {
        prompt: async () => {
          w.__installPrompts += 1;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });
    await expect(install).toBeVisible();
    await expect(install).toHaveText("INSTALL");

    await install.press("Enter");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __installPrompts: number }).__installPrompts))
      .toBe(1);
    // An offer prompts once: the button goes away.
    await expect(install).toHaveCount(0);
  });
});

