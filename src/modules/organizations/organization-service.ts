import { db } from "@/db/connections/control-plane";
import { organizations, organizationMembers, users, workspaces, workspaceMembers } from "@/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { OrganizationRole } from "@/lib/permissions/types";
import { AuditService } from "@/modules/audit/audit-service";
import { ForbiddenError } from "@/lib/auth/guards";
import crypto from "crypto";

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
      workspaceId: ws.id,
      userId: params.userId,
      role: "dba",
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

    // Requirement 1: The currently authenticated Organization Owner must not be able to modify their own role.
    if (targetMember.userId === params.actorId && actorMember.role === "owner") {
      throw new ForbiddenError(
        "Organization Owners cannot modify their own role directly. Use the Transfer Ownership workflow.",
        403
      );
    }

    // Requirement 6 & 7: Assigning Owner role requires dedicated Transfer Ownership workflow
    if (params.newRole === "owner") {
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

      if (targetMember.role === "owner" && params.newRole !== "owner") {
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
          role: params.newRole,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.id, params.memberId)
          )
        )
        .returning();

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
    previousOwnerNewRole?: "admin" | "member";
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

    const previousRole = params.previousOwnerNewRole || "admin";

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
}
