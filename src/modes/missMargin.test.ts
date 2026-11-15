import { describe, expect, it } from "vitest";
import {
  HAIR_FRACTION,
  MAX_MARGIN_PERCENT,
  MAX_TENTHS,
  getMissMarginHint,
  getTenths,
  getMarginPercent,
  getMissAnnouncement,
  getMissMarginHeadline,
  getMissMarginLabel,
} from "./missMargin";

const NBSP = " ";

describe("margin buckets", () => {
  it("reads below 1 % as 'by a hair', then whole percents", () => {
    expect(HAIR_FRACTION).toBe(0.01);
    expect(getMarginPercent(0)).toBeNull();
    expect(getMarginPercent(0.004)).toBeNull();
    expect(getMarginPercent(0.0099)).toBeNull();
    expect(getMarginPercent(0.01)).toBe(1);
    expect(getMarginPercent(0.0149)).toBe(1);
    expect(getMarginPercent(0.04)).toBe(4);
    expect(getMarginPercent(0.087)).toBe(9);
    expect(getMarginPercent(50)).toBe(MAX_MARGIN_PERCENT);
    expect(getMarginPercent(Number.NaN)).toBeNull();
  });

  it("rounds durations to tenths, never below 0.1 s", () => {
    expect(getTenths(0)).toBe(1);
    expect(getTenths(0.01)).toBe(1);
    expect(getTenths(0.26)).toBe(3);
    expect(getTenths(1.04)).toBe(10);
    expect(getTenths(500)).toBe(MAX_TENTHS);
    expect(getTenths(Number.NaN)).toBe(1);
  });
});

describe("untapped overflow wording (time)", () => {
  it("headline, mid-run label and hint", () => {
    const margin = { kind: "lateTime", seconds: 0.42 } as const;
    expect(getMissMarginHeadline(margin)).toBe(`Late by 0.4${NBSP}s`);
    expect(getMissMarginLabel(margin)).toBe(`LATE 0.4${NBSP}s`);
    expect(getMissMarginHint(margin, false)).toBe(
      `PERFECT opened 0.4${NBSP}s before the edge.`,
    );
    expect(getMissMarginHint({ kind: "lateTime", seconds: 1.26 }, true)).toBe(
      `PERFECT opened 1.3${NBSP}s before the ring.`,
    );
    expect(getMissAnnouncement(margin)).toBe(`Miss. Late by 0.4${NBSP}s`);
  });

  it("has no hint for size or fracture margins", () => {
    expect(getMissMarginHint({ kind: "late", fraction: 0.04 }, false)).toBeNull();
    expect(getMissMarginHint({ kind: "early", fraction: 0.04 }, true)).toBeNull();
    expect(getMissMarginHint({ kind: "fracture", clearInSec: 0.3 }, false)).toBeNull();
  });
});

describe("margin wording", () => {
  it("headlines say which way and by how much", () => {
    expect(getMissMarginHeadline({ kind: "late", fraction: 0.04 })).toBe(
      `Too late by 4${NBSP}%`,
    );
    expect(getMissMarginHeadline({ kind: "late", fraction: 0.006 })).toBe(
      "Too late by a hair",
    );
    expect(getMissMarginHeadline({ kind: "early", fraction: 0.12 })).toBe(
      `Too early by 12${NBSP}%`,
    );
    expect(getMissMarginHeadline({ kind: "early", fraction: 0.002 })).toBe(
      "Too early by a hair",
    );
    expect(getMissMarginHeadline({ kind: "fracture", clearInSec: 0.26 })).toBe(
      `Sector clear 0.3${NBSP}s later`,
    );
  });

  it("short labels sign the size error", () => {
    expect(getMissMarginLabel({ kind: "late", fraction: 0.04 })).toBe(`+4${NBSP}%`);
    expect(getMissMarginLabel({ kind: "early", fraction: 0.04 })).toBe(`−4${NBSP}%`);
    expect(getMissMarginLabel({ kind: "late", fraction: 0.009 })).toBe("BY A HAIR");
    expect(getMissMarginLabel({ kind: "fracture", clearInSec: 1.04 })).toBe(
      `WAIT 1.0${NBSP}s`,
    );
  });

  it("serves the same cached text for the same bucket", () => {
    const a = getMissMarginLabel({ kind: "late", fraction: 0.041 });
    const b = getMissMarginLabel({ kind: "late", fraction: 0.039 });
    expect(a).toBe(b);
    // Labels and headlines never share a cache entry.
    expect(getMissMarginHeadline({ kind: "late", fraction: 0.04 })).not.toBe(a);
  });

  it("announces a miss with its margin when known", () => {
    expect(getMissAnnouncement({ kind: "late", fraction: 0.04 })).toBe(
      `Miss. Too late by 4${NBSP}%`,
    );
    expect(getMissAnnouncement(null)).toBe("Miss");
  });
});
