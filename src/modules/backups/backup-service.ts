import { db } from "@/db/connections/control-plane";
import { snapshots, databases } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { AuditService } from "@/modules/audit/audit-service";
import { UserContext } from "@/lib/permissions/types";

export class BackupService {
  public static async getSnapshots(databaseId: string) {
    return await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.databaseId, databaseId))
      .orderBy(desc(snapshots.createdAt));
  }

  public static async createSnapshot(params: {
    context: UserContext;
    organizationId: string;
    workspaceId: string;
    databaseId: string;
    name: string;
    snapshotType?: "manual" | "daily" | "pitr_point";
  }) {
    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, params.databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    const [snapshot] = await db
      .insert(snapshots)
      .values({
        databaseId: database.id,
        name: params.name,
        snapshotType: params.snapshotType || "manual",
        status: "completed",
        recoveryPoint: new Date(),
        metadata: {
          databaseName: database.databaseName,
          environment: database.environment,
          host: database.host,
        },
      })
      .returning();

    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      databaseId: database.id,
      actorId: params.context.userId,
      actorEmail: params.context.email,
      action: "backup:create",
      resourceType: "snapshot",
      resourceId: snapshot.id,
      metadata: { name: snapshot.name, snapshotType: snapshot.snapshotType },
    });

    return snapshot;
  }

  public static async restoreSnapshot(params: {
    context: UserContext;
    organizationId: string;
    workspaceId: string;
    databaseId: string;
    snapshotId: string;
    confirmationPhrase: string;
  }) {
    if (params.confirmationPhrase !== "RESTORE_SNAPSHOT") {
      throw new Error("Invalid confirmation phrase. Type RESTORE_SNAPSHOT to confirm.");
    }

    const [snapshot] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, params.snapshotId))
      .limit(1);

    if (!snapshot) throw new Error("Snapshot not found");

    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      databaseId: params.databaseId,
      actorId: params.context.userId,
      actorEmail: params.context.email,
      action: "backup:restore",
      resourceType: "snapshot",
      resourceId: snapshot.id,
      metadata: {
        snapshotName: snapshot.name,
        recoveryPoint: snapshot.recoveryPoint,
      },
    });

    return {
      success: true,
      message: `Database recovery point requested for snapshot '${snapshot.name}' at ${snapshot.recoveryPoint?.toISOString()}`,
      snapshot,
    };
  }
}

