import type { DateFormatName, Locale } from "./types";

/**
 * Per-locale date formats (FormatJS-style named formats): the catalog says
 * what to write, this says how a date looks in that language.
 *
 * English keeps the exact output the game always had ("Nov 15", and the
 * en-US default "11/15/2026" for top scores). French spells the month out on
 * the Daily ("15 novembre"): the short form "15 nov." ends with a period that
 * collides with the sentence around it.
 */
export const DATE_FORMATS: Readonly<
  Record<Locale, Readonly<Record<DateFormatName, Intl.DateTimeFormatOptions>>>
> = Object.freeze({
  en: {
    dailyDay: { month: "short", day: "numeric" },
    scoreDate: { year: "numeric", month: "numeric", day: "numeric" },
  },
});

/**
 * BCP 47 tag handed to `Intl` for each UI locale. Pinned to a region so a
 * value never depends on the device ("1,234" in English everywhere, the
 * French thin space in French everywhere).
 */
export const INTL_LOCALE: Readonly<Record<Locale, string>> = Object.freeze({
  en: "en-US",
});
