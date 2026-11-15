import { getSettings } from "../utils/storage";
import { readBrowserLanguages, resolveLocale } from "./locale";

/**
 * Sets `<html lang>` from the stored language setting before React renders,
 * so assistive tech never reads the first paint with index.html's static
 * `lang="en"` on a French page. App keeps it in sync afterwards. Never throws:
 * storage is validated on read and an unknown setting resolves like "auto".
 */
export const applyInitialDocumentLang = (doc: Document = document): string => {
  const locale = resolveLocale(getSettings().language, readBrowserLanguages());
  doc.documentElement.lang = locale;
  return locale;
};
