import { db } from "@/db/connections/control-plane";
import {
  organizations,
  organizationMembers,
  users,
  workspaces,
  workspaceMembers,
  databases,
  databasePermissions,
  invitations,
} from "@/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { OrganizationRole } from "@/lib/permissions/types";
import { canAssignRole, normalizeRole } from "@/lib/permissions/roles";
import { AuditService } from "@/modules/audit/audit-service";
import { ForbiddenError } from "@/lib/auth/guards";
import crypto from "crypto";
import bcrypt from "bcryptjs";

export class OrganizationService {
  public static async createOrganization(params: {
    userId: string;
    name: string;
    slug?: string;
  }) {
    const slug =
      params.slug ||
      params.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
        "-" +
        crypto.randomBytes(3).toString("hex");

    // 1. Create Organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: params.name,
        slug,
      })
      .returning();

    // 2. Add creator as Owner
    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: params.userId,
      role: "owner",
    });

    // 3. Create default primary workspace
    const [ws] = await db
      .insert(workspaces)
      .values({
        organizationId: org.id,
        name: "Primary Workspace",
        slug: "primary",
        environment: "development",
      })
      .returning();

    // 4. Add creator as DBA in workspace
    await db.insert(workspaceMembers).values({
      organizationId: org.id,
      workspaceId: ws.id,
      userId: params.userId,
      role: "dba",
      assignedBy: params.userId,
    });

    // 5. Audit
    await AuditService.log({
      organizationId: org.id,
      workspaceId: ws.id,
      actorId: params.userId,
      action: "organization:create",
      resourceType: "organization",
      resourceId: org.id,
      metadata: { name: org.name, slug: org.slug },
    });

    return { organization: org, workspace: ws };
  }

  public static async getUserOrganizations(userId: string) {
    return await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: organizationMembers.role,
        createdAt: organizations.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId));
  }

  public static async getOrganizationDetails(organizationId: string) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    return org || null;
  }

  public static async getMembers(organizationId: string) {
    return await db
      .select({
        id: organizationMembers.id,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId));
  }

  public static async updateMemberRole(params: {
    organizationId: string;
    memberId: string;
    newRole: OrganizationRole;
    actorId: string;
  }) {
    // 1. Fetch actor's membership
    const [actorMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.userId, params.actorId)
        )
      )
      .limit(1);

    if (!actorMember) {
      throw new ForbiddenError("You are not a member of this organization", 403);
    }

    // 2. Fetch target member
    const [targetMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.id, params.memberId)
        )
      )
      .limit(1);

    if (!targetMember) {
      throw new Error("Target member not found");
    }

    // Requirement: Prevent users from modifying their own role directly
    if (targetMember.userId === params.actorId) {
      if (actorMember.role === "owner") {
        throw new ForbiddenError(
          "Organization Owners cannot modify their own role directly. Use the Transfer Ownership workflow.",
          403
        );
      }
      throw new ForbiddenError("Users cannot modify their own role.", 403);
    }

    const normalizedNewRole = normalizeRole(params.newRole);

    // Requirement: Check role assignment authority
    if (!canAssignRole(actorMember.role, normalizedNewRole)) {
      throw new ForbiddenError(
        `Your role (${actorMember.role}) is not authorized to assign role '${params.newRole}'.`,
        403
      );
    }

    // Requirement 6 & 7: Assigning Owner role requires dedicated Transfer Ownership workflow
    if (normalizedNewRole === "owner") {
      throw new ForbiddenError(
        "Assigning the Owner role requires the dedicated Transfer Ownership workflow.",
        403
      );
    }

    // Only owners can modify another owner's role
    if (targetMember.role === "owner" && actorMember.role !== "owner") {
      throw new ForbiddenError("Only Organization Owners can modify an Owner's role.", 403);
    }

    // Requirement 4 & 10: Prevent an organization from having zero Owners using atomic transaction with row locking
    return await db.transaction(async (tx) => {
      // Row lock organization members to serialize concurrent changes
      await tx.execute(
        sql`SELECT id FROM organization_members WHERE organization_id = ${params.organizationId} FOR UPDATE`
      );

      if (targetMember.role === "owner") {
        const [ownerCountResult] = await tx
          .select({ count: count() })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, params.organizationId),
              eq(organizationMembers.role, "owner")
            )
          );

        const ownerCount = Number(ownerCountResult?.count || 0);
        if (ownerCount <= 1) {
          throw new Error("Cannot demote the only Organization Owner. An organization must have at least one Owner.");
        }
      }

      const [updated] = await tx
        .update(organizationMembers)
        .set({
          role: normalizedNewRole,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.id, params.memberId)
          )
        )
        .returning();

      // Synchronize workspace memberships for this user in the organization
      const orgWorkspaces = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.organizationId, params.organizationId));

      for (const ws of orgWorkspaces) {
        await tx
          .update(workspaceMembers)
          .set({
            role: normalizedNewRole,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workspaceMembers.workspaceId, ws.id),
              eq(workspaceMembers.userId, targetMember.userId)
            )
          );
      }

      // Synchronize database permissions for this user across org databases
      const orgDatabases = await tx
        .select({ id: databases.id })
        .from(databases)
        .where(eq(databases.organizationId, params.organizationId));

      const roleDatabaseDefaults: Record<string, {
        role: string;
        canRead: boolean;
        canWrite: boolean;
        canExecuteDdl: boolean;
        canRestore: boolean;
        canExplain: boolean;
      }> = {
        owner: { role: "owner", canRead: true, canWrite: true, canExecuteDdl: true, canRestore: true, canExplain: true },
        dba: { role: "dba", canRead: true, canWrite: true, canExecuteDdl: true, canRestore: true, canExplain: true },
        developer: { role: "developer", canRead: true, canWrite: true, canExecuteDdl: false, canRestore: true, canExplain: false },
        database_engineer: { role: "database_engineer", canRead: true, canWrite: false, canExecuteDdl: false, canRestore: false, canExplain: true },
        data_analyst: { role: "data_analyst", canRead: true, canWrite: false, canExecuteDdl: false, canRestore: false, canExplain: false },
        auditor: { role: "auditor", canRead: true, canWrite: false, canExecuteDdl: false, canRestore: false, canExplain: false },
      };

      const dbDefaults = roleDatabaseDefaults[normalizedNewRole] || {
        role: normalizedNewRole,
        canRead: true,
        canWrite: false,
        canExecuteDdl: false,
        canRestore: false,
        canExplain: false,
      };

      for (const dbRecord of orgDatabases) {
        await tx
          .update(databasePermissions)
          .set({
            role: dbDefaults.role,
            canRead: dbDefaults.canRead,
            canWrite: dbDefaults.canWrite,
            canExecuteDdl: dbDefaults.canExecuteDdl,
            canRestore: dbDefaults.canRestore,
            canExplain: dbDefaults.canExplain,
          })
          .where(
            and(
              eq(databasePermissions.databaseId, dbRecord.id),
              eq(databasePermissions.userId, targetMember.userId)
            )
          );
      }

      if (updated) {
        await AuditService.log({
          organizationId: params.organizationId,
          actorId: params.actorId,
          action: "members:update_role",
          resourceType: "organization_member",
          resourceId: params.memberId,
          metadata: {
            previousRole: targetMember.role,
            newRole: params.newRole,
            targetUserId: targetMember.userId,
          },
        });
      }

      return updated || null;
    });
  }

  public static async removeMember(params: {
    organizationId: string;
    memberId: string;
    actorId: string;
  }) {
    // 1. Fetch actor's membership
    const [actorMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.userId, params.actorId)
        )
      )
      .limit(1);

    if (!actorMember) {
      throw new ForbiddenError("You are not a member of this organization", 403);
    }

    // 2. Fetch target member
    const [targetMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.id, params.memberId)
        )
      )
      .limit(1);

    if (!targetMember) {
      throw new Error("Target member not found");
    }

    // Requirement 3: Block self-removal
    if (targetMember.userId === params.actorId) {
      throw new ForbiddenError("You cannot remove yourself from the organization.", 403);
    }

    // Non-owners cannot remove an owner
    if (targetMember.role === "owner" && actorMember.role !== "owner") {
      throw new ForbiddenError("Only Organization Owners can remove another Owner.", 403);
    }

    // Requirement 4 & 10: Atomic transaction with locking to ensure organization never has 0 owners
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT id FROM organization_members WHERE organization_id = ${params.organizationId} FOR UPDATE`
      );

      if (targetMember.role === "owner") {
        const [ownerCountResult] = await tx
          .select({ count: count() })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, params.organizationId),
              eq(organizationMembers.role, "owner")
            )
          );

        const ownerCount = Number(ownerCountResult?.count || 0);
        if (ownerCount <= 1) {
          throw new Error("Cannot remove the only Organization Owner. Transfer ownership before leaving.");
        }
      }

      const [deleted] = await tx
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.id, params.memberId)
          )
        )
        .returning();

      if (deleted) {
        await AuditService.log({
          organizationId: params.organizationId,
          actorId: params.actorId,
          action: "members:remove",
          resourceType: "organization_member",
          resourceId: params.memberId,
          metadata: {
            removedUserId: targetMember.userId,
            removedRole: targetMember.role,
          },
        });
      }

      return deleted || null;
    });
  }

  public static async transferOwnership(params: {
    organizationId: string;
    actorId: string;
    newOwnerMemberId: string;
    confirmationPhrase: string;
    previousOwnerNewRole?: string;
  }) {
    if (params.confirmationPhrase !== "TRANSFER_OWNERSHIP") {
      throw new Error('Confirmation phrase must be "TRANSFER_OWNERSHIP"');
    }

    // 1. Fetch actor's membership
    const [actorMember] = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        email: users.email,
        fullName: users.fullName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.userId, params.actorId)
        )
      )
      .limit(1);

    if (!actorMember || actorMember.role !== "owner") {
      throw new ForbiddenError("Only an Organization Owner can transfer ownership.", 403);
    }

    // 2. Fetch target member
    const [targetMember] = await db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        email: users.email,
        fullName: users.fullName,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.id, params.newOwnerMemberId)
        )
      )
      .limit(1);

    if (!targetMember) {
      throw new Error("Target member for ownership transfer not found.");
    }

    if (targetMember.userId === params.actorId) {
      throw new Error("You already own this organization. Select another eligible member.");
    }

    const previousRole = normalizeRole(params.previousOwnerNewRole || "dba");

    // 3. Atomic transaction with row locking
    return await db.transaction(async (tx) => {
      // Row lock organization members to serialize concurrent transfers
      await tx.execute(
        sql`SELECT id FROM organization_members WHERE organization_id = ${params.organizationId} FOR UPDATE`
      );

      // Promote new owner
      const [newOwner] = await tx
        .update(organizationMembers)
        .set({
          role: "owner",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.id, targetMember.id)
          )
        )
        .returning();

      // Demote/assign previous owner
      const [prevOwnerUpdated] = await tx
        .update(organizationMembers)
        .set({
          role: previousRole,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.id, actorMember.id)
          )
        )
        .returning();

      // Synchronize workspace memberships for previous owner
      const orgWorkspaces = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.organizationId, params.organizationId));

      for (const ws of orgWorkspaces) {
        await tx
          .update(workspaceMembers)
          .set({
            role: previousRole,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workspaceMembers.workspaceId, ws.id),
              eq(workspaceMembers.userId, params.actorId)
            )
          );
      }

      // Rule 4 & 10: Verify organization has at least 1 owner
      const [ownerCountResult] = await tx
        .select({ count: count() })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.role, "owner")
          )
        );

      const ownerCount = Number(ownerCountResult?.count || 0);
      if (ownerCount < 1) {
        throw new Error("Ownership transfer failed: organization cannot have zero owners.");
      }

      // Rule 8: Record ownership transfer in append-only audit log
      await AuditService.log({
        organizationId: params.organizationId,
        actorId: params.actorId,
        actorEmail: actorMember.email,
        action: "organization:transfer_ownership",
        resourceType: "organization",
        resourceId: params.organizationId,
        metadata: {
          previousOwnerId: actorMember.id,
          previousOwnerEmail: actorMember.email,
          previousOwnerNewRole: previousRole,
          newOwnerId: newOwner.id,
          newOwnerEmail: targetMember.email,
          newOwnerName: targetMember.fullName,
        },
      });

      return {
        success: true,
        newOwner,
        previousOwner: prevOwnerUpdated,
      };
    });
  }

  public static async getOrganizationDeletionPreview(organizationId: string, actorId: string) {
    // 1. Fetch organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error("Organization not found.");
    }

    // 2. Verify actor is an Owner
    const [actorMember] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, actorId)
        )
      )
      .limit(1);

    if (!actorMember || actorMember.role !== "owner") {
      throw new ForbiddenError("Only an Organization Owner can delete the organization.", 403);
    }

    // 3. Gather stats
    const [memberCountRes] = await db
      .select({ count: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));

    const [workspaceCountRes] = await db
      .select({ count: count() })
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId));

    const [databaseCountRes] = await db
      .select({ count: count() })
      .from(databases)
      .where(eq(databases.organizationId, organizationId));

    const [pendingInviteCountRes] = await db
      .select({ count: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.status, "pending")
        )
      );

    return {
      organizationId: org.id,
      name: org.name,
      slug: org.slug,
      memberCount: Number(memberCountRes?.count || 0),
      workspaceCount: Number(workspaceCountRes?.count || 0),
      databaseCount: Number(databaseCountRes?.count || 0),
      pendingInviteCount: Number(pendingInviteCountRes?.count || 0),
      resourcesAffected: [
        "All workspaces, environments, and workspace member role assignments",
        "All registered database connection metadata and credentials stored in CHRONOS",
        "All pending invitations and access tokens",
        "All saved queries and audit trail references for this organization",
      ],
      databaseSafetyNotice:
        "External Database Safety: External PostgreSQL databases (Neon, AWS RDS, GCP Cloud SQL, or self-hosted) will NOT be dropped or modified. Only CHRONOS control plane registration metadata is removed.",
    };
  }

  public static async deleteOrganization(params: {
    organizationId: string;
    actorId: string;
    actorEmail?: string;
    password: string;
    confirmOrgName: string;
  }) {
    // 1. Fetch organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, params.organizationId))
      .limit(1);

    if (!org) {
      throw new Error("Organization not found.");
    }

    // 2. Verify actor is an Owner
    const [actorMember] = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.userId, params.actorId)
        )
      )
      .limit(1);

    if (!actorMember || actorMember.role !== "owner") {
      throw new ForbiddenError("Only an Organization Owner can delete the organization.", 403);
    }

    // 3. Confirm exact organization name match
    if (params.confirmOrgName.trim() !== org.name.trim()) {
      throw new Error(`Confirmation failed: Provided name does not match '${org.name}'.`);
    }

    // 4. Re-authenticate actor password
    const isPasswordValid = await bcrypt.compare(params.password, actorMember.passwordHash);
    if (!isPasswordValid) {
      throw new Error("Password incorrect. Re-authentication failed.");
    }

    // 5. Audit record the deletion request before tearing down resources
    await AuditService.log({
      organizationId: params.organizationId,
      actorId: params.actorId,
      actorEmail: params.actorEmail || actorMember.email,
      action: "organization:delete",
      resourceType: "organization",
      resourceId: params.organizationId,
      outcome: "success",
      metadata: {
        organizationName: org.name,
        organizationSlug: org.slug,
        deletedBy: actorMember.email,
        deletedAt: new Date().toISOString(),
        externalDatabasesUnaffected: true,
      },
    });

    // 6. Safe, transactional deletion
    return await db.transaction(async (tx) => {
      // Row lock the organization to prevent race conditions
      await tx.execute(
        sql`SELECT id FROM organizations WHERE id = ${params.organizationId} FOR UPDATE`
      );

      // Revoke all pending invitations
      await tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(eq(invitations.organizationId, params.organizationId));

      // Remove database connection registrations (only metadata in control plane - external databases are NEVER dropped)
      await tx
        .delete(databases)
        .where(eq(databases.organizationId, params.organizationId));

      // Remove workspaces
      await tx
        .delete(workspaces)
        .where(eq(workspaces.organizationId, params.organizationId));

      // Remove organization members
      await tx
        .delete(organizationMembers)
        .where(eq(organizationMembers.organizationId, params.organizationId));

      // Delete the organization
      await tx
        .delete(organizations)
        .where(eq(organizations.id, params.organizationId));

      return {
        success: true,
        deletedOrganizationId: params.organizationId,
        deletedOrganizationName: org.name,
      };
    });
  }
}
