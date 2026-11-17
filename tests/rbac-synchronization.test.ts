import { describe, it, expect } from "vitest";
import {
  CHRONOS_ROLES,
  CHRONOS_ROLE_KEYS,
  ChronosRole,
  canAssignRole,
  getAssignableRoles,
  normalizeRole,
  ROLE_HIERARCHY,
} from "@/lib/permissions/roles";
import {
  ROLE_PERMISSIONS,
  resolvePermissions,
  hasPermission,
  getPermissionsMatrix,
} from "@/lib/permissions/resolver";
import { inviteMemberSchema, transferOwnershipSchema } from "@/lib/validation";

describe("RBAC Synchronization & Single Role System", () => {
  describe("1. Authoritative CHRONOS Roles Registry", () => {
    it("defines exactly six primary CHRONOS roles", () => {
      expect(CHRONOS_ROLE_KEYS).toHaveLength(6);
      expect(CHRONOS_ROLE_KEYS).toEqual([
        "owner",
        "dba",
        "database_engineer",
        "developer",
        "data_analyst",
        "auditor",
      ]);
    });

    it("has metadata for all six roles", () => {
      for (const role of CHRONOS_ROLE_KEYS) {
        const def = CHRONOS_ROLES[role];
        expect(def).toBeDefined();
        expect(def.label).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.hierarchy).toBeGreaterThan(0);
      }
    });

    it("normalizes legacy roles correctly", () => {
      expect(normalizeRole("owner")).toBe("owner");
      expect(normalizeRole("dba")).toBe("dba");
      expect(normalizeRole("developer")).toBe("developer");
      expect(normalizeRole("analyst")).toBe("data_analyst");
      expect(normalizeRole("data_analyst")).toBe("data_analyst");
      expect(normalizeRole("engineer")).toBe("database_engineer");
      expect(normalizeRole("database_engineer")).toBe("database_engineer");
      expect(normalizeRole("auditor")).toBe("auditor");
      // Legacy org roles
      expect(normalizeRole("admin")).toBe("dba");
      expect(normalizeRole("member")).toBe("developer");
      // Case insensitive
      expect(normalizeRole("DATA_ANALYST")).toBe("data_analyst");
      expect(normalizeRole("DBA")).toBe("dba");
    });
  });

  describe("2. Role Hierarchy & Assignment Rules (canAssignRole)", () => {
    it("allows Owner to assign/invite any role including other Owners", () => {
      for (const role of CHRONOS_ROLE_KEYS) {
        expect(canAssignRole("owner", role)).toBe(true);
      }
    });

    it("prevents any non-owner from assigning or inviting the Owner role", () => {
      expect(canAssignRole("dba", "owner")).toBe(false);
      expect(canAssignRole("database_engineer", "owner")).toBe(false);
      expect(canAssignRole("developer", "owner")).toBe(false);
      expect(canAssignRole("data_analyst", "owner")).toBe(false);
      expect(canAssignRole("auditor", "owner")).toBe(false);
    });

    it("enforces strict hierarchy: actor cannot assign roles above their level", () => {
      // DBA (level 80) can assign DB Engineer (70), Developer (60), Analyst (50), Auditor (40)
      expect(canAssignRole("dba", "database_engineer")).toBe(true);
      expect(canAssignRole("dba", "developer")).toBe(true);
      expect(canAssignRole("dba", "data_analyst")).toBe(true);
      expect(canAssignRole("dba", "auditor")).toBe(true);
      expect(canAssignRole("dba", "owner")).toBe(false);

      // Developer (level 60) cannot assign DBA (80) or DB Engineer (70)
      expect(canAssignRole("developer", "dba")).toBe(false);
      expect(canAssignRole("developer", "database_engineer")).toBe(false);
      expect(canAssignRole("developer", "developer")).toBe(true);
      expect(canAssignRole("developer", "data_analyst")).toBe(true);

      // Auditor (level 40) cannot assign Developer (60)
      expect(canAssignRole("auditor", "developer")).toBe(false);
      expect(canAssignRole("auditor", "auditor")).toBe(true);
    });

    it("getAssignableRoles correctly filters options based on authority", () => {
      const ownerAssignableNoOwner = getAssignableRoles("owner", { allowOwner: false });
      expect(ownerAssignableNoOwner).not.toContain("owner");
      expect(ownerAssignableNoOwner).toContain("dba");
      expect(ownerAssignableNoOwner).toContain("developer");

      const ownerAssignableWithOwner = getAssignableRoles("owner", { allowOwner: true });
      expect(ownerAssignableWithOwner).toContain("owner");

      const dbaAssignable = getAssignableRoles("dba");
      expect(dbaAssignable).not.toContain("owner");
      expect(dbaAssignable).toContain("dba");
      expect(dbaAssignable).toContain("developer");
    });
  });

  describe("3. Permission Separation: Organization vs Database", () => {
    it("ensures Owner has organization administration but database query writes are grant-governed", () => {
      const ownerPerms = resolvePermissions({ orgRole: "owner" });
      expect(hasPermission(ownerPerms, "organization:manage")).toBe(true);
      expect(hasPermission(ownerPerms, "members:invite")).toBe(true);
      expect(hasPermission(ownerPerms, "members:manage")).toBe(true);
      expect(hasPermission(ownerPerms, "workspace:manage")).toBe(true);
    });

    it("ensures DBA has database administration but NO organization management", () => {
      const dbaPerms = resolvePermissions({ orgRole: "dba" });
      expect(hasPermission(dbaPerms, "organization:manage")).toBe(false);
      expect(hasPermission(dbaPerms, "database:manage")).toBe(true);
      expect(hasPermission(dbaPerms, "schema:write")).toBe(true);
      expect(hasPermission(dbaPerms, "history:restore")).toBe(true);
      expect(hasPermission(dbaPerms, "backup:create")).toBe(true);
    });

    it("ensures Developer has query/write access but NO schema:write or backup:create", () => {
      const devPerms = resolvePermissions({ orgRole: "developer" });
      expect(hasPermission(devPerms, "organization:manage")).toBe(false);
      expect(hasPermission(devPerms, "query:read")).toBe(true);
      expect(hasPermission(devPerms, "query:write")).toBe(true);
      expect(hasPermission(devPerms, "schema:write")).toBe(false);
      expect(hasPermission(devPerms, "backup:create")).toBe(false);
      expect(hasPermission(devPerms, "performance:inspect")).toBe(false);
    });

    it("ensures Data Analyst has read-only query access and STRICTLY NO writes or schema changes", () => {
      const analystPerms = resolvePermissions({ orgRole: "data_analyst" });
      expect(hasPermission(analystPerms, "query:read")).toBe(true);
      expect(hasPermission(analystPerms, "query:write")).toBe(false);
      expect(hasPermission(analystPerms, "schema:write")).toBe(false);
      expect(hasPermission(analystPerms, "history:restore")).toBe(false);
      expect(hasPermission(analystPerms, "organization:manage")).toBe(false);
    });

    it("ensures Database Engineer has diagnostics (EXPLAIN ANALYZE) and transaction inspection but NO DDL write", () => {
      const engPerms = resolvePermissions({ orgRole: "database_engineer" });
      expect(hasPermission(engPerms, "performance:inspect")).toBe(true);
      expect(hasPermission(engPerms, "transaction:inspect")).toBe(true);
      expect(hasPermission(engPerms, "query:read")).toBe(true);
      expect(hasPermission(engPerms, "schema:write")).toBe(false);
      expect(hasPermission(engPerms, "organization:manage")).toBe(false);
    });

    it("ensures Auditor has read-only audit log inspection and export and NO data modification", () => {
      const auditPerms = resolvePermissions({ orgRole: "auditor" });
      expect(hasPermission(auditPerms, "audit:read")).toBe(true);
      expect(hasPermission(auditPerms, "audit:export")).toBe(true);
      expect(hasPermission(auditPerms, "query:write")).toBe(false);
      expect(hasPermission(auditPerms, "schema:write")).toBe(false);
      expect(hasPermission(auditPerms, "organization:manage")).toBe(false);
    });
  });

  describe("4. Dynamic Roles & Permissions Matrix Generator", () => {
    it("generates matrix rows matching authoritative permissions without hardcoding", () => {
      const matrix = getPermissionsMatrix();
      expect(matrix.length).toBeGreaterThan(10);

      // Inspect schema:write row
      const schemaWriteRow = matrix.find((r) => r.permission === "schema:write");
      expect(schemaWriteRow).toBeDefined();
      expect(schemaWriteRow?.roles.dba.state).toBe("allowed");
      expect(schemaWriteRow?.roles.developer.state).toBe("denied");
      expect(schemaWriteRow?.roles.data_analyst.state).toBe("denied");
      expect(schemaWriteRow?.roles.data_analyst.label).toBe("STRICT NO");
      expect(schemaWriteRow?.roles.auditor.label).toBe("STRICT NO");

      // Inspect query:write row
      const queryWriteRow = matrix.find((r) => r.permission === "query:write");
      expect(queryWriteRow).toBeDefined();
      expect(queryWriteRow?.roles.developer.state).toBe("allowed");
      expect(queryWriteRow?.roles.data_analyst.state).toBe("denied");
      expect(queryWriteRow?.roles.data_analyst.label).toBe("STRICT NO");

      // Inspect performance:inspect row
      const perfRow = matrix.find((r) => r.permission === "performance:inspect");
      expect(perfRow).toBeDefined();
      expect(perfRow?.roles.dba.state).toBe("allowed");
      expect(perfRow?.roles.database_engineer.state).toBe("allowed");
      expect(perfRow?.roles.developer.state).toBe("denied");
    });
  });

  describe("5. Validation Schemas Synchronization", () => {
    it("accepts all six CHRONOS roles in inviteMemberSchema", () => {
      for (const role of CHRONOS_ROLE_KEYS) {
        const result = inviteMemberSchema.safeParse({
          email: "colleague@acme.com",
          role,
        });
        expect(result.success).toBe(true);
      }
    });

    it("accepts all non-owner CHRONOS roles in transferOwnershipSchema", () => {
      const roles: ChronosRole[] = [
        "dba",
        "database_engineer",
        "developer",
        "data_analyst",
        "auditor",
      ];
      for (const role of roles) {
        const result = transferOwnershipSchema.safeParse({
          newOwnerMemberId: "a1cc2994-09b1-458c-a7a8-130bcb8e8785",
          confirmationPhrase: "TRANSFER_OWNERSHIP",
          previousOwnerNewRole: role,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});
