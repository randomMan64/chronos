import { describe, it, expect } from "vitest";
import { formatDuration } from "@/lib/utils";

describe("Phase 6 — Transactions & Duration Formatting", () => {
  it("formats sub-millisecond, millisecond, and second durations accurately", () => {
    expect(formatDuration(0.5)).toBe("< 1 ms");
    expect(formatDuration(45)).toBe("45 ms");
    expect(formatDuration(1500)).toBe("1.50 s");
    expect(formatDuration(60000)).toBe("60.00 s");
  });

  it("calculates aggregate execution metrics without division by zero", () => {
    const calculateStats = (durations: number[]) => {
      if (durations.length === 0) return { totalCount: 0, avgMs: 0, maxMs: 0 };
      const totalCount = durations.length;
      const sum = durations.reduce((acc, d) => acc + d, 0);
      const avgMs = Math.round(sum / totalCount);
      const maxMs = Math.max(...durations);
      return { totalCount, avgMs, maxMs };
    };

    expect(calculateStats([])).toEqual({ totalCount: 0, avgMs: 0, maxMs: 0 });
    expect(calculateStats([10, 20, 30])).toEqual({ totalCount: 3, avgMs: 20, maxMs: 30 });
    expect(calculateStats([500, 1500])).toEqual({ totalCount: 2, avgMs: 1000, maxMs: 1500 });
  });

  it("identifies slow queries exceeding thresholds", () => {
    const isSlow = (durationMs: number, thresholdMs = 500) => durationMs >= thresholdMs;

    expect(isSlow(12)).toBe(false);
    expect(isSlow(499)).toBe(false);
    expect(isSlow(500)).toBe(true);
    expect(isSlow(1200)).toBe(true);
  });
});

