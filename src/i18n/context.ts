import { createContext, useContext } from "react";
import { getTranslator, type Translator } from "./translator";
import { DEFAULT_LOCALE } from "./types";

/**
 * Active translator for the React tree. App provides it (it owns the language
 * setting); the default is English, so a component rendered on its own (unit
 * tests) reads the source catalog.
 */
export const I18nContext = createContext<Translator>(getTranslator(DEFAULT_LOCALE));

/** `{ t, locale, number, date, upper, ... }` for the active language. */
export const useI18n = (): Translator => useContext(I18nContext);
