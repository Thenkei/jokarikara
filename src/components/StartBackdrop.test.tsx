import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StartBackdrop } from "./StartBackdrop";
import { BACKDROP_LAYERS } from "./startBackdropLayers";

describe("StartBackdrop", () => {
  it("renders one centred layer per backdrop shape, hidden from assistive tech", () => {
    const { container } = render(
      <StartBackdrop palette={["#111111", "#222222", "#333333"]} />,
    );
    const root = container.querySelector(".start-backdrop");
    expect(root?.getAttribute("aria-hidden")).toBe("true");

    const layers = container.querySelectorAll(".start-backdrop-layer");
    expect(layers).toHaveLength(BACKDROP_LAYERS.length);
    // Each layer carries an invisible anchor of its radius so rotation is
    // centred on the stack (fill-box origin), even for odd polygons.
    layers.forEach((layer, i) => {
      const anchor = layer.querySelector(".start-backdrop-anchor");
      expect(anchor?.getAttribute("r")).toBe(String(BACKDROP_LAYERS[i].radius));
    });
  });

  it("cycles palette colours and spins alternate layers in opposite directions", () => {
    const { container } = render(<StartBackdrop palette={["#aa0000", "#00aa00"]} />);
    const shapes = container.querySelectorAll(
      ".start-backdrop-layer > :not(.start-backdrop-anchor)",
    );
    expect(shapes[0].getAttribute("fill")).toBe("#aa0000");
    expect(shapes[1].getAttribute("fill")).toBe("#00aa00");
    expect(shapes[2].getAttribute("fill")).toBe("#aa0000");

    const layers = container.querySelectorAll<SVGGElement>(".start-backdrop-layer");
    expect(layers[0].style.animation).toContain("none"); // outer circle is static
    expect(layers[1].style.animationDirection).toBe("normal");
    expect(layers[2].style.animationDirection).toBe("reverse");
  });

  it("plays the flourish on a per-layer wrapper, leaving the idle spin alone", () => {
    const palette = ["#111111"];
    const { container, rerender } = render(<StartBackdrop palette={palette} />);
    const root = container.querySelector(".start-backdrop")!;
    expect(root.classList.contains("flourish")).toBe(false);

    rerender(<StartBackdrop palette={palette} flourish />);
    expect(root.classList.contains("flourish")).toBe(true);
    const bursts = container.querySelectorAll<SVGGElement>(".start-backdrop-burst");
    expect(bursts).toHaveLength(BACKDROP_LAYERS.length);
    bursts.forEach((burst, i) => {
      // One spinning layer per wrapper; depth staggers the burst.
      expect(burst.querySelectorAll(".start-backdrop-layer")).toHaveLength(1);
      expect(burst.style.getPropertyValue("--burst-depth")).toBe(String(i));
    });
    expect(bursts[2].style.getPropertyValue("--burst-turn")).toBe("-1");

    rerender(<StartBackdrop palette={palette} />);
    expect(root.classList.contains("flourish")).toBe(false);
  });

  it("falls back to a default colour with an empty palette", () => {
    const { container } = render(<StartBackdrop palette={[]} />);
    const first = container.querySelector(
      ".start-backdrop-layer > :not(.start-backdrop-anchor)",
    );
    expect(first?.getAttribute("fill")).toBe("#3b82f6");
  });
});
