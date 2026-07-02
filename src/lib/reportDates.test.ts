import { describe, it, expect } from "vitest";
import { calcStreak, estimateAccuracy } from "./reportDates";

// "today" is always injected — these tests never depend on the real clock
const today = new Date(2026, 6, 1); // July 1, 2026 (local)

describe("calcStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(calcStreak(["2026-06-29", "2026-06-30", "2026-07-01"], today)).toBe(3);
  });

  it("keeps the streak alive when the last session was yesterday", () => {
    expect(calcStreak(["2026-06-29", "2026-06-30"], today)).toBe(2);
  });

  it("returns 0 when the last session is older than yesterday", () => {
    expect(calcStreak(["2026-06-27", "2026-06-28"], today)).toBe(0);
  });

  it("stops counting at the first gap", () => {
    expect(calcStreak(["2026-06-26", "2026-06-27", "2026-06-30", "2026-07-01"], today)).toBe(2);
  });

  it("counts across a month boundary", () => {
    expect(calcStreak(["2026-06-30", "2026-07-01"], today)).toBe(2);
  });

  it("ignores duplicate day entries", () => {
    expect(calcStreak(["2026-07-01", "2026-07-01", "2026-06-30"], today)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(calcStreak([], today)).toBe(0);
  });
});

describe("estimateAccuracy", () => {
  it("is 100% for a perfect estimate", () => {
    expect(estimateAccuracy([{ estimatedMinutes: 25, actualMinutes: 25 }])).toBe(100);
  });

  it("penalizes over- and under-estimating symmetrically and never exceeds 100%", () => {
    // est 30 real 60 → 50%; est 60 real 30 → 50%
    expect(estimateAccuracy([{ estimatedMinutes: 30, actualMinutes: 60 }])).toBe(50);
    expect(estimateAccuracy([{ estimatedMinutes: 60, actualMinutes: 30 }])).toBe(50);
  });

  it("averages across tasks and stays bounded despite extreme outliers", () => {
    const result = estimateAccuracy([
      { estimatedMinutes: 25, actualMinutes: 25 },  // 100%
      { estimatedMinutes: 60, actualMinutes: 1 },   // extreme outlier → ~1.7%, not 6000%
    ]);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
    expect(result!).toBeLessThanOrEqual(100);
    expect(result!).toBeCloseTo((100 + (1 / 60) * 100) / 2, 1);
  });

  it("ignores tasks without an estimate or without recorded time, and returns null when none qualify", () => {
    expect(
      estimateAccuracy([
        { estimatedMinutes: null, actualMinutes: 50 },
        { estimatedMinutes: 30, actualMinutes: 0 },
      ])
    ).toBeNull();
    expect(estimateAccuracy([])).toBeNull();
  });
});
