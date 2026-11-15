import { createHash } from "node:crypto";

/**
 * Pure precache-manifest builder for the service worker (no Vite, no fs).
 *
 * Given every file the deployed site will serve (bundle output + public dir)
 * it returns the URLs to precache under `base` and a content-derived version.
 * The version names the Cache Storage bucket (`shape-stack-<version>`): it
 * changes whenever any precached byte changes, so a deploy never reuses a
 * stale bucket, and an unchanged rebuild keeps the same one.
 */

/** One file the deployed site serves, by its path relative to the base. */
export interface PrecacheSource {
  /** e.g. `index.html`, `assets/index-C_yCu-4m.js`, `icon-192.png` */
  readonly path: string;
  readonly content: string | Uint8Array;
}

export interface PrecacheManifest {
  /** Absolute URL paths under `base`, sorted and unique. */
  readonly urls: readonly string[];
  /** Short hex digest of every precached URL and its content. */
  readonly version: string;
}

/** Files that exist in the output but must not be precached. */
const EXCLUDED = [
  /^sw\.js$/, // the worker itself: browsers fetch it outside the SW cache
  /\.map$/, // source maps: devtools only
  /(^|\/)\./, // dotfiles (.DS_Store, .vite/ build metadata)
];

const VERSION_LENGTH = 12;

/** `"/jokarikara"` or `"/jokarikara/"` → `"/jokarikara/"`; `""` → `"/"`. */
export const normalizeBase = (base: string): string => {
  if (!base.startsWith("/")) {
    // Relative bases (`./`) make URLs depend on the page location, which the
    // worker cannot know at install time.
    throw new Error(`Service worker precache needs an absolute base, got "${base}"`);
  }
  return base.endsWith("/") ? base : `${base}/`;
};

/** Output path → URL path under the base (`assets/a.js` → `/jokarikara/assets/a.js`). */
export const toPrecacheUrl = (base: string, path: string): string =>
  normalizeBase(base) + path.replace(/\\/g, "/").replace(/^(\.\/|\/)+/, "");

export const isPrecacheable = (path: string): boolean =>
  !EXCLUDED.some((pattern) => pattern.test(path.replace(/\\/g, "/")));

export const buildPrecacheManifest = (
  base: string,
  sources: readonly PrecacheSource[],
  /** Extra bytes folded into the version (e.g. the worker template). */
  salt = "",
): PrecacheManifest => {
  const byUrl = new Map<string, PrecacheSource["content"]>();
  for (const source of sources) {
    if (!isPrecacheable(source.path)) continue;
    // Later sources win: callers pass public files first, bundle output last,
    // mirroring Vite (a bundle file overwrites a same-named public file).
    byUrl.set(toPrecacheUrl(base, source.path), source.content);
  }
  if (byUrl.size === 0) throw new Error("Service worker precache list is empty");

  const urls = [...byUrl.keys()].sort();
  const hash = createHash("sha256").update(salt);
  for (const url of urls) {
    // NUL separators: no (url, content) pair can masquerade as another.
    hash.update(url).update("\0").update(byUrl.get(url)!).update("\0");
  }
  return { urls, version: hash.digest("hex").slice(0, VERSION_LENGTH) };
};
