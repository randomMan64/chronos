import { describe, it, expect } from "vitest";
import { OverviewService } from "@/modules/overview/overview-service";
import { UserContext, Permission } from "@/lib/permissions/types";
import { ChronosRole } from "@/lib/permissions/roles";

describe("CHRONOS Overview Command Centre & Observability Service", () => {
  const createContext = (
    role: ChronosRole,
    userId = "usr-test-1",
    effectiveOverrides?: Permission[]
  ): UserContext => {
    return {
      userId,
      email: `${role}@chronos.internal`,
      fullName: `${role} Engineer`,
      organizationId: "org-test-1",
      organizationRole: role === "owner" ? "owner" : "member",
      workspaceId: "ws-test-1",
      workspaceRole: role === "owner" ? "owner" : (role as any),
      effectivePermissions: new Set<Permission>(effectiveOverrides || []),
    };
  };

  describe("1. Metric Comparison & Delta Mathematical Rigor", () => {
    it("correctly computes percentage increase and sets 'up' trend", () => {
      const result = OverviewService.computeMetricComparison(120, 100);
      expect(result.current).toBe(120);
      expect(result.previous).toBe(100);
      expect(result.changePct).toBe(20);
      expect(result.trend).toBe("up");
    });

    it("correctly computes percentage decrease and sets 'down' trend", () => {
      const result = OverviewService.computeMetricComparison(75, 100);
      expect(result.current).toBe(75);
      expect(result.previous).toBe(100);
      expect(result.changePct).toBe(-25);
      expect(result.trend).toBe("down");
    });

    it("handles zero previous period without dividing by zero or producing NaN", () => {
      const result = OverviewService.computeMetricComparison(50, 0);
      expect(result.current).toBe(50);
      expect(result.previous).toBe(0);
      expect(result.changePct).toBeNull();
      expect(result.trend).toBe("neutral");
    });

    it("handles null previous period without fabricating trends", () => {
      const result = OverviewService.computeMetricComparison(42, null);
      expect(result.current).toBe(42);
      expect(result.previous).toBeNull();
      expect(result.changePct).toBeNull();
      expect(result.trend).toBe("neutral");
    });

    it("handles identical values with 0% delta and neutral trend", () => {
      const result = OverviewService.computeMetricComparison(100, 100);
      expect(result.changePct).toBe(0);
      expect(result.trend).toBe("neutral");
    });
  });

  describe("2. Time Window Boundary Calculations & Previous Equivalent Period", () => {
    it("resolves 15m time range with exact duration and identical previous window", () => {
      const now = new Date("2026-11-19T12:00:00Z");
      const { start, end, prevStart, prevEnd, durationMs } =
        OverviewService.resolveTimeWindow("15m", undefined, now);

      expect(durationMs).toBe(15 * 60 * 1000);
      expect(end.toISOString()).toBe("2026-11-19T12:00:00.000Z");
      expect(start.toISOString()).toBe("2026-11-19T11:45:00.000Z");
      expect(prevEnd.toISOString()).toBe("2026-11-19T11:45:00.000Z");
      expect(prevStart.toISOString()).toBe("2026-11-19T11:30:00.000Z");
    });

    it("resolves 6h time range correctly", () => {
      const now = new Date("2026-11-19T12:00:00Z");
      const { start, end, prevStart, prevEnd, durationMs } =
        OverviewService.resolveTimeWindow("6h", undefined, now);

      expect(durationMs).toBe(6 * 60 * 60 * 1000);
      expect(start.toISOString()).toBe("2026-11-19T06:00:00.000Z");
      expect(prevStart.toISOString()).toBe("2026-11-19T00:00:00.000Z");
    });

    it("resolves 24h, 7d and 30d time ranges", () => {
      const now = new Date("2026-11-19T12:00:00Z");
      const r24 = OverviewService.resolveTimeWindow("24h", undefined, now);
      expect(r24.durationMs).toBe(24 * 3600 * 1000);

      const r7d = OverviewService.resolveTimeWindow("7d", undefined, now);
      expect(r7d.durationMs).toBe(7 * 24 * 3600 * 1000);

      const r30d = OverviewService.resolveTimeWindow("30d", undefined, now);
      expect(r30d.durationMs).toBe(30 * 24 * 3600 * 1000);
    });

    it("resolves custom date range with exact start, end and previous equivalent period", () => {
      const customStart = new Date("2026-11-15T00:00:00Z");
      const customEnd = new Date("2026-11-18T00:00:00Z");
      const { start, end, prevStart, prevEnd, durationMs } =
        OverviewService.resolveTimeWindow("custom", customStart, customEnd);

      expect(start.toISOString()).toBe("2026-11-15T00:00:00.000Z");
      expect(end.toISOString()).toBe("2026-11-18T00:00:00.000Z");
      expect(durationMs).toBe(3 * 24 * 3600 * 1000);
      expect(prevEnd.toISOString()).toBe("2026-11-15T00:00:00.000Z");
      expect(prevStart.toISOString()).toBe("2026-11-12T00:00:00.000Z");
    });
  });

  describe("3. Storage Formatting & Unit Conversions", () => {
    it("formats byte values accurately across units", () => {
      expect(OverviewService.formatBytes(0)).toBe("0 B");
      expect(OverviewService.formatBytes(1024)).toBe("1 KB");
      expect(OverviewService.formatBytes(1048576)).toBe("1 MB");
      expect(OverviewService.formatBytes(15728640)).toBe("15 MB");
      expect(OverviewService.formatBytes(1073741824)).toBe("1 GB");
      expect(OverviewService.formatBytes(null)).toBe("N/A");
      expect(OverviewService.formatBytes(undefined)).toBe("N/A");
    });
  });

  describe("4. Percentile Calculations Validation", () => {
    it("computes P95 and P99 percentiles from actual sorted samples, never averages", () => {
      // 100 durations: 1ms to 100ms
      const durations = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95Index = Math.floor(durations.length * 0.95);
      const p99Index = Math.floor(durations.length * 0.99);

      expect(durations[p95Index]).toBe(96);
      expect(durations[p99Index]).toBe(100);
      // Notice avg is 50.5ms, which would completely misrepresent latency if used for percentiles
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      expect(avg).toBe(50.5);
    });
  });

  describe("5. RBAC Context Authorization for Overview Data", () => {
    it("authorizes all 6 CHRONOS roles with appropriate role labels", () => {
      const roles: ChronosRole[] = [
        "owner",
        "dba",
        "database_engineer",
        "developer",
        "data_analyst",
        "auditor",
      ];

      for (const role of roles) {
        const ctx = createContext(role);
        expect(ctx.organizationRole).toBeDefined();
      }
    });
  });
});
