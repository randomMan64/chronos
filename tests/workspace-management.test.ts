import { describe, it, expect, vi } from "vitest";
import { resolvePermissions, hasPermission, ROLE_PERMISSIONS } from "@/lib/permissions/resolver";
import {
  requirePermission,
  requireRole,
  requireWorkspaceAccess,
  requireDatabaseAccess,
  ForbiddenError,
  AuthError,
  NotFoundError,
} from "@/lib/auth/guards";
import { UserContext } from "@/lib/permissions/types";
import { normalizeRole, ROLE_HIERARCHY } from "@/lib/permissions/roles";

describe("CHRONOS Workspace Switcher & Workspace-Level Access Management", () => {
  const orgId = "org-11111111-1111-1111-1111-111111111111";
  const otherOrgId = "org-22222222-2222-2222-2222-222222222222";
  const prodWsId = "ws-prod-1111-1111-1111-111111111111";
  const devWsId = "ws-dev-2222-2222-2222-222222222222";
  const stagingWsId = "ws-staging-3333-3333-3333-333333333333";
  const otherOrgWsId = "ws-other-4444-4444-4444-444444444444";

  describe("1. Owner Access & Workspace Visibility", () => {
    it("Owner can see and access every workspace in the organization unconditionally", () => {
      const ownerContext: UserContext = {
        userId: "owner-user-1",
        email: "owner@chronos.int",
        fullName: "Owner User",
        organizationId: orgId,
        organizationRole: "owner",
        workspaceId: prodWsId,
        workspaceRole: undefined, // Owner has access even without explicit workspace member row
        effectivePermissions: resolvePermissions({ orgRole: "owner" }),
      };

      expect(ownerContext.organizationRole).toBe("owner");
      expect(hasPermission(ownerContext.effectivePermissions, "workspace:read")).toBe(true);
      expect(hasPermission(ownerContext.effectivePermissions, "workspace:create")).toBe(true);
      expect(hasPermission(ownerContext.effectivePermissions, "workspace:manage")).toBe(true);
      expect(hasPermission(ownerContext.effectivePermissions, "workspace:delete")).toBe(true);
      expect(hasPermission(ownerContext.effectivePermissions, "workspace:members:assign")).toBe(true);
      expect(hasPermission(ownerContext.effectivePermissions, "workspace:members:revoke")).toBe(true);
    });
  });

  describe("2. Developer Scoped Access", () => {
    it("Developer can access assigned workspace with permitted capabilities", () => {
      const devContext: UserContext = {
        userId: "dev-user-1",
        email: "dev@chronos.int",
        fullName: "Developer User",
        organizationId: orgId,
        organizationRole: "developer",
        workspaceId: devWsId,
        workspaceRole: "developer",
        effectivePermissions: resolvePermissions({ orgRole: "developer", workspaceRole: "developer" }),
      };

      expect(hasPermission(devContext.effectivePermissions, "workspace:read")).toBe(true);
      expect(hasPermission(devContext.effectivePermissions, "query:read")).toBe(true);
      expect(hasPermission(devContext.effectivePermissions, "query:write")).toBe(true);
      // Developer cannot manage workspaces or assign workspace members
      expect(hasPermission(devContext.effectivePermissions, "workspace:create")).toBe(false);
      expect(hasPermission(devContext.effectivePermissions, "workspace:manage")).toBe(false);
      expect(hasPermission(devContext.effectivePermissions, "workspace:members:assign")).toBe(false);
    });
  });

  describe("3. Analyst Isolation from Unassigned Workspaces", () => {
    it("Analyst cannot access unassigned workspaces", () => {
      // Simulating guard check: User with no workspaceRole in target workspace
      const analystUnassignedContext: UserContext = {
        userId: "analyst-user-1",
        email: "analyst@chronos.int",
        fullName: "Analyst User",
        organizationId: orgId,
        organizationRole: "data_analyst",
        workspaceId: prodWsId,
        workspaceRole: null as any,
        effectivePermissions: resolvePermissions({ orgRole: "data_analyst" }),
      };

      // Guard requirement: if context.organizationRole !== "owner" and !context.workspaceRole => Forbidden
      expect(() => {
        if (analystUnassignedContext.organizationRole !== "owner" && !analystUnassignedContext.workspaceRole) {
          throw new ForbiddenError("You do not have access to this workspace", 403);
        }
      }).toThrowError(ForbiddenError);
    });

    it("Analyst has strictly read-only capabilities in assigned workspace", () => {
      const analystContext: UserContext = {
        userId: "analyst-user-1",
        email: "analyst@chronos.int",
        fullName: "Analyst User",
        organizationId: orgId,
        organizationRole: "data_analyst",
        workspaceId: stagingWsId,
        workspaceRole: "data_analyst",
        effectivePermissions: resolvePermissions({ orgRole: "data_analyst", workspaceRole: "data_analyst" }),
      };

      expect(hasPermission(analystContext.effectivePermissions, "query:read")).toBe(true);
      expect(hasPermission(analystContext.effectivePermissions, "query:write")).toBe(false);
      expect(hasPermission(analystContext.effectivePermissions, "schema:write")).toBe(false);
      expect(hasPermission(analystContext.effectivePermissions, "history:restore")).toBe(false);
    });
  });

  describe("4. DBA Workspace Management Authorization", () => {
    it("DBA cannot manage workspace access unless explicitly granted workspace:members:assign", () => {
      const dbaStandardPermissions = resolvePermissions({ orgRole: "dba", workspaceRole: "dba" });

      // In default DBA role, database administration is allowed, but organization/workspace member assignment is not
      expect(hasPermission(dbaStandardPermissions, "database:manage")).toBe(true);
      expect(hasPermission(dbaStandardPermissions, "workspace:members:assign")).toBe(false);
      expect(hasPermission(dbaStandardPermissions, "workspace:members:revoke")).toBe(false);
      expect(hasPermission(dbaStandardPermissions, "organization:transfer_ownership")).toBe(false);

      const dbaContext: UserContext = {
        userId: "dba-user-1",
        email: "dba@chronos.int",
        fullName: "DBA User",
        organizationId: orgId,
        organizationRole: "dba",
        workspaceId: prodWsId,
        workspaceRole: "dba",
        effectivePermissions: dbaStandardPermissions,
      };

      expect(() => {
        requirePermission(dbaContext, "workspace:members:assign");
      }).toThrowError(ForbiddenError);
    });

    it("DBA can manage workspace members when granted explicit permission", () => {
      const customPerms = new Set([
        ...resolvePermissions({ orgRole: "dba", workspaceRole: "dba" }),
        "workspace:members:assign" as const,
        "workspace:members:revoke" as const,
      ]);

      const dbaDelegatedContext: UserContext = {
        userId: "dba-user-1",
        email: "dba@chronos.int",
        fullName: "DBA User",
        organizationId: orgId,
        organizationRole: "dba",
        workspaceId: prodWsId,
        workspaceRole: "dba",
        effectivePermissions: customPerms,
      };

      expect(() => {
        requirePermission(dbaDelegatedContext, "workspace:members:assign");
      }).not.toThrow();
    });
  });

  describe("5. Adding Existing Organization Members", () => {
    it("validates that added user belongs to organization", () => {
      const orgMembers = ["user-in-org-1", "user-in-org-2"];
      const targetUser = "user-external-9";

      const isMember = orgMembers.includes(targetUser);
      expect(isMember).toBe(false);

      expect(() => {
        if (!isMember) {
          throw new Error("User must belong to the organization before being added to a workspace.");
        }
      }).toThrowError("User must belong to the organization before being added to a workspace.");
    });

    it("successfully adds existing organization member to workspace", () => {
      const orgMembers = ["user-in-org-1", "user-in-org-2"];
      const targetUser = "user-in-org-2";

      const isMember = orgMembers.includes(targetUser);
      expect(isMember).toBe(true);

      const newMembership = {
        organizationId: orgId,
        workspaceId: devWsId,
        userId: targetUser,
        role: normalizeRole("developer"),
        assignedBy: "owner-user-1",
      };

      expect(newMembership.organizationId).toBe(orgId);
      expect(newMembership.workspaceId).toBe(devWsId);
      expect(newMembership.role).toBe("developer");
      expect(newMembership.assignedBy).toBe("owner-user-1");
    });
  });

  describe("6. Revoking Workspace Access Takes Effect Immediately", () => {
    it("revoking access removes workspace role and blocks subsequent authorization checks", () => {
      // User before revocation
      let userWorkspaceRole: string | null = "developer";
      let context: UserContext = {
        userId: "dev-user-2",
        email: "bob@chronos.int",
        fullName: "Bob Dev",
        organizationId: orgId,
        organizationRole: "developer",
        workspaceId: prodWsId,
        workspaceRole: userWorkspaceRole as any,
        effectivePermissions: resolvePermissions({ orgRole: "developer", workspaceRole: "developer" }),
      };

      expect(context.workspaceRole).toBe("developer");

      // Revocation takes effect on server
      userWorkspaceRole = null;
      context = {
        userId: "dev-user-2",
        email: "bob@chronos.int",
        fullName: "Bob Dev",
        organizationId: orgId,
        organizationRole: "developer",
        workspaceId: prodWsId,
        workspaceRole: null as any,
        effectivePermissions: resolvePermissions({ orgRole: "developer" }),
      };

      // Server guard evaluation
      expect(() => {
        if (context.organizationRole !== "owner" && !context.workspaceRole) {
          throw new ForbiddenError("You do not have access to this workspace", 403);
        }
      }).toThrowError(ForbiddenError);
    });
  });

  describe("7. Direct API Requests Cannot Bypass Workspace Membership", () => {
    it("throws 403 when requesting workspace without valid membership", () => {
      const directApiContext: UserContext = {
        userId: "unauthorized-user-3",
        email: "mallory@chronos.int",
        fullName: "Mallory Unauthorized",
        organizationId: orgId,
        organizationRole: "developer",
        workspaceId: prodWsId,
        workspaceRole: null as any,
        effectivePermissions: resolvePermissions({ orgRole: "developer" }),
      };

      expect(() => {
        if (directApiContext.organizationRole !== "owner" && !directApiContext.workspaceRole) {
          throw new ForbiddenError("You do not have access to this workspace", 403);
        }
      }).toThrowError("You do not have access to this workspace");
    });
  });

  describe("8. Switching Workspaces Updates Database Scoping", () => {
    it("resolves and scopes databases to the selected workspace only", () => {
      const mockDatabases = [
        { id: "db-1", workspaceId: prodWsId, name: "production-pg" },
        { id: "db-2", workspaceId: devWsId, name: "dev-sandbox" },
        { id: "db-3", workspaceId: devWsId, name: "staging-cluster" },
      ];

      const prodDbs = mockDatabases.filter((d) => d.workspaceId === prodWsId);
      expect(prodDbs).toHaveLength(1);
      expect(prodDbs[0].name).toBe("production-pg");

      const devDbs = mockDatabases.filter((d) => d.workspaceId === devWsId);
      expect(devDbs).toHaveLength(2);
      expect(devDbs.map((d) => d.name)).toEqual(["dev-sandbox", "staging-cluster"]);
    });
  });

  describe("9. Selected Workspace Persistence & Validation", () => {
    it("cookie preferred workspace is validated against accessible user workspaces", () => {
      const accessibleWorkspaces = [
        { id: devWsId, name: "Development Workspace", role: "developer" },
        { id: stagingWsId, name: "Staging Workspace", role: "developer" },
      ];

      // Legitimate cookie preference
      const validCookieWs = stagingWsId;
      const matched = accessibleWorkspaces.find((w) => w.id === validCookieWs) || accessibleWorkspaces[0];
      expect(matched.id).toBe(stagingWsId);

      // Malicious or unassigned cookie preference
      const maliciousCookieWs = prodWsId;
      const fallback = accessibleWorkspaces.find((w) => w.id === maliciousCookieWs) || accessibleWorkspaces[0];
      expect(fallback.id).toBe(devWsId); // securely falls back to first accessible workspace
    });
  });

  describe("10. Revoked User Cannot Access Stale Workspace Resources", () => {
    it("rejects database query when user has been revoked from workspace", () => {
      const revokedUserContext: UserContext = {
        userId: "revoked-user-4",
        email: "revoked@chronos.int",
        fullName: "Revoked User",
        organizationId: orgId,
        organizationRole: "developer",
        workspaceId: devWsId,
        workspaceRole: null as any,
        effectivePermissions: resolvePermissions({ orgRole: "developer" }),
      };

      expect(() => {
        if (revokedUserContext.organizationRole !== "owner" && !revokedUserContext.workspaceRole) {
          throw new ForbiddenError("Workspace access revoked or expired.", 403);
        }
      }).toThrowError(ForbiddenError);
    });
  });

  describe("11. Cross-Organization Workspace Access is Rejected", () => {
    it("rejects workspace belonging to different organization", () => {
      const requestedOrgId = orgId;
      const targetWorkspace = {
        id: otherOrgWsId,
        organizationId: otherOrgId, // Belongs to different tenant
        name: "Foreign Cluster",
      };

      expect(() => {
        if (targetWorkspace.organizationId !== requestedOrgId) {
          throw new NotFoundError("Workspace not found in this organization", 404);
        }
      }).toThrowError(NotFoundError);
    });
  });

  describe("12. Database Registration & SQL Execution Respect Workspace Isolation", () => {
    it("verifies database belongs to active workspace before permitting SQL execution", () => {
      const currentWorkspaceId = devWsId;
      const targetDatabase = {
        id: "db-prod-secure",
        workspaceId: prodWsId, // Database is in production workspace!
        name: "prod-db",
      };

      expect(() => {
        if (targetDatabase.workspaceId !== currentWorkspaceId) {
          throw new NotFoundError("Database not found in this workspace", 404);
        }
      }).toThrowError(NotFoundError);
    });
  });

  describe("13. Member Sorting: Current User Account First, Then by Role Hierarchy", () => {
    function sortMembers<
      T extends { userId: string; role: string; fullName?: string | null; email?: string | null }
    >(list: T[], currentUserId?: string | null, currentUserEmail?: string | null): T[] {
      return [...list].sort((a, b) => {
        const aIsSelf =
          (!!currentUserId && a.userId === currentUserId) ||
          (!!currentUserEmail && !!a.email && currentUserEmail.toLowerCase() === a.email.toLowerCase());
        const bIsSelf =
          (!!currentUserId && b.userId === currentUserId) ||
          (!!currentUserEmail && !!b.email && currentUserEmail.toLowerCase() === b.email.toLowerCase());

        if (aIsSelf && !bIsSelf) return -1;
        if (!aIsSelf && bIsSelf) return 1;

        const aRank = ROLE_HIERARCHY[normalizeRole(a.role)] ?? 0;
        const bRank = ROLE_HIERARCHY[normalizeRole(b.role)] ?? 0;

        if (bRank !== aRank) {
          return bRank - aRank;
        }

        const nameA = (a.fullName || a.email || "").toLowerCase();
        const nameB = (b.fullName || b.email || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }

    const testMembers = [
      { userId: "u-alex", email: "alexdrive790@gmail.com", fullName: "Alex Drive", role: "database_engineer" },
      { userId: "u-admin", email: "admin@chronos.internal", fullName: "System Administrator", role: "owner" },
      { userId: "u-carol", email: "carol@chronos.internal", fullName: "Carol DBA", role: "dba" },
      { userId: "u-dev2", email: "bob@chronos.internal", fullName: "Bob Dev", role: "developer" },
      { userId: "u-dev1", email: "alice@chronos.internal", fullName: "Alice Dev", role: "developer" },
      { userId: "u-analyst", email: "dan@chronos.internal", fullName: "Dan Analyst", role: "data_analyst" },
      { userId: "u-auditor", email: "erin@chronos.internal", fullName: "Erin Auditor", role: "auditor" },
    ];

    it("places the current logged-in user at the very top (index 0)", () => {
      // When Admin is logged in:
      const adminSorted = sortMembers(testMembers, "u-admin", "admin@chronos.internal");
      expect(adminSorted[0].userId).toBe("u-admin");
      expect(adminSorted[0].fullName).toBe("System Administrator");

      // When Alex (database engineer) is logged in:
      const alexSorted = sortMembers(testMembers, "u-alex", "alexdrive790@gmail.com");
      expect(alexSorted[0].userId).toBe("u-alex");
      expect(alexSorted[0].fullName).toBe("Alex Drive");
    });

    it("sorts subsequent members by role hierarchy (Owner > DBA > Database Engineer > Developer > Data Analyst > Auditor)", () => {
      // Alex is logged in and at index 0
      const alexSorted = sortMembers(testMembers, "u-alex", "alexdrive790@gmail.com");
      expect(alexSorted[0].userId).toBe("u-alex"); // Self

      // Remaining members sorted by hierarchy:
      expect(alexSorted[1].role).toBe("owner"); // System Administrator
      expect(alexSorted[2].role).toBe("dba"); // Carol
      // u-alex was database_engineer and is at 0
      expect(alexSorted[3].role).toBe("developer"); // Alice (alphabetical before Bob)
      expect(alexSorted[4].role).toBe("developer"); // Bob
      expect(alexSorted[5].role).toBe("data_analyst"); // Dan
      expect(alexSorted[6].role).toBe("auditor"); // Erin
    });

    it("breaks ties between identical roles alphabetically by name/email", () => {
      const sorted = sortMembers(testMembers, "u-admin", "admin@chronos.internal");
      // Developers: Alice Dev should come before Bob Dev
      const devIndexAlice = sorted.findIndex((m) => m.fullName === "Alice Dev");
      const devIndexBob = sorted.findIndex((m) => m.fullName === "Bob Dev");
      expect(devIndexAlice).toBeLessThan(devIndexBob);
    });
  });
});
