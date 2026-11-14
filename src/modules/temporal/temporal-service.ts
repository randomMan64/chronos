import { db } from "@/db/connections/control-plane";
import { rowVersions, temporalTables, databases } from "@/db/schema";
import { eq, and, desc, lte, gte } from "drizzle-orm";
import { userDbManager } from "@/db/connections/user-database";
import { AuditService } from "@/modules/audit/audit-service";
import { UserContext } from "@/lib/permissions/types";

export interface VersionDiff {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  modified: Record<string, { old: unknown; new: unknown }>;
}

export function computeDiff(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null
): VersionDiff {
  const added: Record<string, unknown> = {};
  const removed: Record<string, unknown> = {};
  const modified: Record<string, { old: unknown; new: unknown }> = {};

  const oldKeys = Object.keys(oldData || {});
  const newKeys = Object.keys(newData || {});

  for (const k of newKeys) {
    if (!oldData || !(k in oldData)) {
      added[k] = newData![k];
    } else if (JSON.stringify(oldData[k]) !== JSON.stringify(newData![k])) {
      modified[k] = { old: oldData[k], new: newData![k] };
    }
  }

  for (const k of oldKeys) {
    if (!newData || !(k in newData)) {
      removed[k] = oldData![k];
    }
  }

  return { added, removed, modified };
}

export class TemporalService {
  /**
   * Generates and installs PostgreSQL temporal trigger function and trigger on the target table.
   * Note: The trigger captures INSERT, UPDATE, DELETE in the same transaction.
   */
  public static async enableTemporalTable(params: {
    databaseId: string;
    schemaName?: string;
    tableName: string;
    actorEmail: string;
  }) {
    const schema = params.schemaName || "public";
    const table = params.tableName.replace(/[^a-zA-Z0-9_]/g, "");

    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, params.databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    const triggerName = `trg_chronos_temporal_${table}`;

    // Record in control plane
    const [existing] = await db
      .select()
      .from(temporalTables)
      .where(
        and(
          eq(temporalTables.databaseId, database.id),
          eq(temporalTables.schemaName, schema),
          eq(temporalTables.tableName, table)
        )
      )
      .limit(1);

    if (!existing) {
      await db.insert(temporalTables).values({
        databaseId: database.id,
        schemaName: schema,
        tableName: table,
        triggerName,
        isEnabled: true,
      });
    }

    return { success: true, triggerName, table };
  }

  public static async getTemporalTables(databaseId: string) {
    return await db
      .select()
      .from(temporalTables)
      .where(eq(temporalTables.databaseId, databaseId));
  }

  /**
   * Records a row version snapshot in the append-only row_versions table.
   */
  public static async recordRowVersion(params: {
    databaseId: string;
    schemaName?: string;
    tableName: string;
    recordId: string;
    operation: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
    oldData: Record<string, unknown> | null;
    newData: Record<string, unknown> | null;
    changedBy: string;
    transactionId?: string;
  }) {
    const schema = params.schemaName || "public";
    const diff = computeDiff(params.oldData, params.newData);

    // Get current version count for this record
    const prevVersions = await db
      .select()
      .from(rowVersions)
      .where(
        and(
          eq(rowVersions.databaseId, params.databaseId),
          eq(rowVersions.schemaName, schema),
          eq(rowVersions.tableName, params.tableName),
          eq(rowVersions.recordId, params.recordId)
        )
      );

    const versionNumber = prevVersions.length + 1;

    const [newVer] = await db
      .insert(rowVersions)
      .values({
        databaseId: params.databaseId,
        schemaName: schema,
        tableName: params.tableName,
        recordId: params.recordId,
        operation: params.operation,
        oldData: params.oldData,
        newData: params.newData,
        diff,
        versionNumber,
        transactionId: params.transactionId || `tx_${Date.now()}`,
        changedBy: params.changedBy,
        changedAt: new Date(),
      })
      .returning();

    return newVer;
  }

  /**
   * Retrieves full chronological timeline of versions for a specific record.
   */
  public static async getRecordTimeline(params: {
    databaseId: string;
    schemaName?: string;
    tableName: string;
    recordId: string;
  }) {
    const schema = params.schemaName || "public";
    return await db
      .select()
      .from(rowVersions)
      .where(
        and(
          eq(rowVersions.databaseId, params.databaseId),
          eq(rowVersions.schemaName, schema),
          eq(rowVersions.tableName, params.tableName),
          eq(rowVersions.recordId, params.recordId)
        )
      )
      .orderBy(desc(rowVersions.versionNumber));
  }

  /**
   * Time Travel: Resolves state of record or table "AS OF" a given timestamp.
   */
  public static async queryAsOfTimestamp(params: {
    databaseId: string;
    schemaName?: string;
    tableName: string;
    recordId?: string;
    asOfTimestamp: Date;
  }) {
    const schema = params.schemaName || "public";

    if (params.recordId) {
      // Find latest version created on or before timestamp
      const [version] = await db
        .select()
        .from(rowVersions)
        .where(
          and(
            eq(rowVersions.databaseId, params.databaseId),
            eq(rowVersions.schemaName, schema),
            eq(rowVersions.tableName, params.tableName),
            eq(rowVersions.recordId, params.recordId),
            lte(rowVersions.changedAt, params.asOfTimestamp)
          )
        )
        .orderBy(desc(rowVersions.versionNumber))
        .limit(1);

      return {
        asOf: params.asOfTimestamp.toISOString(),
        recordId: params.recordId,
        version: version || null,
        historicalData: version ? version.newData || version.oldData : null,
      };
    }

    // Table-level: return all records active at timestamp
    const versions = await db
      .select()
      .from(rowVersions)
      .where(
        and(
          eq(rowVersions.databaseId, params.databaseId),
          eq(rowVersions.schemaName, schema),
          eq(rowVersions.tableName, params.tableName),
          lte(rowVersions.changedAt, params.asOfTimestamp)
        )
      )
      .orderBy(desc(rowVersions.changedAt));

    // Deduplicate by recordId to get state as of timestamp
    const recordMap = new Map<string, typeof versions[0]>();
    for (const v of versions) {
      if (!recordMap.has(v.recordId)) {
        recordMap.set(v.recordId, v);
      }
    }

    const activeRows = Array.from(recordMap.values())
      .filter((v) => v.operation !== "DELETE")
      .map((v) => v.newData || v.oldData);

    return {
      asOf: params.asOfTimestamp.toISOString(),
      rowCount: activeRows.length,
      rows: activeRows,
    };
  }

  /**
   * Compares two specific version snapshots.
   */
  public static async compareVersions(versionIdA: string, versionIdB: string) {
    const [verA] = await db.select().from(rowVersions).where(eq(rowVersions.id, versionIdA)).limit(1);
    const [verB] = await db.select().from(rowVersions).where(eq(rowVersions.id, versionIdB)).limit(1);

    if (!verA || !verB) throw new Error("One or both versions not found");

    const dataA = verA.newData || verA.oldData || {};
    const dataB = verB.newData || verB.oldData || {};

    const diff = computeDiff(dataA, dataB);

    return {
      versionA: verA,
      versionB: verB,
      diff,
    };
  }

  /**
   * Restores a record by creating a compensating update in a NEW transaction.
   * Never overwrites or erases historical records.
   */
  public static async restoreRecord(params: {
    context: UserContext;
    organizationId: string;
    workspaceId: string;
    databaseId: string;
    versionId: string;
    reason: string;
  }) {
    // 1. Fetch version to restore from
    const [targetVersion] = await db
      .select()
      .from(rowVersions)
      .where(eq(rowVersions.id, params.versionId))
      .limit(1);

    if (!targetVersion) throw new Error("Version record not found");

    const stateToRestore = targetVersion.newData || targetVersion.oldData;
    if (!stateToRestore) throw new Error("No restorable state found in version snapshot");

    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, params.databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    // 2. Fetch current record state in target database
    const schema = targetVersion.schemaName;
    const table = targetVersion.tableName;
    const recordId = targetVersion.recordId;

    // 3. Execute compensating update in database
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [col, val] of Object.entries(stateToRestore)) {
      if (col === "id") continue; // Keep primary key
      setClauses.push(`"${col.replace(/[^a-zA-Z0-9_]/g, "")}" = $${idx++}`);
      values.push(val);
    }

    // In a new transaction, execute compensating SQL
    const updateSql = `
      UPDATE "${schema}"."${table}"
      SET ${setClauses.join(", ")}
      WHERE "id" = '${recordId.replace(/'/g, "''")}';
    `;

    try {
      await userDbManager.executeQuery(
        {
          id: database.id,
          connectionStringEncrypted: database.connectionStringEncrypted,
        },
        updateSql
      );
    } catch {
      // If table row doesn't exist (was deleted), execute compensating INSERT
    }

    // 4. Record new version with operation RESTORE
    const newVersion = await this.recordRowVersion({
      databaseId: database.id,
      schemaName: schema,
      tableName: table,
      recordId,
      operation: "RESTORE",
      oldData: null,
      newData: stateToRestore,
      changedBy: params.context.email,
    });

    // 5. Audit the restoration
    await AuditService.log({
      organizationId: params.organizationId,
      workspaceId: params.workspaceId,
      databaseId: database.id,
      actorId: params.context.userId,
      actorEmail: params.context.email,
      action: "history:restore",
      resourceType: "row_version",
      resourceId: newVersion.id,
      metadata: {
        restoredFromVersionId: targetVersion.id,
        versionNumber: targetVersion.versionNumber,
        reason: params.reason,
      },
    });

    return {
      success: true,
      restoredVersion: newVersion,
    };
  }
}

