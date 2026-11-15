/**
 * i18n vocabulary shared by the catalogs, the translator and the settings.
 * Pure types and constants: no React, no storage, no globals.
 */

/** UI languages with a full catalog. English is the source and the fallback. */
export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Stored preference: "auto" follows the browser, otherwise a fixed locale. */
export const LANGUAGE_SETTINGS = ["auto", ...LOCALES] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

/**
 * Each language's own name (endonym), shown as is whatever the UI language:
 * a player who cannot read the current one still finds theirs.
 */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = Object.freeze({
  en: "English",
  fr: "Français",
});

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

export const isLanguageSetting = (value: unknown): value is LanguageSetting =>
  typeof value === "string" && (LANGUAGE_SETTINGS as readonly string[]).includes(value);

/**
 * Count-dependent message. `one`/`other` are required (every catalog has
 * them); the translator picks the form from `Intl.PluralRules` and falls back
 * to `other` for categories a catalog does not spell out (French "many").
 */
export interface PluralMessage {
  readonly one: string;
  readonly other: string;
}

export type Message = string | PluralMessage;

/**
 * Named date formats. The options differ per locale (see `formats.ts`): a
 * short English "Nov 15" reads well, while French "15 nov." ends with a
 * period that collides with the sentence it sits in.
 */
export type DateFormatName =
  /** Daily Challenge day on buttons and cards: "Nov 15" / "15 novembre". */
  | "dailyDay"
  /** Top score dates: "11/15/2026" / "15/11/2026". */
  | "scoreDate";
