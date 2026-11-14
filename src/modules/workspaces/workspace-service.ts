import { db } from "@/db/connections/control-plane";
import { workspaces, workspaceMembers, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { WorkspaceRole } from "@/lib/permissions/types";
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

