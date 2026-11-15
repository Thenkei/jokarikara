import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorldAtlas } from "./WorldAtlas";
import { getWorldConfig } from "../gameplay/selectors";

const renderAtlas = (bestWorld: number) => {
  const onPractice = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <WorldAtlas
      bestWorld={bestWorld}
      reducedFx={false}
      onPractice={onPractice}
      onClose={onClose}
    />,
  );
  return { ...view, onPractice, onClose };
};

const card = (container: HTMLElement, world: number) =>
  container.querySelector<HTMLElement>(`.world-card[data-world="${world}"]`)!;

describe("WorldAtlas", () => {
  it("shows the discovered counter and one list item per world", () => {
    renderAtlas(4);
    expect(screen.getByText("4 / 10 DISCOVERED")).toBeTruthy();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
  });

  it("reveals reached worlds and keeps locked ones spoiler-free", () => {
    const { container } = renderAtlas(4);
    const wave = card(container, 4);
    expect(wave.className).toContain("revealed");
    expect(within(wave).getByText("Wave")).toBeTruthy();
    expect(within(wave).getByText(getWorldConfig(4).tagline!)).toBeTruthy();

    const locked = card(container, 5);
    expect(locked.className).toContain("locked");
    expect(within(locked).getByText("???")).toBeTruthy();
    expect(within(locked).getByText("Reach world 5 to reveal")).toBeTruthy();
    // Announced as locked, never by name.
    expect(
      within(locked).getByRole("heading", { name: /WORLD 5\s*, locked/ }),
    ).toBeTruthy();
    for (let world = 5; world <= 10; world += 1) {
      const { name, tagline } = getWorldConfig(world);
      expect(container.textContent).not.toContain(name!);
      expect(container.textContent).not.toContain(tagline!);
    }
  });

  it("offers practice for reached worlds from 2 and reports the world", () => {
    const { container, onPractice } = renderAtlas(4);
    expect(within(card(container, 1)).queryByRole("button")).toBeNull();
    expect(within(card(container, 5)).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Practice world/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Practice world 4, Wave" }));
    expect(onPractice).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("focuses BACK on open and closes from it", () => {
    const { onClose } = renderAtlas(1);
    const back = screen.getByRole("button", { name: "BACK" });
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reveals every world once the last one is reached", () => {
    const { container } = renderAtlas(12);
    expect(screen.getByText("10 / 10 DISCOVERED")).toBeTruthy();
    expect(container.querySelectorAll(".world-card.locked")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Practice world 10, Heartbeat" })).toBeTruthy();
  });
});
