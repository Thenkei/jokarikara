import { useId } from "react";
import type { Medal } from "../modes/medals";

interface MedalGlyphProps {
  /** null draws the empty slot (no medal yet). */
  medal: Medal | null;
  className?: string;
}

/**
 * Decorative medal: ribbon, metallic disc, inner ring and star. Colours come
 * from the `--medal-*` tokens (index.css) through the `medal-glyph--<metal>`
 * class, so the glyph follows the theme without hard-coded fills. Always
 * aria-hidden: the surrounding text names the medal.
 */
export function MedalGlyph({ medal, className }: MedalGlyphProps) {
  // useId() can contain characters that break `url(#id)`; keep it plain.
  const gradientId = `medal-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const metal = medal ? medal.toLowerCase() : "none";
  const classes = ["medal-glyph", `medal-glyph--${metal}`, className].filter(Boolean).join(" ");

  if (medal === null) {
    return (
      <svg className={classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle
          cx="12"
          cy="14.5"
          r="7.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.6 2.2"
        />
      </svg>
    );
  }

  return (
    <svg className={classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--medal-hi)" }} />
          <stop offset="55%" style={{ stopColor: "var(--medal-base)" }} />
          <stop offset="100%" style={{ stopColor: "var(--medal-lo)" }} />
        </linearGradient>
      </defs>
      <path className="medal-glyph-ribbon" d="M6.5 1h4.2l2.6 7.2H9.1z" />
      <path className="medal-glyph-ribbon medal-glyph-ribbon--back" d="M17.5 1h-4.2l-2.6 7.2h4.2z" />
      <circle
        cx="12"
        cy="14.5"
        r="7.5"
        fill={`url(#${gradientId})`}
        style={{ stroke: "var(--medal-lo)" }}
        strokeWidth="0.9"
      />
      <circle
        cx="12"
        cy="14.5"
        r="5.3"
        fill="none"
        style={{ stroke: "var(--medal-hi)" }}
        strokeOpacity="0.75"
        strokeWidth="0.7"
      />
      <path
        d="M12 11.3l.96 1.95 2.15.31-1.56 1.52.37 2.14L12 16.2l-1.92 1.02.37-2.14-1.56-1.52 2.15-.31z"
        style={{ fill: "var(--medal-lo)" }}
        fillOpacity="0.85"
      />
    </svg>
  );
}
