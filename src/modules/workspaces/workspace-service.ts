import { db } from "@/db/connections/control-plane";
import { workspaces, workspaceMembers, users, databases, databasePermissions, organizationMembers } from "@/db/schema";
import { eq, and, aliasedTable } from "drizzle-orm";
import { WorkspaceRole } from "@/lib/permissions/types";
import { normalizeRole } from "@/lib/permissions/roles";
import { AuditService } from "@/modules/audit/audit-service";
import { ForbiddenError } from "@/lib/auth/guards";
import crypto from "crypto";

function getRoleDatabaseDefaults(role: string): {
  role: string;
  canRead: boolean;
  canWrite: boolean;
  canExecuteDdl: boolean;
  canRestore: boolean;
  canExplain: boolean;
} {
  const canonicalRole = normalizeRole(role);
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

  return roleDatabaseDefaults[canonicalRole] || {
    role: canonicalRole,
    canRead: true,
    canWrite: false,
    canExecuteDdl: false,
    canRestore: false,
    canExplain: false,
  };
}

export class WorkspaceService {
  public static async createWorkspace(params: {
    organizationId: string;
    name: string;
    slug?: string;
    environment?: "development" | "staging" | "production";
    actorId: string;
  }) {
    const slug =
      params.slug ||
      params.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
        "-" +
        crypto.randomBytes(2).toString("hex");

    const [ws] = await db
      .insert(workspaces)
      .values({
        organizationId: params.organizationId,
        name: params.name,
        slug,
        environment: params.environment || "development",
      })
      .returning();

    // Assign creator as DBA in new workspace
    await db.insert(workspaceMembers).values({
      organizationId: params.organizationId,
      workspaceId: ws.id,
      userId: params.actorId,
      role: "dba",
      assignedBy: params.actorId,
    });

    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: ws.id,
      actorId: params.actorId,
      action: "workspace:create",
      resourceType: "workspace",
      resourceId: ws.id,
      metadata: { name: ws.name, environment: ws.environment },
    });

    return ws;
  }

  public static async getWorkspaces(organizationId: string) {
    return await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId));
  }

  public static async getAccessibleWorkspaces(params: {
    organizationId: string;
    userId: string;
    isOwnerOrAdmin: boolean;
  }) {
    if (params.isOwnerOrAdmin) {
      return await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.organizationId, params.organizationId));
    }

    return await db
      .select({
        id: workspaces.id,
        organizationId: workspaces.organizationId,
        name: workspaces.name,
        slug: workspaces.slug,
        environment: workspaces.environment,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.workspaceId, workspaces.id),
          eq(workspaceMembers.userId, params.userId)
        )
      )
      .where(eq(workspaces.organizationId, params.organizationId));
  }

  public static async getWorkspaceDetails(workspaceId: string) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return ws || null;
  }

  public static async getWorkspaceMembers(workspaceId: string) {
    const assignedByUser = aliasedTable(users, "assigned_by_user");
    return await db
      .select({
        id: workspaceMembers.id,
        organizationId: workspaceMembers.organizationId,
        workspaceId: workspaceMembers.workspaceId,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        role: workspaceMembers.role,
        assignedBy: workspaceMembers.assignedBy,
        assignedByName: assignedByUser.fullName,
        assignedByEmail: assignedByUser.email,
        createdAt: workspaceMembers.createdAt,
        updatedAt: workspaceMembers.updatedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .leftJoin(assignedByUser, eq(assignedByUser.id, workspaceMembers.assignedBy))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  public static async addWorkspaceMember(params: {
    workspaceId: string;
    organizationId: string;
    userId: string;
    role: WorkspaceRole;
    actorId: string;
  }) {
    // 1. Verify workspace exists and belongs to org
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, params.workspaceId), eq(workspaces.organizationId, params.organizationId)))
      .limit(1);

    if (!ws) {
      throw new Error("Workspace not found in this organization.");
    }

    // Self-permission protection: prevent self-assigning workspace membership
    if (params.userId === params.actorId) {
      throw new ForbiddenError("Users cannot assign or modify their own workspace membership.", 403);
    }

    // 2. Verify target user belongs to organization
    const [orgMember] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, params.organizationId), eq(organizationMembers.userId, params.userId)))
      .limit(1);

    if (!orgMember) {
      throw new Error("User must belong to the organization before being added to a workspace.");
    }

    // 3. Verify target user is not already in workspace
    const [existingMember] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, params.workspaceId), eq(workspaceMembers.userId, params.userId)))
      .limit(1);

    if (existingMember) {
      throw new Error("User is already a member of this workspace.");
    }

    // 4. Insert into workspace_members
    const canonicalRole = normalizeRole(params.role);
    const [newMember] = await db
      .insert(workspaceMembers)
      .values({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        role: canonicalRole,
        assignedBy: params.actorId,
      })
      .returning();

    // 5. Initialize database permissions for existing databases in this workspace
    const wsDatabases = await db
      .select({ id: databases.id })
      .from(databases)
      .where(eq(databases.workspaceId, params.workspaceId));

    const dbDefaults = getRoleDatabaseDefaults(canonicalRole);

    for (const dbRecord of wsDatabases) {
      const [existingPerm] = await db
        .select({ id: databasePermissions.id })
        .from(databasePermissions)
        .where(
          and(
            eq(databasePermissions.databaseId, dbRecord.id),
            eq(databasePermissions.userId, params.userId)
          )
        )
        .limit(1);

      if (existingPerm) {
        await db
          .update(databasePermissions)
          .set({
            role: dbDefaults.role,
            canRead: dbDefaults.canRead,
            canWrite: dbDefaults.canWrite,
            canExecuteDdl: dbDefaults.canExecuteDdl,
            canRestore: dbDefaults.canRestore,
            canExplain: dbDefaults.canExplain,
          })
          .where(eq(databasePermissions.id, existingPerm.id));
      } else {
        await db.insert(databasePermissions).values({
          databaseId: dbRecord.id,
          userId: params.userId,
          role: dbDefaults.role,
          canRead: dbDefaults.canRead,
          canWrite: dbDefaults.canWrite,
          canExecuteDdl: dbDefaults.canExecuteDdl,
          canRestore: dbDefaults.canRestore,
          canExplain: dbDefaults.canExplain,
        });
      }
    }

    // 6. Audit log
    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: "workspace_members:assign",
      resourceType: "workspace_member",
      resourceId: newMember.id,
      metadata: { targetUserId: params.userId, role: canonicalRole },
    });

    return newMember;
  }

  public static async removeWorkspaceMember(params: {
    workspaceId: string;
    organizationId: string;
    memberId: string;
    actorId: string;
  }) {
    // 1. Find member
    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.id, params.memberId),
          eq(workspaceMembers.workspaceId, params.workspaceId),
          eq(workspaceMembers.organizationId, params.organizationId)
        )
      )
      .limit(1);

    if (!member) {
      throw new Error("Workspace member not found.");
    }

    // Self-permission protection: prevent self-revocation of workspace membership
    if (member.userId === params.actorId) {
      throw new ForbiddenError("Users cannot revoke their own workspace membership.", 403);
    }

    // 2. Remove database permissions for this user on databases in this workspace
    const wsDatabases = await db
      .select({ id: databases.id })
      .from(databases)
      .where(eq(databases.workspaceId, params.workspaceId));

    for (const dbRecord of wsDatabases) {
      await db
        .delete(databasePermissions)
        .where(
          and(
            eq(databasePermissions.databaseId, dbRecord.id),
            eq(databasePermissions.userId, member.userId)
          )
        );
    }

    // 3. Remove workspace member record
    await db
      .delete(workspaceMembers)
      .where(eq(workspaceMembers.id, params.memberId));

    // 4. Audit log
    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: "workspace_members:revoke",
      resourceType: "workspace_member",
      resourceId: params.memberId,
      metadata: { removedUserId: member.userId, role: member.role },
    });

    return { success: true };
  }

  public static async deleteWorkspace(params: {
    workspaceId: string;
    organizationId: string;
    actorId: string;
  }) {
    // 1. Verify workspace exists
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.id, params.workspaceId),
          eq(workspaces.organizationId, params.organizationId)
        )
      )
      .limit(1);

    if (!ws) {
      throw new Error("Workspace not found.");
    }

    // 2. Prevent deleting the only workspace in the organization
    const orgWorkspaces = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, params.organizationId));

    if (orgWorkspaces.length <= 1) {
      throw new Error("Cannot delete the only workspace in an organization.");
    }

    // 3. Audit log before deleting workspace
    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      action: "workspace:delete",
      resourceType: "workspace",
      resourceId: params.workspaceId,
      metadata: { name: ws.name, environment: ws.environment },
    });

    // 4. Delete workspace (cascades workspace_members, databases metadata in control plane)
    // Note: External PostgreSQL databases are never dropped or affected.
    await db
      .delete(workspaces)
      .where(eq(workspaces.id, params.workspaceId));

    return { success: true, deletedWorkspaceId: params.workspaceId };
  }

  public static async updateMemberRole(params: {
    workspaceId: string;
    organizationId: string;
    memberId: string;
    newRole: WorkspaceRole;
    actorId: string;
  }) {
    // 1. Fetch target member from database
    const [targetMember] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, params.workspaceId),
          eq(workspaceMembers.id, params.memberId),
          eq(workspaceMembers.organizationId, params.organizationId)
        )
      )
      .limit(1);

    if (!targetMember) {
      return null;
    }

    // 2. Self-permission protection: prevent self-role modification
    if (targetMember.userId === params.actorId) {
      throw new ForbiddenError("Users cannot modify their own workspace role.", 403);
    }

    const canonicalRole = normalizeRole(params.newRole);
    const [updated] = await db
      .update(workspaceMembers)
      .set({
        role: canonicalRole,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceMembers.workspaceId, params.workspaceId),
          eq(workspaceMembers.id, params.memberId),
          eq(workspaceMembers.organizationId, params.organizationId)
        )
      )
      .returning();

    if (updated) {
      const dbDefaults = getRoleDatabaseDefaults(canonicalRole);

      const wsDatabases = await db
        .select({ id: databases.id })
        .from(databases)
        .where(eq(databases.workspaceId, params.workspaceId));

      for (const dbRecord of wsDatabases) {
        await db
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
              eq(databasePermissions.userId, updated.userId)
            )
          );
      }

      await AuditService.log({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        action: "workspace_members:update_role",
        resourceType: "workspace_member",
        resourceId: params.memberId,
        metadata: { newRole: canonicalRole },
      });
    }

    return updated || null;
  }
}


