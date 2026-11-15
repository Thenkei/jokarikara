/**
 * Home-grown i18n (no dependency): typed catalogs (`en.ts` is the source,
 * every other catalog must satisfy `Catalog`), `{name}` interpolation, plural
 * forms via `Intl.PluralRules`, and `Intl` number/date formatting.
 *
 * - Pure modules take a `Translator` argument; they never read the active
 *   language from a global.
 * - React components call `useI18n()`; App provides the active translator.
 */
export type { Catalog, MessageKey, MessageArgs, ParamValue } from "./catalog";
export { CATALOGS, createTranslator, getTranslator, interpolate, type Translator } from "./translator";
export { detectLocale, readBrowserLanguages, resolveLocale } from "./locale";
export {
  DEFAULT_LOCALE,
  LANGUAGE_NAMES,
  LANGUAGE_SETTINGS,
  LOCALES,
  isLanguageSetting,
  isLocale,
  type LanguageSetting,
  type Locale,
} from "./types";
