import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      { isMuted: () => false, isMusicEnabled: () => true },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ),
  };
});

import App from "./App";
import { getSettings } from "./utils/storage";

const SETTINGS_KEY = "shape-stack-settings";

/** Browser languages as `navigator.languages` reports them. */
const setBrowserLanguages = (languages: readonly string[]) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "");
};

describe("App language", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = "en";
  });
  afterEach(() => vi.restoreAllMocks());

  it("follows a French browser on first visit", () => {
    setBrowserLanguages(["fr-FR", "en"]);
    render(<App />);
    expect(screen.getByRole("button", { name: "JOUER" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Mode chrono" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("stays English for any other browser language", () => {
    setBrowserLanguages(["de-DE"]);
    render(<App />);
    expect(screen.getByRole("button", { name: "START" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("lets a stored choice override the browser", () => {
    setBrowserLanguages(["fr-FR"]);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language: "en" }));
    render(<App />);
    expect(screen.getByRole("button", { name: "START" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("switches at once from the settings sheet and saves the choice", () => {
    setBrowserLanguages(["en-US"]);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const group = screen.getByRole("radiogroup", { name: "Language" });
    fireEvent.click(within(group).getByRole("radio", { name: "Français" }));

    // The sheet itself re-renders in French, and so does the page behind it.
    expect(screen.getByRole("radiogroup", { name: "Langue" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr");
    expect(getSettings().language).toBe("fr");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("button", { name: "JOUER" })).toBeTruthy();

    // Back to Auto: an English browser means English again.
    fireEvent.click(screen.getByRole("button", { name: "Réglages" }));
    fireEvent.click(screen.getByRole("radio", { name: "Auto" }));
    expect(getSettings().language).toBe("auto");
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeTruthy();
  });

  it("follows a browser language change while on Auto", () => {
    setBrowserLanguages(["en-US"]);
    render(<App />);
    expect(screen.getByRole("button", { name: "START" })).toBeTruthy();
    setBrowserLanguages(["fr-CA"]);
    act(() => {
      window.dispatchEvent(new Event("languagechange"));
    });
    expect(screen.getByRole("button", { name: "JOUER" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr");
  });
});
