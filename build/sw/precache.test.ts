// @vitest-environment node
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  buildPrecacheManifest,
  isPrecacheable,
  normalizeBase,
  toPrecacheUrl,
  type PrecacheSource,
} from "./precache.ts";
import { renderServiceWorker } from "./plugin.ts";

const BASE = "/jokarikara/";

const SITE: PrecacheSource[] = [
  { path: "manifest.webmanifest", content: '{"name":"Shape Stack"}' },
  { path: "icon-192.png", content: new Uint8Array([137, 80, 78, 71, 1]) },
  { path: "index.html", content: "<html>v1</html>" },
  { path: "assets/index-C_yCu-4m.css", content: "body{}" },
  { path: "assets/index-wV3ceFNW.js", content: "console.log(1)" },
];

describe("precache URLs", () => {
  it("prefixes every output path with the base", () => {
    expect(buildPrecacheManifest(BASE, SITE).urls).toEqual([
      "/jokarikara/assets/index-C_yCu-4m.css",
      "/jokarikara/assets/index-wV3ceFNW.js",
      "/jokarikara/icon-192.png",
      "/jokarikara/index.html",
      "/jokarikara/manifest.webmanifest",
    ]);
  });

  it("normalizes bases and paths", () => {
    expect(normalizeBase("/jokarikara")).toBe("/jokarikara/");
    expect(normalizeBase("/")).toBe("/");
    expect(toPrecacheUrl("/", "./index.html")).toBe("/index.html");
    expect(toPrecacheUrl(BASE, "/icons\\a.png")).toBe("/jokarikara/icons/a.png");
  });

  it("rejects relative bases, which the worker cannot resolve", () => {
    expect(() => normalizeBase("./")).toThrow(/absolute base/);
  });

  it("leaves out the worker itself, source maps and dotfiles", () => {
    expect(isPrecacheable("sw.js")).toBe(false);
    expect(isPrecacheable("assets/index-abc.js.map")).toBe(false);
    expect(isPrecacheable(".DS_Store")).toBe(false);
    expect(isPrecacheable(".vite/manifest.json")).toBe(false);
    expect(isPrecacheable("assets/sw.js")).toBe(true);
    // Link preview image: crawlers fetch it, the game never does.
    expect(isPrecacheable("og-image.jpg")).toBe(false);
    expect(isPrecacheable("icon-512.png")).toBe(true);
    const { urls } = buildPrecacheManifest(BASE, [
      ...SITE,
      { path: "sw.js", content: "" },
      { path: "assets/index-wV3ceFNW.js.map", content: "{}" },
    ]);
    expect(urls).toHaveLength(SITE.length);
  });

  it("lists a path served twice once (bundle output overrides public)", () => {
    const a = buildPrecacheManifest(BASE, [...SITE, { path: "index.html", content: "x" }]);
    const b = buildPrecacheManifest(BASE, [
      ...SITE.filter((s) => s.path !== "index.html"),
      { path: "index.html", content: "x" },
    ]);
    expect(a.urls).toHaveLength(SITE.length);
    expect(a.version).toBe(b.version);
  });

  it("refuses an empty precache", () => {
    expect(() => buildPrecacheManifest(BASE, [{ path: "sw.js", content: "" }])).toThrow(/empty/);
  });
});

describe("cache version", () => {
  const version = (sources: PrecacheSource[], salt?: string) =>
    buildPrecacheManifest(BASE, sources, salt).version;

  it("is a short hex digest, stable across rebuilds and input order", () => {
    expect(version(SITE)).toMatch(/^[0-9a-f]{12}$/);
    expect(version([...SITE].reverse())).toBe(version(SITE));
  });

  it("changes when any precached content changes, text or binary", () => {
    const edited = SITE.map((s) =>
      s.path === "index.html" ? { ...s, content: "<html>v2</html>" } : s,
    );
    const icon = SITE.map((s) =>
      s.path === "icon-192.png" ? { ...s, content: new Uint8Array([137, 80, 78, 71, 2]) } : s,
    );
    expect(version(edited)).not.toBe(version(SITE));
    expect(version(icon)).not.toBe(version(SITE));
  });

  it("changes when the file list or the base changes", () => {
    expect(version(SITE.slice(1))).not.toBe(version(SITE));
    expect(buildPrecacheManifest("/other/", SITE).version).not.toBe(version(SITE));
  });

  it("changes with the salt (the worker template)", () => {
    expect(version(SITE, "template v2")).not.toBe(version(SITE, "template v1"));
  });

  it("can't be forged by moving bytes between path and content", () => {
    expect(version([{ path: "ab", content: "c" }])).not.toBe(
      version([{ path: "a", content: "bc" }]),
    );
  });
});

describe("renderServiceWorker", () => {
  const template = readFileSync(new URL("./sw.template.js", import.meta.url), "utf8");
  const config = { cacheName: "shape-stack-abc", base: BASE, precache: ["/jokarikara/index.html"] };

  it("injects the config into the real template", () => {
    const sw = renderServiceWorker(template, config);
    expect(sw).not.toContain("__SW_CONFIG__");
    expect(sw).toContain('"cacheName": "shape-stack-abc"');
    // Still compiles (never runs) once the token is replaced.
    expect(() => new Script(sw)).not.toThrow();
  });

  it("fails loudly when the token is missing or repeated", () => {
    expect(() => renderServiceWorker("const x = 1;", config)).toThrow(/exactly once/);
    expect(() =>
      renderServiceWorker("self.__SW_CONFIG__; self.__SW_CONFIG__;", config),
    ).toThrow(/exactly once/);
  });
});
