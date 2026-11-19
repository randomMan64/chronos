import { describe, it, expect } from "vitest";
import {
  PerformanceAuthorization,
  PERFORMANCE_ROLE_POLICIES,
} from "@/modules/analytics/performance-authorization";
import { UserContext, Permission } from "@/lib/permissions/types";
import { ChronosRole } from "@/lib/permissions/roles";

describe("CHRONOS Query Analyzer & Diagnostics Module", () => {
  const createContext = (
    role: ChronosRole,
    userId = "user-123",
    effectiveOverrides?: Permission[]
  ): UserContext => {
    return {
      userId,
      email: `${role}@chronos.internal`,
      fullName: `${role} User`,
      organizationId: "org-123",
      organizationRole: role === "owner" ? "owner" : "member",
      workspaceId: "ws-123",
      workspaceRole: role === "owner" ? "owner" : (role as any),
      effectivePermissions: new Set<Permission>(effectiveOverrides || []),
    };
  };

  describe("1. RBAC Policy Matrix across All 6 CHRONOS Roles", () => {
    it("enforces Owner full performance visibility and session termination", () => {
      const ctx = createContext("owner");
      const policy = PerformanceAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("owner");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewQueryStats).toBe(true);
      expect(policy.canInspectQuery).toBe(true);
      expect(policy.canExplain).toBe(true);
      expect(policy.canExplainAnalyze).toBe(true);
      expect(policy.canViewIndexStats).toBe(true);
      expect(policy.canViewTableStats).toBe(true);
      expect(policy.canViewLiveSessions).toBe(true);
      expect(policy.canViewLocks).toBe(true);
      expect(policy.canViewRecommendations).toBe(true);
      expect(policy.canExport).toBe(true);
      expect(policy.canReadSensitiveQuery).toBe(true);
      expect(policy.canTerminateSession).toBe(true);
      expect(policy.isOwnQueryOnly).toBe(false);
    });

    it("enforces DBA diagnostic visibility, maintenance, and session termination", () => {
      const ctx = createContext("dba");
      const policy = PerformanceAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("dba");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewQueryStats).toBe(true);
      expect(policy.canExplainAnalyze).toBe(true);
      expect(policy.canTerminateSession).toBe(true);
      expect(policy.canExecuteMaintenance).toBe(true);
      expect(policy.canExport).toBe(true);
    });

    it("enforces Database Engineer performance investigation without session termination by default", () => {
      const ctx = createContext("database_engineer");
      const policy = PerformanceAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("database_engineer");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewQueryStats).toBe(true);
      expect(policy.canInspectQuery).toBe(true);
      expect(policy.canExplain).toBe(true);
      expect(policy.canExplainAnalyze).toBe(true);
      expect(policy.canViewIndexStats).toBe(true);
      expect(policy.canViewTableStats).toBe(true);
      expect(policy.canViewLiveSessions).toBe(true);
      expect(policy.canViewLocks).toBe(true);
      expect(policy.canViewRecommendations).toBe(true);
      expect(policy.canExport).toBe(true);
      expect(policy.canReadSensitiveQuery).toBe(true);
      // Denied session termination by default
      expect(policy.canTerminateSession).toBe(false);
    });

    it("enforces Developer query and plan inspection with session termination restriction", () => {
      const ctx = createContext("developer");
      const policy = PerformanceAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("developer");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewQueryStats).toBe(true);
      expect(policy.canInspectQuery).toBe(true);
      expect(policy.canExplain).toBe(true);
      expect(policy.canExplainAnalyze).toBe(true);
      expect(policy.canViewIndexStats).toBe(true);
      expect(policy.canViewTableStats).toBe(true);
      expect(policy.canViewRecommendations).toBe(true);
      // Restricted
      expect(policy.canViewLiveSessions).toBe(false);
      expect(policy.canViewLocks).toBe(false);
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.canExport).toBe(false);
      expect(policy.canReadSensitiveQuery).toBe(false);
    });

    it("enforces Data Analyst scoped access to own queries and blocks EXPLAIN ANALYZE and sessions", () => {
      const ctx = createContext("data_analyst");
      const policy = PerformanceAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("data_analyst");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewQueryStats).toBe(true);
      expect(policy.isOwnQueryOnly).toBe(true);
      // Blocked
      expect(policy.canInspectQuery).toBe(false);
      expect(policy.canExplain).toBe(false);
      expect(policy.canExplainAnalyze).toBe(false);
      expect(policy.canViewLiveSessions).toBe(false);
      expect(policy.canViewLocks).toBe(false);
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.canReadSensitiveQuery).toBe(false);
    });

    it("enforces Auditor strictly read-only historical records and blocks execution and termination", () => {
      const ctx = createContext("auditor");
      const policy = PerformanceAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("auditor");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewQueryStats).toBe(true);
      expect(policy.canExport).toBe(true);
      // Strictly read-only: no SQL execution or session interference
      expect(policy.canInspectQuery).toBe(false);
      expect(policy.canExplain).toBe(false);
      expect(policy.canExplainAnalyze).toBe(false);
      expect(policy.canViewIndexStats).toBe(false);
      expect(policy.canViewTableStats).toBe(false);
      expect(policy.canViewLiveSessions).toBe(false);
      expect(policy.canViewLocks).toBe(false);
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.canReadSensitiveQuery).toBe(false);
    });
  });

  describe("2. Security Boundary & Non-Escalation Guarantees", () => {
    it("guarantees Auditor and Data Analyst can NEVER execute EXPLAIN ANALYZE or terminate sessions, even with IAM overrides", () => {
      const auditorContext = createContext("auditor", "auditor-1", [
        "performance:explain_analyze",
        "performance:session_terminate",
      ]);
      const policy = PerformanceAuthorization.resolvePolicy(auditorContext);

      expect(policy.canExplainAnalyze).toBe(false);
      expect(policy.canTerminateSession).toBe(false);

      const analystContext = createContext("data_analyst", "analyst-1", [
        "performance:explain_analyze",
        "performance:session_terminate",
      ]);
      const analystPolicy = PerformanceAuthorization.resolvePolicy(analystContext);

      expect(analystPolicy.canExplainAnalyze).toBe(false);
      expect(analystPolicy.canTerminateSession).toBe(false);
    });

    it("permits explicit session termination override only for Database Engineer", () => {
      const deWithOverride = createContext("database_engineer", "de-1", [
        "performance:session_terminate",
      ]);
      const policy = PerformanceAuthorization.resolvePolicy(deWithOverride);

      expect(policy.canTerminateSession).toBe(true);
    });
  });

  describe("3. Sensitive Query Masking", () => {
    const rawSql = "SELECT * FROM customers WHERE email = 'alice@example.com' AND age > 25;";

    it("leaves query unmasked for Owner, DBA, and Database Engineer", () => {
      expect(
        PerformanceAuthorization.maskSensitiveQuery(rawSql, createContext("owner"))
      ).toBe(rawSql);
      expect(
        PerformanceAuthorization.maskSensitiveQuery(rawSql, createContext("dba"))
      ).toBe(rawSql);
      expect(
        PerformanceAuthorization.maskSensitiveQuery(rawSql, createContext("database_engineer"))
      ).toBe(rawSql);
    });

    it("masks string and numeric literals for Developer viewing other users queries", () => {
      const devCtx = createContext("developer", "dev-1");
      const otherUser = "user-999";
      const masked = PerformanceAuthorization.maskSensitiveQuery(rawSql, devCtx, otherUser);

      expect(masked).toBe("SELECT * FROM customers WHERE email = '***' AND age > ***;");
      expect(masked).not.toContain("alice@example.com");
      expect(masked).not.toContain("25");
    });

    it("allows Developer to view their own query unmasked", () => {
      const devCtx = createContext("developer", "dev-1");
      const masked = PerformanceAuthorization.maskSensitiveQuery(rawSql, devCtx, "dev-1");

      expect(masked).toBe(rawSql);
    });

    it("masks literals for Auditor", () => {
      const auditorCtx = createContext("auditor");
      const masked = PerformanceAuthorization.maskSensitiveQuery(rawSql, auditorCtx);

      expect(masked).toBe("SELECT * FROM customers WHERE email = '***' AND age > ***;");
    });
  });

  describe("4. Action Guard Helpers", () => {
    it("accurately evaluates permission guards", () => {
      const owner = createContext("owner");
      const dev = createContext("developer");
      const analyst = createContext("data_analyst");

      expect(PerformanceAuthorization.canTerminateSession(owner)).toBe(true);
      expect(PerformanceAuthorization.canTerminateSession(dev)).toBe(false);
      expect(PerformanceAuthorization.canTerminateSession(analyst)).toBe(false);

      expect(PerformanceAuthorization.canExplainAnalyze(owner)).toBe(true);
      expect(PerformanceAuthorization.canExplainAnalyze(dev)).toBe(true);
      expect(PerformanceAuthorization.canExplainAnalyze(analyst)).toBe(false);

      expect(PerformanceAuthorization.canViewIndexStats(owner)).toBe(true);
      expect(PerformanceAuthorization.canViewIndexStats(dev)).toBe(true);
      expect(PerformanceAuthorization.canViewIndexStats(analyst)).toBe(true);
    });
  });
});
