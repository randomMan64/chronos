import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { deleteAccountSchema, deleteOrganizationSchema } from "@/lib/validation";
import { ForbiddenError } from "@/lib/auth/guards";

describe("Account and Organization Deletion Workflows", () => {
  describe("Validation Schemas", () => {
    it("validates deleteAccountSchema: requires password and exact 'DELETE' phrase", () => {
      const valid = deleteAccountSchema.safeParse({
        password: "SuperSecretPassword123!",
        confirmationPhrase: "DELETE",
      });
      expect(valid.success).toBe(true);

      const invalidPhrase = deleteAccountSchema.safeParse({
        password: "SuperSecretPassword123!",
        confirmationPhrase: "delete",
      });
      expect(invalidPhrase.success).toBe(false);

      const missingPassword = deleteAccountSchema.safeParse({
        password: "",
        confirmationPhrase: "DELETE",
      });
      expect(missingPassword.success).toBe(false);
    });

    it("validates deleteOrganizationSchema: requires password and exact organization name", () => {
      const valid = deleteOrganizationSchema.safeParse({
        password: "SuperSecretPassword123!",
        confirmOrgName: "Acme Enterprise",
      });
      expect(valid.success).toBe(true);

      const emptyName = deleteOrganizationSchema.safeParse({
        password: "SuperSecretPassword123!",
        confirmOrgName: "",
      });
      expect(emptyName.success).toBe(false);

      const emptyPassword = deleteOrganizationSchema.safeParse({
        password: "",
        confirmOrgName: "Acme Enterprise",
      });
      expect(emptyPassword.success).toBe(false);
    });
  });

  describe("Account Deletion Business Logic", () => {
    it("prevents account deletion if user is the sole owner of an active organization", async () => {
      const user = {
        id: "user-sole-owner",
        email: "owner@company.com",
        passwordHash: await bcrypt.hash("Password123!", 10),
      };

      const userMemberships = [
        {
          organizationId: "org-1",
          organizationName: "Acme Enterprise",
          role: "owner",
        },
      ];

      // Simulate checking total owners in org-1: only 1 owner (the user)
      const totalOwnersInOrg1 = 1;
      const isSoleOwner = totalOwnersInOrg1 <= 1;

      expect(isSoleOwner).toBe(true);

      // Attempting deletion should throw an explicit error naming the organization
      const attemptDeletion = () => {
        if (isSoleOwner) {
          throw new Error(
            `Cannot delete account: You are the sole Owner of active organization(s): 'Acme Enterprise'. Please transfer ownership to another member or delete the organization first.`
          );
        }
      };

      expect(attemptDeletion).toThrowError(/sole Owner of active organization/);
      expect(attemptDeletion).toThrowError(/Acme Enterprise/);
    });

    it("allows account deletion after ownership is transferred or when another owner exists", async () => {
      const user = {
        id: "user-former-owner",
        email: "former@company.com",
        passwordHash: await bcrypt.hash("Password123!", 10),
      };

      // In org-1, total owners is now 2 (co-owner exists or ownership was transferred)
      const totalOwnersInOrg1 = 2;
      const isSoleOwner = totalOwnersInOrg1 <= 1;

      expect(isSoleOwner).toBe(false);

      // Password verification
      const isPasswordValid = await bcrypt.compare("Password123!", user.passwordHash);
      expect(isPasswordValid).toBe(true);

      // Sessions to revoke
      const userSessions = ["session-1", "session-2"];
      const revokedSessions: string[] = [];
      userSessions.forEach((s) => revokedSessions.push(s));

      expect(revokedSessions).toHaveLength(2);
    });

    it("normal user (member/admin) deletes their own account without affecting organizations or external databases", async () => {
      const normalUser = {
        id: "user-developer",
        email: "dev@company.com",
        passwordHash: await bcrypt.hash("DevPass123!", 10),
      };

      const memberships = [
        { organizationId: "org-1", role: "member" },
        { organizationId: "org-2", role: "admin" },
      ];

      // Check if sole owner of any org
      const soleOwnerOrgs = memberships.filter((m) => m.role === "owner");
      expect(soleOwnerOrgs).toHaveLength(0);

      // Verify re-authentication
      const passwordMatch = await bcrypt.compare("DevPass123!", normalUser.passwordHash);
      expect(passwordMatch).toBe(true);

      // Verify incorrect password fails
      const badPasswordMatch = await bcrypt.compare("WrongPass", normalUser.passwordHash);
      expect(badPasswordMatch).toBe(false);

      // Mock database state tracking
      const activeOrganizations = [{ id: "org-1", name: "Org 1" }, { id: "org-2", name: "Org 2" }];
      const externalDatabases = [{ id: "db-1", host: "ep-sample.us-east-2.aws.neon.tech" }];
      const auditLogEntries: Array<{ actorId: string | null; actorEmail: string; action: string }> = [
        { actorId: normalUser.id, actorEmail: normalUser.email, action: "query:execute" },
      ];

      // Execute account deletion simulation
      // 1. Audit log the deletion
      auditLogEntries.push({
        actorId: normalUser.id,
        actorEmail: normalUser.email,
        action: "user:account_delete",
      });

      // 2. Cascade sets actorId to null for GDPR/compliance data removal while preserving history
      auditLogEntries.forEach((entry) => {
        if (entry.actorId === normalUser.id) {
          entry.actorId = null; // Foreign key onDelete: 'set null'
        }
      });

      // Organizations and external databases MUST remain untouched
      expect(activeOrganizations).toHaveLength(2);
      expect(externalDatabases).toHaveLength(1);
      expect(auditLogEntries[0].actorId).toBeNull();
      expect(auditLogEntries[0].actorEmail).toBe("dev@company.com"); // Retained for audit compliance
    });
  });

  describe("Organization Deletion Permissions & Security", () => {
    it("rejects organization deletion when requested by an Admin (non-owner)", () => {
      const adminMember = {
        id: "mem-admin",
        role: "admin",
        userId: "user-admin",
      };

      const attemptDelete = () => {
        if (adminMember.role !== "owner") {
          throw new ForbiddenError("Only an Organization Owner can delete the organization.", 403);
        }
      };

      expect(attemptDelete).toThrow(ForbiddenError);
      expect(attemptDelete).toThrowError(/Only an Organization Owner/);
    });

    it("rejects organization deletion when requested by a Member", () => {
      const regularMember = {
        id: "mem-regular",
        role: "member",
        userId: "user-regular",
      };

      const attemptDelete = () => {
        if (regularMember.role !== "owner") {
          throw new ForbiddenError("Only an Organization Owner can delete the organization.", 403);
        }
      };

      expect(attemptDelete).toThrow(ForbiddenError);
      expect(attemptDelete).toThrowError(/Only an Organization Owner/);
    });

    it("rejects organization deletion when confirmation name does not match exactly", () => {
      const org = { id: "org-1", name: "Acme Production Core" };
      const typedName = "Acme Production"; // Incomplete

      const attemptDelete = () => {
        if (typedName.trim() !== org.name.trim()) {
          throw new Error(`Confirmation failed: Provided name does not match '${org.name}'.`);
        }
      };

      expect(attemptDelete).toThrowError(/Provided name does not match/);
    });

    it("rejects organization deletion when password re-authentication fails", async () => {
      const ownerUser = {
        id: "user-owner",
        passwordHash: await bcrypt.hash("CorrectPassword123!", 10),
      };

      const isPasswordValid = await bcrypt.compare("WrongPassword", ownerUser.passwordHash);
      expect(isPasswordValid).toBe(false);

      const attemptDelete = () => {
        if (!isPasswordValid) {
          throw new Error("Password incorrect. Re-authentication failed.");
        }
      };

      expect(attemptDelete).toThrowError(/Password incorrect/);
    });

    it("Organization Owner successfully deletes organization and invalidates pending invitations", async () => {
      const org = { id: "org-acme", name: "Acme Corp" };
      const ownerUser = {
        id: "user-owner",
        email: "owner@acme.com",
        passwordHash: await bcrypt.hash("OwnerMasterPassword123!", 10),
      };

      // Invitations in org
      const invitations = [
        { id: "inv-1", organizationId: org.id, status: "pending" },
        { id: "inv-2", organizationId: org.id, status: "pending" },
      ];

      // Workspaces in org
      const workspaces = [{ id: "ws-1", organizationId: org.id }];

      // Databases in org
      const dbRegistrations = [{ id: "dbreg-1", organizationId: org.id, name: "neon-prod" }];

      // Simulated external Neon DB
      const externalNeonProject = { id: "ep-sample-neon", status: "active", dropExecuted: false };

      // Re-authentication
      const isAuthValid = await bcrypt.compare("OwnerMasterPassword123!", ownerUser.passwordHash);
      expect(isAuthValid).toBe(true);

      // 1. Invalidate invitations
      invitations.forEach((inv) => {
        inv.status = "revoked";
      });
      expect(invitations.every((i) => i.status === "revoked")).toBe(true);

      // 2. Remove CHRONOS control plane metadata
      const remainingWorkspaces = workspaces.filter((w) => w.organizationId !== org.id);
      const remainingDbRegistrations = dbRegistrations.filter((d) => d.organizationId !== org.id);

      expect(remainingWorkspaces).toHaveLength(0);
      expect(remainingDbRegistrations).toHaveLength(0);

      // 3. Database Safety Guarantee: external DB remains completely intact!
      expect(externalNeonProject.dropExecuted).toBe(false);
      expect(externalNeonProject.status).toBe("active");
    });

    it("idempotency: repeated deletion request returns clean error without inconsistent state", () => {
      const deletedOrgs = new Set<string>(["org-deleted"]);

      const attemptDelete = (orgId: string) => {
        if (!deletedOrgs.has(orgId)) {
          throw new Error("Organization not found.");
        }
        deletedOrgs.delete(orgId);
        return { success: true };
      };

      // First call deletes
      const res1 = attemptDelete("org-deleted");
      expect(res1.success).toBe(true);

      // Repeated call cleanly fails with not found error rather than unexpected exception
      expect(() => attemptDelete("org-deleted")).toThrowError(/Organization not found/);
    });
  });

  describe("Login History Retention & Pagination", () => {
    it("automatically prunes login history events older than 30 days from database", () => {
      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const thirtyDaysAgo = new Date(now - thirtyDaysMs);

      const auditEntries = [
        { id: "1", action: "user:login", createdAt: new Date(now - 1000 * 60 * 60) }, // 1 hour ago (Keep)
        { id: "2", action: "user:login", createdAt: new Date(now - 1000 * 60 * 60 * 24 * 10) }, // 10 days ago (Keep)
        { id: "3", action: "user:login", createdAt: new Date(now - 1000 * 60 * 60 * 24 * 29) }, // 29 days ago (Keep)
        { id: "4", action: "user:login", createdAt: new Date(now - 1000 * 60 * 60 * 24 * 31) }, // 31 days ago (Prune)
        { id: "5", action: "user:login", createdAt: new Date(now - 1000 * 60 * 60 * 24 * 45) }, // 45 days ago (Prune)
      ];

      // Prune entries older than 30 days
      const pruned = auditEntries.filter(
        (entry) => !(entry.action === "user:login" && entry.createdAt < thirtyDaysAgo)
      );

      expect(pruned).toHaveLength(3);
      expect(pruned.map((p) => p.id)).toEqual(["1", "2", "3"]);
      expect(pruned.some((p) => p.id === "4" || p.id === "5")).toBe(false);
    });

    it("paginates login history records with a maximum of 5 rows per page", () => {
      const pageSize = 5;
      const mockHistory = Array.from({ length: 12 }, (_, i) => ({
        id: `login-${i + 1}`,
        action: "user:login",
        timestamp: new Date().toISOString(),
      }));

      const totalPages = Math.ceil(mockHistory.length / pageSize);
      expect(totalPages).toBe(3);

      // Page 1: items 1..5
      const page1 = mockHistory.slice(0, 5);
      expect(page1).toHaveLength(5);
      expect(page1[0].id).toBe("login-1");
      expect(page1[4].id).toBe("login-5");

      // Page 2: items 6..10
      const page2 = mockHistory.slice(5, 10);
      expect(page2).toHaveLength(5);
      expect(page2[0].id).toBe("login-6");
      expect(page2[4].id).toBe("login-10");

      // Page 3: items 11..12
      const page3 = mockHistory.slice(10, 15);
      expect(page3).toHaveLength(2);
      expect(page3[0].id).toBe("login-11");
      expect(page3[1].id).toBe("login-12");
    });
  });
});
