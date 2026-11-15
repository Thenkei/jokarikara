/**
 * Renders the link preview image (Open Graph / Twitter card) with Playwright's
 * Chromium, from the app icon artwork. Run after editing public/icon.svg or
 * the wording below:
 *
 *   node scripts/generate-og-image.mjs
 *
 * Output: public/og-image.jpg (1200×630, the size every major chat and feed
 * crops least; JPEG keeps it far under WhatsApp's ~300 kB preview limit).
 * It is referenced by absolute URL from index.html and kept out of the
 * service worker precache (crawlers fetch it, players don't).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const WIDTH = 1200;
const HEIGHT = 630;
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const icon = await readFile(`${publicDir}icon.svg`, "utf8");
// The artwork without its rounded background tile: shapes float on the card.
const artwork = icon.replace(/<rect width="512" height="512"[^>]*\/>/, "");
if (artwork === icon) throw new Error("icon.svg: expected the background tile rect");
const artworkUrl = `data:image/svg+xml;base64,${Buffer.from(artwork).toString("base64")}`;

const html = `<!doctype html>
<html><head><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    display: flex; align-items: center; gap: 72px; padding: 0 96px; box-sizing: border-box;
    background: radial-gradient(circle at 26% 50%, #1b2340 0%, #0c0c0e 58%);
    font-family: Outfit, Inter, "Helvetica Neue", Arial, sans-serif; color: #f5f7fb;
  }
  img { width: 380px; height: 380px; flex: none; filter: drop-shadow(0 0 48px rgba(59, 130, 246, 0.35)); }
  h1 { margin: 0; font-size: 104px; font-weight: 900; letter-spacing: -2px; line-height: 0.95; }
  p { margin: 28px 0 0; font-size: 38px; font-weight: 600; color: #b9c0cf; line-height: 1.3; }
  .tag { margin-top: 36px; font-size: 26px; font-weight: 700; letter-spacing: 3px; color: #f7c52b; }
</style></head>
<body>
  <img src="${artworkUrl}" alt="">
  <div>
    <h1>SHAPE<br>STACK</h1>
    <p>Tap to stack.<br>Don't overlap.</p>
    <div class="tag">A MINIMALIST RHYTHM GAME</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(html);
  await page.waitForFunction(() => document.images[0]?.complete);
  const jpg = await page.screenshot({ type: "jpeg", quality: 90 });
  await writeFile(`${publicDir}og-image.jpg`, jpg);
  console.log(`wrote public/og-image.jpg (${WIDTH}×${HEIGHT}, ${jpg.length} bytes)`);
} finally {
  await browser.close();
}
