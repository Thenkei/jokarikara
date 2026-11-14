import { memo, useMemo } from "react";
import { getRegularPolygonVertices } from "../utils/geometry";

/**
 * Decorative "attract" stack behind the start screen: nested shapes slowly
 * counter-rotating, i.e. the game's own visual language instead of a blank
 * page. Pure SVG + CSS transforms (compositor-only, no canvas, no JS per
 * frame); motion is disabled under prefers-reduced-motion via CSS.
 */

interface Layer {
  /** Regular polygon side count; 0 = circle. */
  sides: number;
  /** Circumradius in viewBox units (viewBox is 100 wide). */
  radius: number;
  /** Seconds per revolution; negative spins counter-clockwise. */
  period: number;
}

/** Outside-in, mirroring how a run unlocks shapes. */
export const BACKDROP_LAYERS: readonly Layer[] = [
  { sides: 0, radius: 48, period: 0 },
  { sides: 8, radius: 44, period: 90 },
  { sides: 6, radius: 37, period: -70 },
  { sides: 5, radius: 30, period: 55 },
  { sides: 4, radius: 23, period: -45 },
  { sides: 3, radius: 17, period: 35 },
];

const toPoints = (sides: number, radius: number): string =>
  getRegularPolygonVertices(sides, radius * 2, 0)
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

interface StartBackdropProps {
  palette: readonly string[];
}

export const StartBackdrop = memo(function StartBackdrop({
  palette,
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
    <div className="start-backdrop" aria-hidden="true">
      <svg viewBox="-50 -50 100 100" className="start-backdrop-svg">
        {layers.map((layer, index) => (
          <g
            key={index}
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
        ))}
      </svg>
    </div>
  );
});
