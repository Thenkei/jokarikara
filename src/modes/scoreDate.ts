import type { Translator } from "../i18n";

/**
 * Top score dates. New entries store the local date key ("2026-11-15", see
 * `saveHighScore`) and are formatted in the active language when shown.
 * Entries saved before that hold a display string from whatever locale the
 * browser had ("11/15/2026"): they cannot be parsed reliably, so they are
 * shown as they are.
 */
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const formatScoreDate = (i18n: Translator, stored: string): string => {
  const match = DATE_KEY.exec(stored);
  if (!match) return stored;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  // Reject impossible days (2026-02-31) rather than show a rolled-over date.
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return stored;
  return i18n.date(date, "scoreDate");
};
