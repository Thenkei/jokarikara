import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import type { Catalog, MessageKey } from "./catalog";
import { CATALOGS, createTranslator, getTranslator, interpolate } from "./translator";
import { detectLocale, resolveLocale } from "./locale";
import { LANGUAGE_SETTINGS, LOCALES, isLanguageSetting, type Message } from "./types";
import { formatScoreDate } from "../modes/scoreDate";

const EN = getTranslator("en");
const FR = getTranslator("fr");
/** French narrow no-break space (digit grouping, before ! ? and units). */
const NNBSP = "\u202f";

const KEYS = Object.keys(en) as MessageKey[];

const placeholders = (message: Message): string[] => {
  const forms = typeof message === "string" ? [message] : [message.one, message.other];
  const names = forms.flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
  return [...new Set(names)].sort();
};

/**
 * Keys whose French text is meant to equal the English: game terms kept as
 * stylised labels, the brand, units, and lines made only of them.
 */
const SAME_IN_FRENCH: ReadonlySet<MessageKey> = new Set<MessageKey>([
  "app.title",
  "quality.PERFECT",
  "quality.GREAT",
  "quality.GOOD",
  "quality.OK",
  "mode.ZEN.label",
  "mode.ZEN.name",
  "medal.name.BRONZE",
  "hud.pause",
  "hud.style",
  "hud.combo",
  "hud.medalGoal",
  "banner.combo",
  "announce.combo",
  "announce.score",
  "start.bestMedal",
  "gameOver.perfect",
  "unit.percent",
  "achievements.hidden.title",
  "atlas.lockedName",
  "settings.language.auto",
  "countdown.spoken.minutes",
  "shareText.title",
  "shareText.titleMedal",
  "shareText.score",
  "shareText.combo",
]);

describe("catalogs", () => {
  it("French has exactly the English keys, each with the same shape", () => {
    expect(Object.keys(fr).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      expect(typeof fr[key], key).toBe(typeof en[key]);
    }
  });

  it("no message is empty, in any language", () => {
    for (const locale of LOCALES) {
      for (const key of KEYS) {
        const message: Message = CATALOGS[locale][key];
        const forms = typeof message === "string" ? [message] : [message.one, message.other];
        for (const form of forms) expect(form.trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("French uses the same placeholders as English (none lost, none invented)", () => {
    for (const key of KEYS) {
      expect(placeholders(fr[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("French is not English by accident", () => {
    const identical = KEYS.filter(
      (key) => JSON.stringify(fr[key]) === JSON.stringify(en[key]) && !SAME_IN_FRENCH.has(key),
    );
    expect(identical).toEqual([]);
  });

  it("keeps the allow-list of identical keys honest", () => {
    for (const key of SAME_IN_FRENCH) {
      expect(JSON.stringify(fr[key]), key).toBe(JSON.stringify(en[key]));
      // Only short labels may be shared, never a sentence: at most three
      // words outside the placeholders.
      const text = typeof en[key] === "string" ? en[key] : en[key].other;
      const words = text.replace(/\{\w+\}/g, "").match(/\p{L}+/gu) ?? [];
      expect(words.length, key).toBeLessThanOrEqual(3);
    }
  });

  it("French typography: no plain space before : ! ? ;", () => {
    for (const key of KEYS) {
      const message: Message = fr[key];
      const forms = typeof message === "string" ? [message] : [message.one, message.other];
      for (const form of forms) {
        expect(form, key).not.toMatch(/ [:!?;]/);
        // "!" "?" ";" glued to a word ("???" is a placeholder, not prose).
        expect(form, key).not.toMatch(/[^\s\u00a0\u202f{?][!?;](\s|$)/u);
      }
    }
  });

  it("fails to compile when a catalog misses a key or a param", () => {
    // @ts-expect-error a catalog must define every key of the source
    const partial: Catalog = { "app.title": "SHAPE STACK" };
    // @ts-expect-error a plural cannot become a plain string
    const misshaped: Catalog = { ...fr, "daily.tries": "{count} essais" };
    // @ts-expect-error unknown keys are rejected
    EN.t("start.nope");
    // @ts-expect-error a key with placeholders needs its params
    EN.t("start.best");
    // @ts-expect-error params must be the key's own placeholders
    EN.t("start.best", { points: 3 });
    // @ts-expect-error a plural needs a count
    EN.t("daily.tries", {});
    expect([partial, misshaped].length).toBe(2);
  });
});

describe("translator", () => {
  it("interpolates placeholders and leaves unknown ones visible", () => {
    expect(EN.t("start.best", { score: 1240 })).toBe("BEST 1240");
    expect(FR.t("start.best", { score: 1240 })).toBe("RECORD 1240");
    expect(interpolate("A {a} {b}", { a: 1 })).toBe("A 1 {b}");
    expect(interpolate("A {a}", undefined)).toBe("A {a}");
  });

  it("writes params as plain digits (game readouts never get grouped)", () => {
    expect(FR.t("hud.best", { score: 99999 })).toBe("RECORD 99999");
  });

  it("picks the plural form per language", () => {
    expect(EN.t("insight.stacks", { count: 1 })).toBe("1 stack");
    expect(EN.t("insight.stacks", { count: 0 })).toBe("0 stacks");
    expect(EN.t("insight.stacks", { count: 2 })).toBe("2 stacks");
    expect(FR.t("daily.triesSpoken", { count: 1 })).toBe("1 essai");
    // French counts 0 as singular.
    expect(FR.t("daily.triesSpoken", { count: 0 })).toBe("0 essai");
    expect(FR.t("daily.triesSpoken", { count: 2 })).toBe("2 essais");
    // CLDR "many" (French millions) falls back to `other`.
    expect(FR.t("daily.triesSpoken", { count: 1_000_000 })).toBe("1000000 essais");
  });

  it("formats numbers for the language", () => {
    expect(EN.number(1234)).toBe("1,234");
    expect(FR.number(1234)).toBe(`1${NNBSP}234`);
    const tenths = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
    expect(EN.number(0.4, tenths)).toBe("0.4");
    expect(FR.number(0.4, tenths)).toBe("0,4");
    expect(EN.number(0.5, { style: "percent" })).toBe("50%");
    // Intl puts a no-break space (not the narrow one) before %, as the catalog does.
    expect(FR.number(0.5, { style: "percent" })).toBe("50\u00a0%");
    expect(FR.t("unit.percent", { value: 4 })).toBe("4\u00a0%");
  });

  it("formats dates with each language's named formats", () => {
    const day = new Date(2026, 10, 15);
    expect(EN.date(day, "dailyDay")).toBe("Nov 15");
    expect(FR.date(day, "dailyDay")).toBe("15 novembre");
    expect(EN.date(day, "scoreDate")).toBe("11/15/2026");
    expect(FR.date(day, "scoreDate")).toBe("15/11/2026");
  });

  it("upper-cases with the language's rules (accents kept)", () => {
    expect(FR.upper("médaille d'or")).toBe("MÉDAILLE D'OR");
  });

  it("falls back to English for a key a catalog lacks at runtime", () => {
    const partial = { ...fr } as Record<string, unknown>;
    delete partial["start.play"];
    const translator = createTranslator("fr", partial as unknown as Catalog);
    expect(translator.t("start.play")).toBe("START");
    expect(translator.t("pause.resume")).toBe("REPRENDRE");
  });

  it("returns raw templates for rich rendering", () => {
    expect(FR.template("daily.nextIn")).toBe("PROCHAIN DÉFI DANS {time}");
  });

  it("caches one translator per locale", () => {
    expect(getTranslator("fr")).toBe(FR);
  });
});

describe("locale selection", () => {
  it("takes the first browser language that has a catalog", () => {
    expect(detectLocale(["fr-FR", "en-US"])).toBe("fr");
    expect(detectLocale(["fr"])).toBe("fr");
    expect(detectLocale(["FR-ca"])).toBe("fr");
    expect(detectLocale(["fr_BE"])).toBe("fr");
    expect(detectLocale(["de-DE", "fr"])).toBe("fr");
    expect(detectLocale(["en-GB", "fr"])).toBe("en");
  });

  it("defaults to English", () => {
    expect(detectLocale([])).toBe("en");
    expect(detectLocale(["de-DE", "es"])).toBe("en");
    expect(detectLocale([""])).toBe("en");
    // "fra" or "french" are not BCP 47 primary tags for French.
    expect(detectLocale(["french"])).toBe("en");
  });

  it("lets a fixed setting override the browser", () => {
    expect(resolveLocale("auto", ["fr-FR"])).toBe("fr");
    expect(resolveLocale("en", ["fr-FR"])).toBe("en");
    expect(resolveLocale("fr", ["en-US"])).toBe("fr");
  });

  it("validates stored settings", () => {
    for (const value of LANGUAGE_SETTINGS) expect(isLanguageSetting(value)).toBe(true);
    for (const value of ["de", "FR", "", null, undefined, 1, {}]) {
      expect(isLanguageSetting(value)).toBe(false);
    }
  });
});

describe("top score dates", () => {
  it("formats stored date keys in the active language", () => {
    expect(formatScoreDate(EN, "2026-11-15")).toBe("11/15/2026");
    expect(formatScoreDate(FR, "2026-11-15")).toBe("15/11/2026");
  });

  it("shows legacy or invalid values as they are", () => {
    expect(formatScoreDate(FR, "1/1/2026")).toBe("1/1/2026");
    expect(formatScoreDate(FR, "2026-02-31")).toBe("2026-02-31");
    expect(formatScoreDate(FR, "")).toBe("");
  });
});
