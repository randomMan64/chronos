import { db } from "@/db/connections/control-plane";
import { workspaces, workspaceMembers, users, databases, databasePermissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { WorkspaceRole } from "@/lib/permissions/types";
import { normalizeRole } from "@/lib/permissions/roles";
import { AuditService } from "@/modules/audit/audit-service";
import crypto from "crypto";

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
      workspaceId: ws.id,
      userId: params.actorId,
      role: "dba",
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

  public static async getWorkspaceDetails(workspaceId: string) {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return ws || null;
  }

  public static async getWorkspaceMembers(workspaceId: string) {
    return await db
      .select({
        id: workspaceMembers.id,
        userId: users.id,
        email: users.email,
        fullName: users.fullName,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
  }

  public static async updateMemberRole(params: {
    workspaceId: string;
    organizationId: string;
    memberId: string;
    newRole: WorkspaceRole;
    actorId: string;
  }) {
    const [updated] = await db
      .update(workspaceMembers)
      .set({
        role: params.newRole,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workspaceMembers.workspaceId, params.workspaceId),
          eq(workspaceMembers.id, params.memberId)
        )
      )
      .returning();

    if (updated) {
      const canonicalRole = normalizeRole(params.newRole);
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

      const dbDefaults = roleDatabaseDefaults[canonicalRole] || {
        role: canonicalRole,
        canRead: true,
        canWrite: false,
        canExecuteDdl: false,
        canRestore: false,
        canExplain: false,
      };

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
        metadata: { newRole: params.newRole },
      });
    }

    return updated || null;
  }
}

