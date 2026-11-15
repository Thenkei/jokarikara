import { DEFAULT_LOCALE, isLocale, type LanguageSetting, type Locale } from "./types";

/**
 * Locale selection. Pure: the browser languages are passed in, so "auto" is
 * testable without stubbing `navigator`.
 */

/**
 * Locale for a browser language list (most preferred first): the first
 * language that has a catalog, English when none does. Only the primary
 * subtag matters ("fr-CA", "FR" → fr), so ["fr-CA", "en"] is French and
 * ["en-GB", "fr"] stays English.
 */
export const detectLocale = (languages: readonly string[]): Locale => {
  for (const language of languages) {
    const primary = language.trim().toLowerCase().split(/[-_]/)[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
};

/** The locale a stored setting resolves to, given the browser languages. */
export const resolveLocale = (
  setting: LanguageSetting,
  languages: readonly string[],
): Locale => (setting === "auto" ? detectLocale(languages) : setting);

/**
 * `navigator.languages`, falling back to `navigator.language`; empty when
 * there is no navigator (SSR, tests without one).
 */
export const readBrowserLanguages = (): readonly string[] => {
  if (typeof navigator === "undefined") return [];
  const list = navigator.languages;
  if (Array.isArray(list) && list.length > 0) return list;
  return typeof navigator.language === "string" && navigator.language
    ? [navigator.language]
    : [];
};
