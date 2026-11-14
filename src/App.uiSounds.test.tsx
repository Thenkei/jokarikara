import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { playUi, playCue } = vi.hoisted(() => ({ playUi: vi.fn(), playCue: vi.fn() }));
vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      { playUi, playCue, isMuted: () => false, isMusicEnabled: () => true },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ),
  };
});

import App from "./App";

describe("menu sounds", () => {
  beforeEach(() => {
    playUi.mockClear();
    playCue.mockClear();
    localStorage.clear();
  });

  it("plays select, confirm and back for the matching buttons", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("radio", { name: "Zen mode" }));
    expect(playUi).toHaveBeenLastCalledWith("select");

    fireEvent.click(screen.getByRole("button", { name: /^achievements/i }));
    expect(playUi).toHaveBeenLastCalledWith("select");
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(playUi).toHaveBeenLastCalledWith("back");

    fireEvent.click(screen.getByRole("button", { name: "START" }));
    expect(playUi).toHaveBeenLastCalledWith("confirm");
  });

  it("stays silent for buttons with their own feedback", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("radio", { name: "Zen mode" }));
    fireEvent.click(screen.getByRole("button", { name: "START" }));
    playUi.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Undo last stack" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart current shape" }));
    expect(playUi).not.toHaveBeenCalled();
  });

  it("selects with arrow keys in the mode group", () => {
    render(<App />);
    const classic = screen.getByRole("radio", { name: "Classic mode" });
    fireEvent.keyDown(classic, { key: "ArrowRight" });
    expect(playUi).toHaveBeenCalledWith("select");
    expect(screen.getByRole("radio", { name: "Zen mode" }).getAttribute("aria-checked")).toBe("true");
  });

  it("settings sheet: select on the gear, silent self-voiced switches, back on DONE", () => {
    render(<App />);
    const gear = screen.getByRole("button", { name: "Settings" });
    fireEvent.click(gear);
    expect(playUi).toHaveBeenLastCalledWith("select");
    expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();

    playUi.mockClear();
    fireEvent.click(screen.getByRole("switch", { name: "Visual effects" }));
    expect(playUi).toHaveBeenLastCalledWith("select");

    // Enabling the cue previews the PERFECT tick instead of the menu click.
    playUi.mockClear();
    fireEvent.click(screen.getByRole("switch", { name: "Timing cue" }));
    expect(playCue).toHaveBeenCalledWith(0, true);
    expect(playUi).not.toHaveBeenCalled();
    // Muting stays silent.
    fireEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(playUi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "DONE" }));
    expect(playUi).toHaveBeenLastCalledWith("back");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(gear);
    expect(JSON.parse(localStorage.getItem("shape-stack-settings")!)).toMatchObject({
      reducedFx: true,
      timingCue: true,
      muted: true,
    });
  });

  it("settings sheet: the start screen is inert and Enter cannot start a run behind it", () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(container.querySelector(".start-screen")?.hasAttribute("inert")).toBe(true);

    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(container.querySelector(".start-screen")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: /settings/i })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector(".start-screen")?.hasAttribute("inert")).toBe(false);
  });
});
