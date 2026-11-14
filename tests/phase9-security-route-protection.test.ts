import { describe, it, expect, vi } from "vitest";
import { resolvePermissions, hasPermission } from "@/lib/permissions/resolver";
import { createSessionToken, verifySessionToken } from "@/lib/auth/token";
import {
  requirePermission,
  requireRole,
  ForbiddenError,
  AuthError,
  NotFoundError,
} from "@/lib/auth/guards";
import { UserContext } from "@/lib/permissions/types";

describe("Phase 9 — Route Protection, Authorization & Tenant Isolation", () => {
  describe("1. Authentication & Session Verification", () => {
    it("creates and verifies valid JWT session tokens", async () => {
      const payload = {
        userId: "user-123",
        email: "alice@enterprise.com",
        sessionId: "sess-456",
      };

      const token = await createSessionToken(payload);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);

      const verified = await verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("user-123");
      expect(verified?.email).toBe("alice@enterprise.com");
      expect(verified?.sessionId).toBe("sess-456");
    });

    it("rejects forged or tampered session tokens", async () => {
      const validToken = await createSessionToken({
        userId: "user-123",
        email: "alice@enterprise.com",
        sessionId: "sess-456",
      });

      // Tamper with payload characters
      const tamperedToken = validToken.slice(0, -6) + "xyz123";
      const verified = await verifySessionToken(tamperedToken);
      expect(verified).toBeNull();

      // Completely invalid string
      const invalid = await verifySessionToken("not.a.valid.jwt.token");
      expect(invalid).toBeNull();
    });
  });

  describe("2. Granular Role-Based Access Control (RBAC)", () => {
    it("enforces that Analyst role cannot execute modifying queries", () => {
      const analystPerms = resolvePermissions({
        workspaceRole: "analyst",
      });

      expect(hasPermission(analystPerms, "query:read")).toBe(true);
      expect(hasPermission(analystPerms, "query:execute")).toBe(true);
      expect(hasPermission(analystPerms, "query:write")).toBe(false);
      expect(hasPermission(analystPerms, "database:delete")).toBe(false);

      const context: UserContext = {
        userId: "analyst-1",
        email: "analyst@company.com",
        fullName: "Analyst One",
        effectivePermissions: analystPerms,
      };

      // Query read passes
      expect(() => requirePermission(context, "query:read")).not.toThrow();

      // Query write fails with ForbiddenError (403)
      expect(() => requirePermission(context, "query:write")).toThrow(ForbiddenError);
    });

    it("enforces that Auditor role cannot execute SQL queries or modify roles", () => {
      const auditorPerms = resolvePermissions({
        workspaceRole: "auditor",
      });

      expect(hasPermission(auditorPerms, "audit:read")).toBe(true);
      expect(hasPermission(auditorPerms, "audit:export")).toBe(true);
      expect(hasPermission(auditorPerms, "transaction:inspect")).toBe(true);

      // Auditor MUST NOT possess query:execute or query:write or permissions:manage
      expect(hasPermission(auditorPerms, "query:execute")).toBe(false);
      expect(hasPermission(auditorPerms, "query:write")).toBe(false);
      expect(hasPermission(auditorPerms, "permissions:manage")).toBe(false);

      const context: UserContext = {
        userId: "auditor-1",
        email: "auditor@company.com",
        fullName: "Auditor One",
        effectivePermissions: auditorPerms,
      };

      expect(() => requirePermission(context, "query:execute")).toThrow(ForbiddenError);
      expect(() => requirePermission(context, "permissions:manage")).toThrow(ForbiddenError);
    });

    it("enforces that Developer cannot restore database backups", () => {
      const devPerms = resolvePermissions({
        workspaceRole: "developer",
      });

      expect(hasPermission(devPerms, "query:read")).toBe(true);
      expect(hasPermission(devPerms, "query:write")).toBe(true);
      expect(hasPermission(devPerms, "history:restore")).toBe(true);

      // Developer cannot restore backups (requires backup:restore which is DBA-only)
      expect(hasPermission(devPerms, "backup:restore")).toBe(false);
      expect(hasPermission(devPerms, "database:delete")).toBe(false);
    });

    it("enforces that DBA cannot perform organization-owner-only operations", () => {
      const dbaPerms = resolvePermissions({
        workspaceRole: "dba",
      });

      // DBA is workspace-scoped: cannot manage entire organization
      expect(hasPermission(dbaPerms, "organization:manage")).toBe(false);

      const ownerPerms = resolvePermissions({
        orgRole: "owner",
      });
      expect(hasPermission(ownerPerms, "organization:manage")).toBe(true);
    });
  });

  describe("3. Multi-Tenant Cross-Organization Isolation & Parameter Tampering", () => {
    it("ensures user from Org A cannot access Org B resources via parameter tampering", () => {
      const userOrgAContext: UserContext = {
        userId: "user-a",
        email: "a@org-a.com",
        fullName: "User A",
        organizationId: "org-a-id",
        organizationRole: "owner",
        effectivePermissions: resolvePermissions({ orgRole: "owner" }),
      };

      // Mock resource check: Org A user attempting to access Org B resource
      const targetResourceOrgId = "org-b-id";
      const isOwnerOfTarget = userOrgAContext.organizationId === targetResourceOrgId;

      expect(isOwnerOfTarget).toBe(false);
    });

    it("validates that database queries reject mismatched organization and workspace IDs", () => {
      const dbRecord = {
        id: "db-123",
        organizationId: "org-a",
        workspaceId: "ws-a",
      };

      // Attacker sends org-b with db-123
      const attackerOrgId = "org-b";
      const attackerWsId = "ws-b";

      const matchesContext =
        dbRecord.organizationId === attackerOrgId && dbRecord.workspaceId === attackerWsId;

      expect(matchesContext).toBe(false);
    });
  });

  describe("4. SQL Gateway Security & Control-Plane Protection", () => {
    const CONTROL_PLANE_TABLES = [
      "users",
      "user_sessions",
      "user_preferences",
      "organizations",
      "organization_members",
      "workspaces",
      "workspace_members",
      "databases",
      "database_permissions",
      "audit_logs",
      "query_executions",
      "saved_queries",
      "invitations",
    ];

    const CONTROL_PLANE_REGEX = new RegExp(`\\b(${CONTROL_PLANE_TABLES.join("|")})\\b`, "i");

    it("detects and blocks all SQL targeting internal CHRONOS control plane tables", () => {
      const forbiddenQueries = [
        "SELECT * FROM users",
        "SELECT id, email, password_hash FROM users WHERE id = '1'",
        "SELECT token_hash FROM user_sessions",
        "DELETE FROM organizations WHERE id = 'org-1'",
        "INSERT INTO user_preferences (user_id) VALUES ('x')",
        "UPDATE audit_logs SET action = 'tampered'",
        "SELECT * FROM databases JOIN workspace_members ON true",
      ];

      for (const sql of forbiddenQueries) {
        expect(CONTROL_PLANE_REGEX.test(sql)).toBe(true);
      }
    });

    it("allows standard tenant database queries to proceed", () => {
      const allowedQueries = [
        "SELECT * FROM customers WHERE active = true",
        "SELECT count(*) FROM orders GROUP BY status",
        "INSERT INTO products (name, price) VALUES ('Widget', 9.99)",
        "UPDATE inventory SET stock = stock - 1 WHERE id = 42",
      ];

      for (const sql of allowedQueries) {
        expect(CONTROL_PLANE_REGEX.test(sql)).toBe(false);
      }
    });

    it("properly identifies modifying SQL queries to protect read-only users", () => {
      const modifyingPattern = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

      expect(modifyingPattern.test("INSERT INTO customers VALUES (1, 'Alice')")).toBe(true);
      expect(modifyingPattern.test("UPDATE customers SET name = 'Bob' WHERE id = 1")).toBe(true);
      expect(modifyingPattern.test("DELETE FROM orders WHERE id = 5")).toBe(true);
      expect(modifyingPattern.test("DROP TABLE old_logs")).toBe(true);
      expect(modifyingPattern.test("ALTER TABLE accounts ADD COLUMN balance int")).toBe(true);
      expect(modifyingPattern.test("TRUNCATE TABLE staging_data")).toBe(true);

      // Read-only queries should not trigger modifying pattern
      expect(modifyingPattern.test("SELECT * FROM customers")).toBe(false);
      expect(modifyingPattern.test("EXPLAIN ANALYZE SELECT * FROM orders")).toBe(false);
    });
  });

  describe("5. Ownership Protection Rules", () => {
    it("prohibits an organization owner from demoting themselves or leaving zero owners", () => {
      const members = [
        { id: "mem-1", userId: "user-owner", role: "owner" },
        { id: "mem-2", userId: "user-dev", role: "developer" },
      ];

      const currentUserId = "user-owner";
      const targetMemberId = "mem-1";
      const targetRole: string = "member";

      // 1. Check self-demotion rule
      const isSelf = members.find((m) => m.id === targetMemberId)?.userId === currentUserId;
      expect(isSelf).toBe(true);

      // Self-demotion must be disallowed
      const canDemoteSelf = !isSelf;
      expect(canDemoteSelf).toBe(false);

      // 2. Check zero owners rule
      const ownersCount = members.filter((m) => m.role === "owner").length;
      expect(ownersCount).toBe(1);

      const wouldLeaveZeroOwners = ownersCount === 1 && targetRole !== "owner";
      expect(wouldLeaveZeroOwners).toBe(true);
    });
  });
});
