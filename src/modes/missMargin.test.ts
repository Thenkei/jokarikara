import { describe, expect, it } from "vitest";
import {
  HAIR_FRACTION,
  MAX_MARGIN_PERCENT,
  getClearTenths,
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

  it("rounds fracture waits to tenths, never below 0.1 s", () => {
    expect(getClearTenths(0.01)).toBe(1);
    expect(getClearTenths(0.26)).toBe(3);
    expect(getClearTenths(1.04)).toBe(10);
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
