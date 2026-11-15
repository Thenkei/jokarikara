import { useRef, useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SettingsSheet, type SettingsValues } from "./SettingsSheet";
import { getTranslator, type LanguageSetting } from "../i18n";
import { I18nContext } from "../i18n/context";

const VALUES: SettingsValues = {
  fx: true,
  sound: true,
  music: false,
  haptics: true,
  timingCue: false,
};

const renderSheet = (
  overrides: Partial<Parameters<typeof SettingsSheet>[0]> = {},
) => {
  const onToggle = vi.fn();
  const onClose = vi.fn();
  const onLanguageChange = vi.fn();
  const utils = render(
    <SettingsSheet
      values={VALUES}
      hapticsSupported
      onToggle={onToggle}
      language="auto"
      onLanguageChange={onLanguageChange}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { ...utils, onToggle, onClose, onLanguageChange };
};

const switchNamed = (name: string) => screen.getByRole("switch", { name });

/** Opener + sheet, the way App mounts it (gear ref passed as returnFocusRef). */
function Harness() {
  const [open, setOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={gearRef} onClick={() => setOpen(true)}>
        Settings
      </button>
      {open && (
        <SettingsSheet
          values={VALUES}
          hapticsSupported
          onToggle={() => {}}
          language="auto"
          onLanguageChange={() => {}}
          onClose={() => setOpen(false)}
          returnFocusRef={gearRef}
        />
      )}
    </>
  );
}

describe("SettingsSheet", () => {
  it("is a labelled modal dialog with one described switch per setting", () => {
    renderSheet();
    const dialog = screen.getByRole("dialog", { name: "SETTINGS" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const switches = within(dialog).getAllByRole("switch");
    expect(switches.map((node) => node.textContent)).toEqual([
      expect.stringContaining("Visual effects"),
      expect.stringContaining("Sound"),
      expect.stringContaining("Music"),
      expect.stringContaining("Haptics"),
      expect.stringContaining("Timing cue"),
    ]);

    expect(switchNamed("Visual effects").getAttribute("aria-checked")).toBe("true");
    expect(switchNamed("Music").getAttribute("aria-checked")).toBe("false");
    expect(switchNamed("Timing cue").getAttribute("aria-checked")).toBe("false");

    // Each switch is described by its one-line explanation.
    const cue = switchNamed("Timing cue");
    const description = document.getElementById(cue.getAttribute("aria-describedby")!);
    expect(description?.textContent).toMatch(/PERFECT/);
  });

  it("reports the toggled setting and keeps the delegated sound conventions", () => {
    const { onToggle } = renderSheet();
    fireEvent.click(switchNamed("Music"));
    expect(onToggle).toHaveBeenLastCalledWith("music");
    fireEvent.click(switchNamed("Visual effects"));
    expect(onToggle).toHaveBeenLastCalledWith("fx");

    // Sound and the timing cue give their own audible feedback.
    expect(switchNamed("Sound").dataset.uiSound).toBe("none");
    expect(switchNamed("Timing cue").dataset.uiSound).toBe("none");
    expect(switchNamed("Music").dataset.uiSound).toBeUndefined();
    expect(screen.getByRole("button", { name: "DONE" }).dataset.uiSound).toBe("back");
  });

  it("disables haptics with an explanation when the device cannot vibrate", () => {
    const { onToggle } = renderSheet({ hapticsSupported: false });
    const haptics = switchNamed("Haptics") as HTMLButtonElement;
    expect(haptics.disabled).toBe(true);
    expect(haptics.getAttribute("aria-checked")).toBe("false");
    expect(
      document.getElementById(haptics.getAttribute("aria-describedby")!)?.textContent,
    ).toBe("Not available on this device.");
    fireEvent.click(haptics);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("moves focus to the first switch on open", () => {
    renderSheet();
    expect(document.activeElement).toBe(switchNamed("Visual effects"));
  });

  it("closes on Escape without letting the key reach window listeners", () => {
    const windowListener = vi.fn();
    window.addEventListener("keydown", windowListener);
    try {
      const { onClose } = renderSheet();
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(windowListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", windowListener);
    }
  });

  it("closes from DONE and from the scrim", () => {
    const { onClose, container } = renderSheet();
    fireEvent.click(screen.getByRole("button", { name: "DONE" }));
    fireEvent.click(container.querySelector(".settings-scrim")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("traps Tab inside the sheet in both directions", () => {
    renderSheet();
    const first = switchNamed("Visual effects");
    const done = screen.getByRole("button", { name: "DONE" });

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(done);
    fireEvent.keyDown(done, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Focus that escaped the sheet (e.g. a click on the scrim) is pulled back.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  describe("language", () => {
    /** The sheet as App drives it: the choice comes back as the new value. */
    function LanguageHarness({ initial = "auto" }: { initial?: LanguageSetting }) {
      const [language, setLanguage] = useState<LanguageSetting>(initial);
      return (
        <SettingsSheet
          values={VALUES}
          hapticsSupported
          onToggle={() => {}}
          language={language}
          onLanguageChange={setLanguage}
          onClose={() => {}}
        />
      );
    }

    const group = () => screen.getByRole("radiogroup", { name: "Language" });

    it("is a labelled radio group: Auto, then each language in its own name", () => {
      renderSheet({ language: "fr" });
      const radios = within(group()).getAllByRole("radio");
      expect(radios.map((radio) => radio.textContent)).toEqual(["Auto", "English", "Français"]);
      expect(radios.map((radio) => radio.getAttribute("lang"))).toEqual([null, "en", "fr"]);
      expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual([
        "false",
        "false",
        "true",
      ]);
      // One tab stop: the checked option.
      expect(radios.map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);
      expect(
        document.getElementById(group().getAttribute("aria-describedby")!)?.textContent,
      ).toMatch(/browser/);
    });

    it("reports a click on an option", () => {
      const { onLanguageChange } = renderSheet();
      fireEvent.click(screen.getByRole("radio", { name: "Français" }));
      expect(onLanguageChange).toHaveBeenLastCalledWith("fr");
    });

    it("moves and selects with the arrow keys, wrapping, Home and End", () => {
      render(<LanguageHarness />);
      const radio = (name: string) => screen.getByRole("radio", { name });
      fireEvent.keyDown(radio("Auto"), { key: "ArrowRight" });
      expect(radio("English").getAttribute("aria-checked")).toBe("true");
      expect(document.activeElement).toBe(radio("English"));
      fireEvent.keyDown(radio("English"), { key: "End" });
      expect(document.activeElement).toBe(radio("Français"));
      fireEvent.keyDown(radio("Français"), { key: "ArrowDown" });
      expect(radio("Auto").getAttribute("aria-checked")).toBe("true");
      fireEvent.keyDown(radio("Auto"), { key: "ArrowLeft" });
      expect(radio("Français").getAttribute("aria-checked")).toBe("true");
      fireEvent.keyDown(radio("Français"), { key: "Home" });
      expect(document.activeElement).toBe(radio("Auto"));
    });

    it("renders in the active language", () => {
      render(
        <I18nContext value={getTranslator("fr")}>
          <LanguageHarness initial="fr" />
        </I18nContext>,
      );
      expect(screen.getByRole("dialog", { name: "RÉGLAGES" })).toBeTruthy();
      expect(screen.getByRole("radiogroup", { name: "Langue" })).toBeTruthy();
      expect(screen.getByRole("switch", { name: "Effets visuels" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "OK" })).toBeTruthy();
      // Language names stay in their own language.
      expect(screen.getByRole("radio", { name: "English" })).toBeTruthy();
    });
  });

  it("returns focus to the opener when it closes", () => {
    render(<Harness />);
    const gear = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(gear);
    expect(document.activeElement).toBe(switchNamed("Visual effects"));

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(gear);
  });
});
