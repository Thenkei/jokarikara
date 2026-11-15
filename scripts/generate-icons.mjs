/**
 * Renders the PNG app icons from public/icon.svg with Playwright's Chromium
 * (already a dev dependency). Run after editing the SVG:
 *
 *   node scripts/generate-icons.mjs
 *
 * Outputs (public/):
 * - icon-192.png, icon-512.png: rounded "any" icons for the web manifest.
 * - icon-maskable-512.png: full-bleed background; the artwork already sits
 *   inside the maskable safe zone (radius 40 % of the size), so platforms can
 *   crop it to any shape.
 * - apple-touch-icon.png (180): full-bleed, as iOS applies its own mask and
 *   ignores SVG touch icons.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const source = await readFile(`${publicDir}icon.svg`, "utf8");
const fullBleed = source.replace(/rx="\d+"/, 'rx="0"');
if (fullBleed === source) throw new Error("icon.svg: expected a rounded background rect (rx)");

const targets = [
  { file: "icon-192.png", size: 192, svg: source },
  { file: "icon-512.png", size: 512, svg: source },
  { file: "icon-maskable-512.png", size: 512, svg: fullBleed },
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, svg } of targets) {
    await page.setViewportSize({ width: size, height: size });
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        `<img src="${dataUrl}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.waitForFunction(() => document.images[0]?.complete);
    const png = await page.screenshot({ omitBackground: true, type: "png" });
    await writeFile(`${publicDir}${file}`, png);
    console.log(`wrote public/${file} (${size}×${size}, ${png.length} bytes)`);
  }
} finally {
  await browser.close();
}
