import { en } from "./en";
import { fr } from "./fr";
import type { Catalog, MessageArgs, MessageKey, ParamValue } from "./catalog";
import { DATE_FORMATS, INTL_LOCALE } from "./formats";
import type { DateFormatName, Locale, Message, PluralMessage } from "./types";

/**
 * The translator: one immutable object per locale, built once and cached.
 * Pure modules receive it as an argument (never read a global), React
 * components get the active one from `useI18n()`.
 */
export interface Translator {
  readonly locale: Locale;
  /** BCP 47 tag used for `Intl` and `<html lang>` consumers ("en-US"). */
  readonly intlLocale: string;
  /** Message for `key`, placeholders filled, plural form picked from `count`. */
  t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string;
  /**
   * The raw template of a plain message, for callers that splice React nodes
   * into its placeholders (see `Rich`). Plurals are not templates.
   */
  template(key: MessageKey): string;
  /** `Intl.NumberFormat` for this locale (formatters cached per options). */
  number(value: number, options?: Intl.NumberFormatOptions): string;
  /** `Intl.DateTimeFormat` with this locale's named format. */
  date(value: Date, format: DateFormatName): string;
  /** Locale-aware upper case ("médaille d'or" → "MÉDAILLE D'OR"). */
  upper(text: string): string;
}

export const CATALOGS: Readonly<Record<Locale, Catalog>> = Object.freeze({ en, fr });

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * Fills `{name}` placeholders. Numbers are written as plain digits: game
 * readouts (scores, thresholds) must look the same everywhere; callers format
 * prose numbers with `number()` first. An unknown placeholder is left as is,
 * so a catalog typo shows up on screen instead of silently vanishing.
 */
export const interpolate = (
  template: string,
  params: Readonly<Record<string, ParamValue>> | undefined,
): string =>
  params === undefined
    ? template
    : template.replace(PLACEHOLDER, (match, name: string) => {
        const value = params[name];
        return value === undefined ? match : String(value);
      });

const isPlural = (message: Message): message is PluralMessage =>
  typeof message === "object" && message !== null;

export const createTranslator = (locale: Locale, catalog: Catalog = CATALOGS[locale]): Translator => {
  const intlLocale = INTL_LOCALE[locale];
  const pluralRules = new Intl.PluralRules(intlLocale);
  const numberFormats = new Map<string, Intl.NumberFormat>();
  const dateFormats = new Map<DateFormatName, Intl.DateTimeFormat>();

  const lookup = (key: MessageKey): Message =>
    // A catalog built outside the type system (tests, a future lazy load)
    // still degrades to English rather than printing a key.
    (catalog[key] as Message | undefined) ?? (en[key] as Message);

  const t = <K extends MessageKey>(key: K, ...args: MessageArgs<K>): string => {
    const params = args[0] as Readonly<Record<string, ParamValue>> | undefined;
    const message = lookup(key);
    if (!isPlural(message)) return interpolate(message, params);
    const count = Number(params?.count ?? 0);
    const category = pluralRules.select(count) as keyof PluralMessage | string;
    const form =
      category === "one" || category === "other" ? message[category] : message.other;
    return interpolate(form, params);
  };

  const template = (key: MessageKey): string => {
    const message = lookup(key);
    return isPlural(message) ? message.other : message;
  };

  const number = (value: number, options?: Intl.NumberFormatOptions): string => {
    const cacheKey = options ? JSON.stringify(options) : "";
    let format = numberFormats.get(cacheKey);
    if (!format) {
      format = new Intl.NumberFormat(intlLocale, options);
      numberFormats.set(cacheKey, format);
    }
    return format.format(value);
  };

  const date = (value: Date, formatName: DateFormatName): string => {
    let format = dateFormats.get(formatName);
    if (!format) {
      format = new Intl.DateTimeFormat(intlLocale, DATE_FORMATS[locale][formatName]);
      dateFormats.set(formatName, format);
    }
    return format.format(value);
  };

  return Object.freeze({
    locale,
    intlLocale,
    t,
    template,
    number,
    date,
    upper: (text: string) => text.toLocaleUpperCase(intlLocale),
  });
};

const translators = new Map<Locale, Translator>();

/** Shared translator for `locale` (built on first use). */
export const getTranslator = (locale: Locale): Translator => {
  let translator = translators.get(locale);
  if (!translator) {
    translator = createTranslator(locale);
    translators.set(locale, translator);
  }
  return translator;
};
