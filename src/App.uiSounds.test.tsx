import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { playUi } = vi.hoisted(() => ({ playUi: vi.fn() }));
vi.mock("./utils/audioManager", () => {
  const noop = () => {};
  return {
    audioManager: new Proxy(
      { playUi, isMuted: () => false, isMusicEnabled: () => true },
      { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) },
    ),
  };
});

import App from "./App";

describe("menu sounds", () => {
  beforeEach(() => {
    playUi.mockClear();
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
});
