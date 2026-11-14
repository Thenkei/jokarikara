import { memo, useMemo, type CSSProperties } from "react";
import { getRegularPolygonVertices } from "../utils/geometry";
import { BACKDROP_LAYERS } from "./startBackdropLayers";

/**
 * Decorative "attract" stack behind the start screen: nested shapes slowly
 * counter-rotating, i.e. the game's own visual language instead of a blank
 * page. Pure SVG + CSS transforms (compositor-only, no canvas, no JS per
 * frame); motion is disabled under prefers-reduced-motion via CSS.
 *
 * `flourish` plays a one-off celebration (layers spin up and burst outward,
 * then settle back on their idle rotation). It is CSS-only too: each layer
 * sits in a wrapper that owns the burst, so the idle spin is never reset.
 */

const toPoints = (sides: number, radius: number): string =>
  getRegularPolygonVertices(sides, radius * 2, 0)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

interface StartBackdropProps {
  palette: readonly string[];
  /** True while the celebration plays (the caller times it). */
  flourish?: boolean;
}

export const StartBackdrop = memo(function StartBackdrop({
  palette,
  flourish = false,
}: StartBackdropProps) {
  const layers = useMemo(
    () =>
      BACKDROP_LAYERS.map((layer, index) => ({
        ...layer,
        color: palette[index % Math.max(1, palette.length)] ?? "#3b82f6",
        points: layer.sides > 0 ? toPoints(layer.sides, layer.radius) : null,
      })),
    [palette],
  );

  return (
    <div
      className={`start-backdrop${flourish ? " flourish" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="-50 -50 100 100" className="start-backdrop-svg">
        {layers.map((layer, index) => (
          <g
            key={index}
            className="start-backdrop-burst"
            style={
              {
                // Inner layers burst further and later; spin follows the idle direction.
                "--burst-depth": index,
                "--burst-turn": layer.period < 0 ? -1 : 1,
              } as CSSProperties
            }
          >
            <g
              className="start-backdrop-layer"
              style={
                layer.period !== 0
                  ? {
                      animationDuration: `${Math.abs(layer.period)}s`,
                      animationDirection: layer.period < 0 ? "reverse" : "normal",
                    }
                  : { animation: "none" }
              }
            >
              <circle
                className="start-backdrop-anchor"
                r={layer.radius}
                fill="none"
                stroke="none"
              />
              {layer.points ? (
                <polygon points={layer.points} fill={layer.color} />
              ) : (
                <circle r={layer.radius} fill={layer.color} />
              )}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
});
