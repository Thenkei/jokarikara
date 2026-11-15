import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { buildPrecacheManifest, normalizeBase, type PrecacheSource } from "./precache.ts";

/**
 * Emits `<base>sw.js` (see sw.template.js) at build time only; the dev server
 * never gets a worker. The precache list is every file the build serves:
 * index.html, the hashed JS/CSS, and the public dir (manifest, icons).
 */

const TEMPLATE_PATH = "build/sw/sw.template.js";
const CONFIG_TOKEN = "self.__SW_CONFIG__";
export const SW_FILE_NAME = "sw.js";
export const CACHE_PREFIX = "shape-stack-";

/** Recursively lists a directory as `{ path relative to it, content }`. */
const readTree = (dir: string): PrecacheSource[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolute = join(entry.parentPath, entry.name);
      return { path: relative(dir, absolute), content: readFileSync(absolute) };
    });

/** Injects the build-time config; throws if the template lost its token. */
export const renderServiceWorker = (
  template: string,
  config: { cacheName: string; base: string; precache: readonly string[] },
): string => {
  const parts = template.split(CONFIG_TOKEN);
  if (parts.length !== 2) {
    throw new Error(`${TEMPLATE_PATH} must contain "${CONFIG_TOKEN}" exactly once`);
  }
  return parts.join(JSON.stringify(config, null, 2));
};

export const serviceWorkerPlugin = (): Plugin => {
  let config: ResolvedConfig;

  return {
    name: "shape-stack:service-worker",
    apply: "build",
    // After vite:build-html, so index.html is already in the bundle.
    enforce: "post",
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      if (config.build.ssr) return;

      const templateFile = resolve(config.root, TEMPLATE_PATH);
      const template = readFileSync(templateFile, "utf8");
      this.addWatchFile(templateFile);

      const publicFiles =
        config.publicDir && config.build.copyPublicDir ? readTree(config.publicDir) : [];
      const bundleFiles = Object.values(bundle).map((output) => ({
        path: output.fileName,
        content: output.type === "chunk" ? output.code : output.source,
      }));

      const base = normalizeBase(config.base);
      // Template bytes are part of the version: a strategy change gets a
      // fresh bucket even when the app itself did not change.
      const { urls, version } = buildPrecacheManifest(
        base,
        [...publicFiles, ...bundleFiles],
        template,
      );
      if (!urls.includes(`${base}index.html`)) {
        throw new Error("Service worker precache is missing index.html");
      }

      this.emitFile({
        type: "asset",
        fileName: SW_FILE_NAME,
        source: renderServiceWorker(template, {
          cacheName: `${CACHE_PREFIX}${version}`,
          base,
          precache: urls,
        }),
      });
      config.logger.info(
        `[service-worker] ${SW_FILE_NAME}: ${urls.length} files precached as ${CACHE_PREFIX}${version}`,
      );
    },
  };
};
