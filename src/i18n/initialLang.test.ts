import { afterEach, describe, expect, it, vi } from "vitest";
import { applyInitialDocumentLang } from "./initialLang";

const setLanguages = (languages: string[]) =>
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);

describe("applyInitialDocumentLang", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.lang = "en";
  });

  it("follows a French browser before any render", () => {
    setLanguages(["fr-FR", "en"]);
    expect(applyInitialDocumentLang()).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  it("honours a stored override over the browser", () => {
    setLanguages(["fr-FR"]);
    localStorage.setItem("shape-stack-settings", JSON.stringify({ language: "en" }));
    expect(applyInitialDocumentLang()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("falls back to English for unsupported languages and corrupt storage", () => {
    setLanguages(["de-DE"]);
    localStorage.setItem("shape-stack-settings", "{not json");
    expect(applyInitialDocumentLang()).toBe("en");
  });
});
