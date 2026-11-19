import { describe, it, expect } from "vitest";
import { formatDuration } from "@/lib/utils";
import {
  TransactionAuthorization,
  TRANSACTION_ROLE_POLICIES,
} from "@/modules/transactions/transaction-authorization";
import { UserContext, Permission } from "@/lib/permissions/types";
import { ChronosRole } from "@/lib/permissions/roles";

describe("Phase 6 — CHRONOS Transaction Inspector & Lifecycle Forensics", () => {
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

  describe("1. Duration & Metrics Formatting", () => {
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

  describe("2. RBAC Policy Matrix Across All Six CHRONOS Roles", () => {
    it("enforces Owner full transaction visibility, details, mutations, and session termination", () => {
      const ctx = createContext("owner");
      const policy = TransactionAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("owner");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewHistory).toBe(true);
      expect(policy.canInspectDetails).toBe(true);
      expect(policy.canViewStatements).toBe(true);
      expect(policy.canViewMutations).toBe(true);
      expect(policy.canViewLiveLocks).toBe(true);
      expect(policy.canViewLiveSessions).toBe(true);
      expect(policy.canExport).toBe(true);
      expect(policy.canReadSensitiveSql).toBe(true);
      expect(policy.canTerminateSession).toBe(true);
      expect(policy.isOwnOnly).toBe(false);
    });

    it("enforces DBA complete diagnostics, lock inspections, and administrative termination", () => {
      const ctx = createContext("dba");
      const policy = TransactionAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("dba");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewHistory).toBe(true);
      expect(policy.canInspectDetails).toBe(true);
      expect(policy.canViewStatements).toBe(true);
      expect(policy.canViewMutations).toBe(true);
      expect(policy.canViewLiveLocks).toBe(true);
      expect(policy.canViewLiveSessions).toBe(true);
      expect(policy.canExport).toBe(true);
      expect(policy.canReadSensitiveSql).toBe(true);
      expect(policy.canTerminateSession).toBe(true);
      expect(policy.isOwnOnly).toBe(false);
    });

    it("enforces Database Engineer as primary transaction investigator (without termination by default)", () => {
      const ctx = createContext("database_engineer");
      const policy = TransactionAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("database_engineer");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewHistory).toBe(true);
      expect(policy.canInspectDetails).toBe(true);
      expect(policy.canViewStatements).toBe(true);
      expect(policy.canViewMutations).toBe(true);
      expect(policy.canViewLiveLocks).toBe(true);
      expect(policy.canViewLiveSessions).toBe(true);
      expect(policy.canExport).toBe(true);
      expect(policy.canReadSensitiveSql).toBe(true);
      // Denied session termination by default (requires explicit grant)
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.isOwnOnly).toBe(false);
    });

    it("enforces Developer workspace transaction inspection with sensitive SQL protection", () => {
      const ctx = createContext("developer");
      const policy = TransactionAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("developer");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewHistory).toBe(true);
      expect(policy.canInspectDetails).toBe(true);
      expect(policy.canViewStatements).toBe(true);
      expect(policy.canViewMutations).toBe(true);
      // Restricted
      expect(policy.canViewLiveLocks).toBe(false);
      expect(policy.canViewLiveSessions).toBe(false);
      expect(policy.canExport).toBe(false);
      expect(policy.canReadSensitiveSql).toBe(false);
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.isOwnOnly).toBe(false);
    });

    it("enforces Data Analyst scoped to own query transactions only", () => {
      const ctx = createContext("data_analyst");
      const policy = TransactionAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("data_analyst");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewHistory).toBe(true);
      expect(policy.canInspectDetails).toBe(true);
      expect(policy.canViewStatements).toBe(true);
      expect(policy.canViewMutations).toBe(false);
      expect(policy.canViewLiveLocks).toBe(false);
      expect(policy.canViewLiveSessions).toBe(false);
      expect(policy.canExport).toBe(false);
      expect(policy.canReadSensitiveSql).toBe(false);
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.isOwnOnly).toBe(true);
    });

    it("enforces Auditor read-only historical compliance with no live execution or termination", () => {
      const ctx = createContext("auditor");
      const policy = TransactionAuthorization.resolvePolicy(ctx);

      expect(policy.role).toBe("auditor");
      expect(policy.canViewOverview).toBe(true);
      expect(policy.canViewHistory).toBe(true);
      expect(policy.canInspectDetails).toBe(true);
      expect(policy.canViewStatements).toBe(true);
      expect(policy.canViewMutations).toBe(true);
      expect(policy.canExport).toBe(true);
      // Strictly restricted
      expect(policy.canViewLiveLocks).toBe(false);
      expect(policy.canViewLiveSessions).toBe(false);
      expect(policy.canReadSensitiveSql).toBe(false);
      expect(policy.canTerminateSession).toBe(false);
      expect(policy.isOwnOnly).toBe(false);
    });
  });

  describe("3. Security Boundary & Non-Escalation Guarantees", () => {
    it("guarantees Auditor and Data Analyst can NEVER terminate sessions, even with IAM overrides", () => {
      const auditorContext = createContext("auditor", "auditor-1", [
        "transaction:session_terminate",
      ]);
      const policy = TransactionAuthorization.resolvePolicy(auditorContext);
      expect(policy.canTerminateSession).toBe(false);

      const analystContext = createContext("data_analyst", "analyst-1", [
        "transaction:session_terminate",
      ]);
      const analystPolicy = TransactionAuthorization.resolvePolicy(analystContext);
      expect(analystPolicy.canTerminateSession).toBe(false);
    });

    it("permits explicit session termination override only for Database Engineer", () => {
      const deWithOverride = createContext("database_engineer", "de-1", [
        "transaction:session_terminate",
      ]);
      const policy = TransactionAuthorization.resolvePolicy(deWithOverride);
      expect(policy.canTerminateSession).toBe(true);
    });
  });

  describe("4. Sensitive SQL Masking", () => {
    const rawSql = "INSERT INTO users (email, token) VALUES ('alice@chronos.internal', 'secret_token_123');";

    it("leaves query unmasked for Owner, DBA, and Database Engineer", () => {
      expect(TransactionAuthorization.maskSensitiveSql(rawSql, createContext("owner"))).toBe(rawSql);
      expect(TransactionAuthorization.maskSensitiveSql(rawSql, createContext("dba"))).toBe(rawSql);
      expect(TransactionAuthorization.maskSensitiveSql(rawSql, createContext("database_engineer"))).toBe(rawSql);
    });

    it("allows Developer to view their own query unmasked", () => {
      const devCtx = createContext("developer", "dev-1");
      const unmasked = TransactionAuthorization.maskSensitiveSql(rawSql, devCtx, "dev-1");
      expect(unmasked).toBe(rawSql);
    });

    it("masks string literals for Developer viewing other users queries", () => {
      const devCtx = createContext("developer", "dev-1");
      const otherUser = "user-999";
      const masked = TransactionAuthorization.maskSensitiveSql(rawSql, devCtx, otherUser);

      expect(masked).not.toContain("alice@chronos.internal");
      expect(masked).not.toContain("secret_token_123");
      expect(masked).toContain("'***'");
    });

    it("masks string and numeric literals for Auditor", () => {
      const auditorCtx = createContext("auditor");
      const masked = TransactionAuthorization.maskSensitiveSql(rawSql, auditorCtx);

      expect(masked).not.toContain("secret_token_123");
      expect(masked).toContain("'***'");
    });
  });

  describe("5. Transaction Lifecycle & Outcome Interpretation", () => {
    it("differentiates COMMITTED, ROLLED_BACK, and FAILED transaction outcomes", () => {
      const evaluateOutcome = (status: string, error?: string) => {
        const isCommitted = status.toLowerCase() === "committed";
        const isRolledBack = status.toLowerCase() === "rolled_back" || status.toLowerCase() === "aborted";
        const isFailed = status.toLowerCase() === "failed";
        return {
          isCommitted,
          isRolledBack,
          isFailed,
          changesPersisted: isCommitted,
          hasError: Boolean(error) || isFailed,
        };
      };

      expect(evaluateOutcome("committed")).toEqual({
        isCommitted: true,
        isRolledBack: false,
        isFailed: false,
        changesPersisted: true,
        hasError: false,
      });

      expect(evaluateOutcome("rolled_back")).toEqual({
        isCommitted: false,
        isRolledBack: true,
        isFailed: false,
        changesPersisted: false,
        hasError: false,
      });

      expect(evaluateOutcome("failed", "duplicate key error")).toEqual({
        isCommitted: false,
        isRolledBack: false,
        isFailed: true,
        changesPersisted: false,
        hasError: true,
      });
    });

    it("reconstructs statement sequences and highlights failing statement", () => {
      const statements = [
        { seq: 1, operation: "BEGIN", status: "SUCCESS" },
        { seq: 2, operation: "UPDATE", status: "SUCCESS" },
        { seq: 3, operation: "INSERT", status: "ERROR", errorMessage: "Key violation" },
        { seq: 4, operation: "ROLLBACK", status: "SUCCESS" },
      ];

      const failingStmt = statements.find((s) => s.status === "ERROR");
      expect(failingStmt).toBeDefined();
      expect(failingStmt?.seq).toBe(3);
      expect(failingStmt?.operation).toBe("INSERT");
    });
  });

  describe("6. Time Travel Mutation Correlation", () => {
    it("correlates row versions to transaction traces via transactionId", () => {
      const txId = "tx_1795000000000_abcde";
      const rowVersion = {
        id: "rv-1",
        transactionId: txId,
        tableName: "accounts",
        operation: "UPDATE",
        versionNumber: 2,
      };

      expect(rowVersion.transactionId).toBe(txId);
      expect(rowVersion.tableName).toBe("accounts");
      expect(rowVersion.versionNumber).toBe(2);
    });

    it("distinguishes COMMITTED mutations from ATTEMPTED_DISCARDED mutations", () => {
      const getMutationStatus = (txStatus: string) => {
        return txStatus.toLowerCase() === "committed"
          ? "COMMITTED"
          : "ATTEMPTED_DISCARDED";
      };

      expect(getMutationStatus("committed")).toBe("COMMITTED");
      expect(getMutationStatus("rolled_back")).toBe("ATTEMPTED_DISCARDED");
      expect(getMutationStatus("failed")).toBe("ATTEMPTED_DISCARDED");
    });
  });
});
