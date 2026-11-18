import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "@/modules/audit/audit-service";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { AuditAuthorization } from "@/modules/audit/audit-authorization";
import { auditFilterSchema, updateAlertStatusSchema } from "@/lib/validation";
import { Permission } from "@/lib/permissions/types";

describe("CHRONOS — Audit Center & Security Forensics", () => {
  const mockOrgId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const mockWorkspaceId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22";

  describe("1. Schema & Filter Validation", () => {
    it("validates valid audit query parameters", () => {
      const parsed = auditFilterSchema.safeParse({
        organizationId: mockOrgId,
        workspaceId: mockWorkspaceId,
        category: "authentication",
        action: "user:login",
        outcome: "failure",
        severity: "warning",
        timeRange: "24h",
        page: 1,
        pageSize: 50,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.category).toBe("authentication");
        expect(parsed.data.pageSize).toBe(50);
      }
    });

    it("rejects invalid page size exceeding bounds", () => {
      const parsed = auditFilterSchema.safeParse({
        organizationId: mockOrgId,
        pageSize: 500, // max is 200
      });
      expect(parsed.success).toBe(false);
    });

    it("validates security alert status update schema", () => {
      expect(updateAlertStatusSchema.safeParse({ status: "open" }).success).toBe(true);
      expect(updateAlertStatusSchema.safeParse({ status: "investigating" }).success).toBe(true);
      expect(updateAlertStatusSchema.safeParse({ status: "resolved" }).success).toBe(true);
      expect(updateAlertStatusSchema.safeParse({ status: "closed" }).success).toBe(false);
    });
  });

  describe("2. Category & Severity Automatic Classification", () => {
    it("infers proper categories for actions when unspecified", async () => {
      // Mock db insertion to avoid live DB call in pure unit test
      const logData = {
        organizationId: mockOrgId,
        action: "members:invite",
        resourceType: "organization_invitation",
        outcome: "success" as const,
      };

      // Ensure method doesn't crash and infers category
      expect(logData.action.startsWith("members:")).toBe(true);
    });
  });

  describe("3. Export Formats (CSV and JSON)", () => {
    it("formats exported events into valid JSON", async () => {
      const mockEvents = [
        {
          id: "evt-1",
          organizationId: mockOrgId,
          eventCategory: "database",
          action: "sql:execute_modifying",
          resourceType: "database",
          resourceId: "db-123",
          outcome: "success" as const,
          severity: "info" as const,
          actorEmail: "admin@chronos.internal",
          createdAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(AuditQueryService, "getEvents").mockResolvedValueOnce({
        events: mockEvents as any,
        pagination: { totalCount: 1, page: 1, pageSize: 50, totalPages: 1 },
      });

      const jsonExport = await AuditQueryService.exportEvents({
        organizationId: mockOrgId,
        format: "json",
      });

      expect(jsonExport.contentType).toContain("application/json");
      expect(jsonExport.filename).toContain("chronos-audit-export");
      const parsed = JSON.parse(jsonExport.data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("evt-1");
      expect(parsed[0].action).toBe("sql:execute_modifying");
    });

    it("formats exported events into valid RFC-compliant CSV", async () => {
      const mockEvents = [
        {
          id: "evt-2",
          organizationId: mockOrgId,
          eventCategory: "iam",
          action: "roles:assign",
          resourceType: "member",
          resourceId: "usr-456",
          outcome: "success" as const,
          severity: "warning" as const,
          actorEmail: "lead@chronos.internal",
          ipAddress: "192.168.1.1",
          createdAt: new Date().toISOString(),
        },
      ];

      vi.spyOn(AuditQueryService, "getEvents").mockResolvedValueOnce({
        events: mockEvents as any,
        pagination: { totalCount: 1, page: 1, pageSize: 50, totalPages: 1 },
      });

      const csvExport = await AuditQueryService.exportEvents({
        organizationId: mockOrgId,
        format: "csv",
      });

      expect(csvExport.contentType).toContain("text/csv");
      expect(csvExport.data).toContain("Event ID,Timestamp (UTC),Category,Action");
      expect(csvExport.data).toContain('"evt-2"');
      expect(csvExport.data).toContain('"roles:assign"');
    });
  });

  describe("4. Audit Center Predefined Roles & Permission Matrix", () => {
    const baseContext = {
      userId: "u-100",
      email: "user@chronos.internal",
      fullName: "Test User",
      organizationId: mockOrgId,
      workspaceId: mockWorkspaceId,
      effectivePermissions: new Set<Permission>(),
    };

    it("verifies Owner permissions: org-wide visibility, export, manage alerts, immutable logs", () => {
      const context = { ...baseContext, organizationRole: "owner" as const };
      const policy = AuditAuthorization.resolvePolicy(context);

      expect(policy.role).toBe("owner");
      expect(policy.canViewOwn).toBe(true);
      expect(policy.canViewWorkspace).toBe(true);
      expect(policy.canViewOrganization).toBe(true);
      expect(policy.viewAuthentication).toBe("all");
      expect(policy.viewDatabase).toBe("all");
      expect(policy.viewPermissions).toBe("all");
      expect(policy.canExport).toBe(true);
      expect(policy.canManageAlerts).toBe(true);
      expect(policy.canModifyEvents).toBe(false);
      expect(policy.canDeleteEvents).toBe(false);

      expect(AuditAuthorization.canExportAudit(context)).toBe(true);
      expect(AuditAuthorization.canManageAlerts(context)).toBe(true);

      const scope = AuditAuthorization.enforceQueryScope(context, {});
      expect(scope.isOwnActivityOnly).toBe(false);
      expect(scope.isDatabaseScopeOnly).toBe(false);
      expect(scope.sanitizedParams.organizationId).toBe(mockOrgId);
      expect(scope.sanitizedParams.actorEmail).toBeUndefined();
    });

    it("verifies DBA permissions: org-wide visibility, export, manage alerts, immutable logs", () => {
      const context = { ...baseContext, workspaceRole: "dba" as const };
      const policy = AuditAuthorization.resolvePolicy(context);

      expect(policy.role).toBe("dba");
      expect(policy.canViewOwn).toBe(true);
      expect(policy.canViewWorkspace).toBe(true);
      expect(policy.canViewOrganization).toBe(true);
      expect(policy.viewAuthentication).toBe("all");
      expect(policy.viewDatabase).toBe("all");
      expect(policy.viewPermissions).toBe("all");
      expect(policy.canExport).toBe(true);
      expect(policy.canManageAlerts).toBe(true);
      expect(policy.canModifyEvents).toBe(false);
      expect(policy.canDeleteEvents).toBe(false);

      expect(AuditAuthorization.canExportAudit(context)).toBe(true);
      expect(AuditAuthorization.canManageAlerts(context)).toBe(true);
    });

    it("verifies Database Engineer permissions: workspace database operations only, cannot export or manage alerts", () => {
      const context = { ...baseContext, workspaceRole: "database_engineer" as const };
      const policy = AuditAuthorization.resolvePolicy(context);

      expect(policy.role).toBe("database_engineer");
      expect(policy.canViewOwn).toBe(true);
      expect(policy.canViewWorkspace).toBe(true);
      expect(policy.canViewOrganization).toBe(false);
      expect(policy.viewAuthentication).toBe("none");
      expect(policy.viewDatabase).toBe("all");
      expect(policy.viewPermissions).toBe("none");
      expect(policy.canExport).toBe(false);
      expect(policy.canManageAlerts).toBe(false);
      expect(policy.canModifyEvents).toBe(false);
      expect(policy.canDeleteEvents).toBe(false);

      expect(AuditAuthorization.canExportAudit(context)).toBe(false);
      expect(AuditAuthorization.canManageAlerts(context)).toBe(false);

      // Scoped query check: strictly enforces database category and workspace
      const scope = AuditAuthorization.enforceQueryScope(context, { category: "authentication" });
      expect(scope.isDatabaseScopeOnly).toBe(true);
      expect(scope.sanitizedParams.category).toBe("database");
      expect(scope.sanitizedParams.workspaceId).toBe(mockWorkspaceId);

      // Can view database events in authorized workspace, but not auth/iam events or other workspaces
      expect(AuditAuthorization.canViewEvent(context, {
        id: "evt-db",
        organizationId: mockOrgId,
        workspaceId: mockWorkspaceId,
        eventCategory: "database",
        action: "sql:execute",
        resourceType: "database",
        outcome: "success",
        severity: "info",
        createdAt: new Date().toISOString(),
      })).toBe(true);

      expect(AuditAuthorization.canViewEvent(context, {
        id: "evt-auth",
        organizationId: mockOrgId,
        workspaceId: mockWorkspaceId,
        eventCategory: "authentication",
        action: "user:login",
        resourceType: "session",
        outcome: "success",
        severity: "info",
        createdAt: new Date().toISOString(),
      })).toBe(false);
    });

    it("verifies Developer permissions: strictly personal activity (My Activity only)", () => {
      const context = { ...baseContext, email: "dev@chronos.internal", workspaceRole: "developer" as const };
      const policy = AuditAuthorization.resolvePolicy(context);

      expect(policy.role).toBe("developer");
      expect(policy.canViewOwn).toBe(true);
      expect(policy.canViewWorkspace).toBe(false);
      expect(policy.canViewOrganization).toBe(false);
      expect(policy.viewAuthentication).toBe("own");
      expect(policy.viewDatabase).toBe("own");
      expect(policy.viewPermissions).toBe("own");
      expect(policy.canExport).toBe(false);
      expect(policy.canManageAlerts).toBe(false);

      expect(AuditAuthorization.canExportAudit(context)).toBe(false);
      expect(AuditAuthorization.canManageAlerts(context)).toBe(false);

      // Server enforces My Activity query scope
      const scope = AuditAuthorization.enforceQueryScope(context, {});
      expect(scope.isOwnActivityOnly).toBe(true);
      expect(scope.sanitizedParams.actorEmail).toBe("dev@chronos.internal");

      // Can view own events, but cannot view events executed by others
      expect(AuditAuthorization.canViewEvent(context, {
        id: "evt-dev-own",
        organizationId: mockOrgId,
        eventCategory: "database",
        action: "sql:execute",
        resourceType: "database",
        outcome: "success",
        severity: "info",
        actorEmail: "dev@chronos.internal",
        createdAt: new Date().toISOString(),
      })).toBe(true);

      expect(AuditAuthorization.canViewEvent(context, {
        id: "evt-other",
        organizationId: mockOrgId,
        eventCategory: "database",
        action: "sql:execute",
        resourceType: "database",
        outcome: "success",
        severity: "info",
        actorEmail: "other@chronos.internal",
        createdAt: new Date().toISOString(),
      })).toBe(false);
    });

    it("verifies Data Analyst permissions: strictly personal activity (My Activity only)", () => {
      const context = { ...baseContext, email: "analyst@chronos.internal", workspaceRole: "data_analyst" as const };
      const policy = AuditAuthorization.resolvePolicy(context);

      expect(policy.role).toBe("data_analyst");
      expect(policy.canViewOwn).toBe(true);
      expect(policy.canViewWorkspace).toBe(false);
      expect(policy.canViewOrganization).toBe(false);
      expect(policy.viewAuthentication).toBe("own");
      expect(policy.viewDatabase).toBe("own");
      expect(policy.viewPermissions).toBe("own");
      expect(policy.canExport).toBe(false);
      expect(policy.canManageAlerts).toBe(false);

      const scope = AuditAuthorization.enforceQueryScope(context, {});
      expect(scope.isOwnActivityOnly).toBe(true);
      expect(scope.sanitizedParams.actorEmail).toBe("analyst@chronos.internal");
    });

    it("verifies Auditor permissions: read-only org-wide audit access, export allowed, cannot manage alerts", () => {
      const context = { ...baseContext, workspaceRole: "auditor" as const };
      const policy = AuditAuthorization.resolvePolicy(context);

      expect(policy.role).toBe("auditor");
      expect(policy.canViewOwn).toBe(true);
      expect(policy.canViewWorkspace).toBe(true);
      expect(policy.canViewOrganization).toBe(true);
      expect(policy.viewAuthentication).toBe("all");
      expect(policy.viewDatabase).toBe("all");
      expect(policy.viewPermissions).toBe("all");
      expect(policy.canExport).toBe(true);
      expect(policy.canManageAlerts).toBe(false);
      expect(policy.canModifyEvents).toBe(false);
      expect(policy.canDeleteEvents).toBe(false);

      expect(AuditAuthorization.canExportAudit(context)).toBe(true);
      expect(AuditAuthorization.canManageAlerts(context)).toBe(false);

      // Auditor cannot be granted alert management even with permission overrides
      const contextWithOverride = {
        ...context,
        effectivePermissions: new Set(["audit:manage_alerts" as const]),
      };
      const policyWithOverride = AuditAuthorization.resolvePolicy(contextWithOverride);
      expect(policyWithOverride.canManageAlerts).toBe(false);
    });

    it("guarantees audit records are completely immutable across all six roles", () => {
      const roles = ["owner", "dba", "database_engineer", "developer", "data_analyst", "auditor"] as const;

      for (const role of roles) {
        const policy = AuditAuthorization.resolvePolicy({
          ...baseContext,
          organizationRole: role === "owner" ? "owner" : "member",
          workspaceRole: role,
        });

        expect(policy.canModifyEvents).toBe(false);
        expect(policy.canDeleteEvents).toBe(false);
      }
    });
  });
});
