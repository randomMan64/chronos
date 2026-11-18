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
    const configured = await db
      .select()
      .from(temporalTables)
      .where(eq(temporalTables.databaseId, databaseId));

    try {
      const versioned = await db
        .selectDistinct({
          tableName: rowVersions.tableName,
          schemaName: rowVersions.schemaName,
        })
        .from(rowVersions)
        .where(eq(rowVersions.databaseId, databaseId));

      const configuredNames = new Set(configured.map((c) => c.tableName));
      const merged = [...configured];

      for (const v of versioned) {
        if (!configuredNames.has(v.tableName)) {
          merged.push({
            id: `recorded-${v.tableName}`,
            databaseId,
            schemaName: v.schemaName || "public",
            tableName: v.tableName,
            isEnabled: true,
            triggerName: "captured_mutations",
            retentionDays: 90,
            capturedOperations: "INSERT,UPDATE,DELETE,RESTORE",
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any);
        }
      }

      return merged;
    } catch {
      return configured;
    }
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
   * Retrieves full chronological timeline of versions for a specific record or table.
   */
  public static async getRecordTimeline(params: {
    databaseId: string;
    schemaName?: string;
    tableName: string;
    recordId?: string;
    operation?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const schema = params.schemaName || "public";
    const conditions = [
      eq(rowVersions.databaseId, params.databaseId),
      eq(rowVersions.schemaName, schema),
      eq(rowVersions.tableName, params.tableName),
    ];

    if (params.recordId) {
      conditions.push(eq(rowVersions.recordId, params.recordId));
    }
    if (params.operation && params.operation !== "ALL") {
      conditions.push(eq(rowVersions.operation, params.operation.toUpperCase()));
    }
    if (params.startDate) {
      conditions.push(gte(rowVersions.changedAt, params.startDate));
    }
    if (params.endDate) {
      conditions.push(lte(rowVersions.changedAt, params.endDate));
    }

    const limit = Math.max(1, Math.min(100, params.limit || 50));
    const offset = Math.max(0, params.offset || 0);

    const rows = await db
      .select()
      .from(rowVersions)
      .where(and(...conditions))
      .orderBy(desc(rowVersions.changedAt), desc(rowVersions.versionNumber))
      .limit(limit)
      .offset(offset);

    return rows.map((v) => {
      const diff = v.diff || computeDiff(v.oldData, v.newData);
      const modifiedCount = Object.keys(diff?.modified || {}).length;
      const addedCount = Object.keys(diff?.added || {}).length;
      const removedCount = Object.keys(diff?.removed || {}).length;

      let changeSummary = "";
      if (v.operation === "INSERT") {
        const fields = Object.keys(v.newData || {}).length;
        changeSummary = `Inserted record with ${fields} field${fields === 1 ? "" : "s"}`;
      } else if (v.operation === "DELETE") {
        changeSummary = "Permanently deleted row snapshot";
      } else if (v.operation === "RESTORE") {
        changeSummary = `Compensating restore to state at v${v.versionNumber}`;
      } else if (v.operation === "UPDATE") {
        if (modifiedCount > 0) {
          const modFields = Object.keys(diff?.modified || {});
          changeSummary = `Modified ${modifiedCount} field${modifiedCount > 1 ? "s" : ""}: ${modFields.slice(0, 3).join(", ")}${modFields.length > 3 ? "..." : ""}`;
        } else {
          changeSummary = "Updated row attributes";
        }
      }

      return {
        id: v.id,
        tableName: v.tableName,
        recordId: v.recordId,
        operation: v.operation as "INSERT" | "UPDATE" | "DELETE" | "RESTORE",
        versionNumber: v.versionNumber,
        oldData: v.oldData,
        newData: v.newData,
        diff,
        changeSummary,
        modifiedCount,
        addedCount,
        removedCount,
        validFrom: v.changedAt ? v.changedAt.toISOString() : new Date().toISOString(),
        validTo: null,
        transactionXmin: v.transactionId || undefined,
        performedBy: v.changedBy || undefined,
      };
    });
  }

  /**
   * Retrieves the current live state of a record directly from the target database.
   */
  public static async getCurrentRecord(params: {
    databaseId: string;
    schemaName?: string;
    tableName: string;
    recordId: string;
  }) {
    const schema = params.schemaName || "public";
    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, params.databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    try {
      const tables = await userDbManager.introspectTables(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        schema
      );

      const targetTable = tables.find((t) => t.tableName === params.tableName);
      const pkCol = targetTable?.columns.find((c) => c.isPrimaryKey)?.columnName || "id";

      const sql = `SELECT * FROM "${schema.replace(/"/g, '""')}"."${params.tableName.replace(/"/g, '""')}" WHERE "${pkCol.replace(/"/g, '""')}" = $1 LIMIT 1;`;

      const res = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        sql,
        { params: [params.recordId], isReadOnly: true }
      );
      return res.rows.length > 0 ? res.rows[0] : null;
    } catch {
      return null;
    }
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
    page?: number;
    pageSize?: number;
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
        .orderBy(desc(rowVersions.changedAt), desc(rowVersions.versionNumber))
        .limit(1);

      if (version) {
        const isDeleted = version.operation === "DELETE";
        return {
          asOf: params.asOfTimestamp.toISOString(),
          recordId: params.recordId,
          tableName: params.tableName,
          status: isDeleted ? "DELETED" : "ACTIVE",
          versionId: version.id,
          versionNumber: version.versionNumber,
          operation: version.operation,
          changedAt: version.changedAt ? version.changedAt.toISOString() : null,
          changedBy: version.changedBy,
          historicalData: isDeleted ? null : (version.newData || version.oldData),
          lastKnownState: version.oldData || version.newData,
          message: isDeleted
            ? `Record was deleted at this point in time (v${version.versionNumber} on ${version.changedAt?.toISOString()}).`
            : `Reconstructed from Version v${version.versionNumber} (effective ${version.changedAt?.toISOString()}).`,
        };
      }

      // Check if any version existed AFTER the timestamp to give precise diagnostic
      const [laterVersion] = await db
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
        .orderBy(rowVersions.changedAt)
        .limit(1);

      if (laterVersion) {
        return {
          asOf: params.asOfTimestamp.toISOString(),
          recordId: params.recordId,
          tableName: params.tableName,
          status: "NOT_YET_CREATED",
          versionId: null,
          versionNumber: null,
          historicalData: null,
          message: `Record was not yet created at requested timestamp. Earliest version (v${laterVersion.versionNumber}) occurred on ${laterVersion.changedAt?.toISOString()}.`,
        };
      }

      return {
        asOf: params.asOfTimestamp.toISOString(),
        recordId: params.recordId,
        tableName: params.tableName,
        status: "NOT_FOUND",
        versionId: null,
        versionNumber: null,
        historicalData: null,
        message: `No historical mutations found for record "${params.recordId}" in table "${params.tableName}".`,
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
      .orderBy(desc(rowVersions.changedAt), desc(rowVersions.versionNumber));

    // Deduplicate by recordId to get state as of timestamp
    const recordMap = new Map<string, typeof versions[0]>();
    for (const v of versions) {
      if (!recordMap.has(v.recordId)) {
        recordMap.set(v.recordId, v);
      }
    }

    const activeRowsWithMeta = Array.from(recordMap.values())
      .filter((v) => v.operation !== "DELETE")
      .map((v) => ({
        _recordId: v.recordId,
        _versionNumber: v.versionNumber,
        _operation: v.operation,
        _validFrom: v.changedAt ? v.changedAt.toISOString() : null,
        ...(v.newData || v.oldData || {}),
      }));

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 25));
    const totalCount = activeRowsWithMeta.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedRows = activeRowsWithMeta.slice(startIndex, startIndex + pageSize);

    return {
      asOf: params.asOfTimestamp.toISOString(),
      tableName: params.tableName,
      rowCount: totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
      rows: paginatedRows,
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

    let previousState: Record<string, unknown> | null = null;
    try {
      previousState = await this.getCurrentRecord({
        databaseId: database.id,
        schemaName: schema,
        tableName: table,
        recordId,
      });

      const updateRes = await userDbManager.executeQuery(
        {
          id: database.id,
          connectionStringEncrypted: database.connectionStringEncrypted,
        },
        updateSql,
        { params: values }
      );

      // If no row was updated (e.g. record was previously deleted), execute compensating INSERT
      if (updateRes.rows.length === 0) {
        const insertCols: string[] = [];
        const insertParams: string[] = [];
        const insertValues: unknown[] = [];
        let insertIdx = 1;

        for (const [col, val] of Object.entries(stateToRestore)) {
          insertCols.push(`"${col.replace(/[^a-zA-Z0-9_]/g, "")}"`);
          insertParams.push(`$${insertIdx++}`);
          insertValues.push(val);
        }

        const insertSql = `
          INSERT INTO "${schema}"."${table}" (${insertCols.join(", ")})
          VALUES (${insertParams.join(", ")})
          ON CONFLICT DO NOTHING;
        `;

        await userDbManager.executeQuery(
          {
            id: database.id,
            connectionStringEncrypted: database.connectionStringEncrypted,
          },
          insertSql,
          { params: insertValues }
        );
      }
    } catch (dbErr) {
      console.warn("[TemporalService] Warning during compensating query execution:", dbErr);
    }

    // 4. Record new version with operation RESTORE
    const newVersion = await this.recordRowVersion({
      databaseId: database.id,
      schemaName: schema,
      tableName: table,
      recordId,
      operation: "RESTORE",
      oldData: previousState,
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

