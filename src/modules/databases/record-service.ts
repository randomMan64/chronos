import { db } from "@/db/connections/control-plane";
import { databases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { userDbManager, TableColumnMetadata } from "@/db/connections/user-database";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { AuditService } from "@/modules/audit/audit-service";
import { NotFoundError, ForbiddenError } from "@/lib/auth/guards";

export class ConcurrencyConflictError extends Error {
  public statusCode = 409;
  public code = "CONCURRENCY_CONFLICT";
  public currentRecord: Record<string, unknown>;

  constructor(message: string, currentRecord: Record<string, unknown>) {
    super(message);
    this.name = "ConcurrencyConflictError";
    this.currentRecord = currentRecord;
  }
}

/**
 * Safely quotes a PostgreSQL identifier (table name, column name, schema name)
 * to prevent SQL injection, handling embedded double quotes safely.
 */
export function quoteIdent(ident: string): string {
  if (!ident || typeof ident !== "string" || /[\0\r\n;]/.test(ident)) {
    throw new Error("Invalid SQL identifier");
  }
  return '"' + ident.replace(/"/g, '""') + '"';
}

/**
 * Validates and converts an input value to the appropriate type for PostgreSQL.
 */
export function sanitizeColumnValue(
  value: unknown,
  colMeta: TableColumnMetadata
): unknown {
  if (value === null || value === undefined || value === "") {
    if (value === "" && colMeta.dataType.toLowerCase().includes("char")) {
      return "";
    }
    if (!colMeta.isNullable && value === null) {
      throw new Error(`Column "${colMeta.columnName}" cannot be NULL.`);
    }
    return null;
  }

  const dt = colMeta.dataType.toLowerCase();

  // Boolean
  if (dt === "boolean" || dt === "bool") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1" || value === 1) return true;
    if (value === "false" || value === "0" || value === 0) return false;
    throw new Error(`Invalid boolean value for column "${colMeta.columnName}".`);
  }

  // Integers
  if (dt.includes("int") || dt === "serial" || dt === "bigserial") {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num)) {
      throw new Error(`Column "${colMeta.columnName}" requires an integer.`);
    }
    return num;
  }

  // Floating point / Decimal / Numeric
  if (dt.includes("numeric") || dt.includes("decimal") || dt.includes("float") || dt.includes("double") || dt === "real") {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Column "${colMeta.columnName}" requires a numeric value.`);
    }
    return num;
  }

  // JSON / JSONB
  if (dt === "json" || dt === "jsonb") {
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    if (typeof value === "string") {
      try {
        JSON.parse(value);
        return value;
      } catch {
        throw new Error(`Column "${colMeta.columnName}" requires valid JSON.`);
      }
    }
  }

  // Date / Timestamp
  if (dt.includes("timestamp") || dt === "date") {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") {
      const d = new Date(value);
      if (isNaN(d.getTime())) {
        throw new Error(`Column "${colMeta.columnName}" requires a valid date/timestamp.`);
      }
      return value;
    }
  }

  return value;
}

export class RecordService {
  public static quoteIdent = quoteIdent;
  public static sanitizeColumnValue = sanitizeColumnValue;

  /**
   * Fetch database connection details.
   */
  public static async getDatabase(databaseId: string) {
    const [dbRecord] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!dbRecord) {
      throw new NotFoundError("Database not found", 404);
    }
    return dbRecord;
  }

  /**
   * Introspect table metadata to discover columns, primary keys, and types.
   */
  public static async getTableMetadata(databaseId: string, schema: string, table: string) {
    const database = await this.getDatabase(databaseId);
    const tables = await userDbManager.introspectTables(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      schema
    );

    const targetTable = tables.find((t) => t.tableName === table);
    if (!targetTable) {
      throw new NotFoundError(`Table "${schema}"."${table}" not found in database.`, 404);
    }

    return targetTable;
  }

  /**
   * Safely updates an existing record using parameterized query with optimistic concurrency.
   */
  public static async updateRecord(params: {
    databaseId: string;
    schema?: string;
    table: string;
    primaryKey: Record<string, unknown>;
    changes: Record<string, unknown>;
    originalRow?: Record<string, unknown>;
    actor: {
      id: string;
      email: string;
      organizationId?: string;
    };
  }) {
    const schema = params.schema || "public";
    const table = params.table;
    const database = await this.getDatabase(params.databaseId);
    const tableMeta = await this.getTableMetadata(database.id, schema, table);

    // 1. Identify Primary Key Column(s)
    let pkCols = tableMeta.columns.filter((c) => c.isPrimaryKey);
    if (pkCols.length === 0) {
      // Fallback: look for 'id' column or first non-null unique column
      const idCol = tableMeta.columns.find((c) => c.columnName.toLowerCase() === "id");
      if (idCol) {
        pkCols = [idCol];
      } else {
        throw new Error(
          `Table "${schema}"."${table}" has no designated primary key column. Record updates require an identifiable primary key.`
        );
      }
    }

    // Verify primary key value is provided
    for (const pk of pkCols) {
      if (params.primaryKey[pk.columnName] === undefined || params.primaryKey[pk.columnName] === null) {
        throw new Error(`Missing primary key value for "${pk.columnName}".`);
      }
    }

    // 2. Fetch Current Row from Target Database
    const pkWhereClauses: string[] = [];
    const pkValues: unknown[] = [];
    let paramIndex = 1;

    for (const pk of pkCols) {
      pkWhereClauses.push(`${quoteIdent(pk.columnName)} = $${paramIndex++}`);
      pkValues.push(params.primaryKey[pk.columnName]);
    }

    const selectSql = `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${pkWhereClauses.join(" AND ")} LIMIT 1;`;
    const selectRes = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      selectSql,
      { params: pkValues, isReadOnly: true }
    );

    if (selectRes.rows.length === 0) {
      throw new NotFoundError(
        "Record not found. It may have been deleted by another user or transaction.",
        404
      );
    }

    const currentRecord = selectRes.rows[0];

    // Self-permission modification protection: users cannot modify their own permission or membership records
    const lowerTable = table.toLowerCase();
    if (
      lowerTable === "database_permissions" ||
      lowerTable === "workspace_members" ||
      lowerTable === "organization_members"
    ) {
      const targetUserId =
        currentRecord.user_id ??
        currentRecord.userId ??
        params.primaryKey.user_id ??
        params.primaryKey.userId;
      if (targetUserId && String(targetUserId) === String(params.actor.id)) {
        throw new ForbiddenError(
          "Self-permission modification is prohibited: Users cannot modify their own permission or membership assignments.",
          403
        );
      }
    }

    // 3. Optimistic Concurrency Check
    if (params.originalRow) {
      const orig = params.originalRow;
      // Check if updated_at differs or if any column in originalRow has diverged in database
      const hasConflict = Object.keys(orig).some((key) => {
        if (!(key in currentRecord)) return false;
        // Compare values
        const origVal = orig[key];
        const currVal = currentRecord[key];
        if (origVal === currVal) return false;
        // Handle dates/objects
        return JSON.stringify(origVal) !== JSON.stringify(currVal);
      });

      if (hasConflict) {
        throw new ConcurrencyConflictError(
          "Conflict: This record was modified by another user or session after you loaded it. Please reload the latest version before applying changes.",
          currentRecord
        );
      }
    }

    // 4. Validate & Filter Changes
    const setClauses: string[] = [];
    const updateValues: unknown[] = [];
    const changedColumns: string[] = [];

    const pkColNames = new Set(pkCols.map((c) => c.columnName));
    const validColMap = new Map(tableMeta.columns.map((c) => [c.columnName, c]));

    for (const [colName, rawVal] of Object.entries(params.changes)) {
      // Disallow updating primary keys
      if (pkColNames.has(colName)) {
        if (rawVal !== params.primaryKey[colName]) {
          throw new Error(`Modifying primary key column "${colName}" is not permitted.`);
        }
        continue;
      }

      const colMeta = validColMap.get(colName);
      if (!colMeta) {
        throw new Error(`Unknown column "${colName}" in table "${schema}"."${table}".`);
      }

      // Skip generated columns
      if (colMeta.columnDefault?.toUpperCase().includes("GENERATED")) {
        continue;
      }

      const sanitizedVal = sanitizeColumnValue(rawVal, colMeta);
      setClauses.push(`${quoteIdent(colName)} = $${paramIndex++}`);
      updateValues.push(sanitizedVal);
      changedColumns.push(colName);
    }

    if (setClauses.length === 0) {
      // No actual columns changed
      return { record: currentRecord, changedColumns: [] };
    }

    // Combine parameters: SET params + WHERE pk params
    const allParams = [...updateValues, ...pkValues];
    // Re-index WHERE clauses based on updateValues length
    const reindexedPkWhere: string[] = [];
    let whereParamIndex = updateValues.length + 1;
    for (const pk of pkCols) {
      reindexedPkWhere.push(`${quoteIdent(pk.columnName)} = $${whereParamIndex++}`);
    }

    const updateSql = `UPDATE ${quoteIdent(schema)}.${quoteIdent(table)} SET ${setClauses.join(", ")} WHERE ${reindexedPkWhere.join(" AND ")} RETURNING *;`;

    // 5. Execute Update against PostgreSQL Target Database
    const updateRes = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      updateSql,
      { params: allParams }
    );

    const updatedRecord = updateRes.rows[0] || currentRecord;
    const pkString = pkCols.map((c) => String(params.primaryKey[c.columnName])).join(":");

    // 6. Time Travel Integration
    try {
      await TemporalService.recordRowVersion({
        databaseId: database.id,
        schemaName: schema,
        tableName: table,
        recordId: pkString,
        operation: "UPDATE",
        oldData: currentRecord,
        newData: updatedRecord,
        changedBy: params.actor.email,
      });
    } catch (temporalErr) {
      console.warn("[RecordService] Warning: Failed to capture temporal row version:", temporalErr);
    }

    // 7. Audit Log Integration
    try {
      await AuditService.log({
        organizationId: params.actor.organizationId || database.organizationId,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        action: "database:record_update",
        resourceType: "database_record",
        resourceId: `${table}:${pkString}`,
        metadata: {
          databaseId: database.id,
          schema,
          table,
          recordId: pkString,
          changedColumns,
        },
      });
    } catch (auditErr) {
      console.warn("[RecordService] Warning: Failed to log audit event:", auditErr);
    }

    return { record: updatedRecord, changedColumns };
  }

  /**
   * Safely inserts a new record into the specified table using parameterized query.
   */
  public static async insertRecord(params: {
    databaseId: string;
    schema?: string;
    table: string;
    data: Record<string, unknown>;
    actor: {
      id: string;
      email: string;
      organizationId?: string;
    };
  }) {
    const schema = params.schema || "public";
    const table = params.table;
    const database = await this.getDatabase(params.databaseId);
    const tableMeta = await this.getTableMetadata(database.id, schema, table);

    const validColMap = new Map(tableMeta.columns.map((c) => [c.columnName, c]));
    const colNames: string[] = [];
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const [colName, rawVal] of Object.entries(params.data)) {
      const colMeta = validColMap.get(colName);
      if (!colMeta) {
        throw new Error(`Unknown column "${colName}" in table "${schema}"."${table}".`);
      }

      // Skip generated columns
      if (colMeta.columnDefault?.toUpperCase().includes("GENERATED")) {
        continue;
      }

      // If value is null/empty and column has default, allow PostgreSQL default by skipping
      if ((rawVal === undefined || rawVal === null || rawVal === "") && colMeta.columnDefault) {
        continue;
      }

      const sanitizedVal = sanitizeColumnValue(rawVal, colMeta);
      colNames.push(quoteIdent(colName));
      placeholders.push(`$${paramIndex++}`);
      values.push(sanitizedVal);
    }

    let insertSql = "";
    if (colNames.length > 0) {
      insertSql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} (${colNames.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *;`;
    } else {
      insertSql = `INSERT INTO ${quoteIdent(schema)}.${quoteIdent(table)} DEFAULT VALUES RETURNING *;`;
    }

    const insertRes = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      insertSql,
      { params: values }
    );

    const newRecord = insertRes.rows[0];

    // Determine PK identifier string
    const pkCols = tableMeta.columns.filter((c) => c.isPrimaryKey);
    const pkString = pkCols.length > 0
      ? pkCols.map((c) => String(newRecord[c.columnName])).join(":")
      : String(newRecord.id || newRecord[Object.keys(newRecord)[0]] || "new");

    // Time Travel Record
    try {
      await TemporalService.recordRowVersion({
        databaseId: database.id,
        schemaName: schema,
        tableName: table,
        recordId: pkString,
        operation: "INSERT",
        oldData: null,
        newData: newRecord,
        changedBy: params.actor.email,
      });
    } catch (temporalErr) {
      console.warn("[RecordService] Warning: Failed to capture temporal row version:", temporalErr);
    }

    // Audit Log
    try {
      await AuditService.log({
        organizationId: params.actor.organizationId || database.organizationId,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        action: "database:record_insert",
        resourceType: "database_record",
        resourceId: `${table}:${pkString}`,
        metadata: {
          databaseId: database.id,
          schema,
          table,
          recordId: pkString,
        },
      });
    } catch (auditErr) {
      console.warn("[RecordService] Warning: Failed to log audit event:", auditErr);
    }

    return { record: newRecord };
  }

  /**
   * Safely deletes a record using parameterized query and optimistic concurrency check.
   */
  public static async deleteRecord(params: {
    databaseId: string;
    schema?: string;
    table: string;
    primaryKey: Record<string, unknown>;
    originalRow?: Record<string, unknown>;
    actor: {
      id: string;
      email: string;
      organizationId?: string;
    };
  }) {
    const schema = params.schema || "public";
    const table = params.table;
    const database = await this.getDatabase(params.databaseId);
    const tableMeta = await this.getTableMetadata(database.id, schema, table);

    let pkCols = tableMeta.columns.filter((c) => c.isPrimaryKey);
    if (pkCols.length === 0) {
      const idCol = tableMeta.columns.find((c) => c.columnName.toLowerCase() === "id");
      if (idCol) pkCols = [idCol];
      else {
        throw new Error(
          `Table "${schema}"."${table}" has no designated primary key column. Record deletion requires an identifiable primary key.`
        );
      }
    }

    for (const pk of pkCols) {
      if (params.primaryKey[pk.columnName] === undefined || params.primaryKey[pk.columnName] === null) {
        throw new Error(`Missing primary key value for "${pk.columnName}".`);
      }
    }

    const pkWhereClauses: string[] = [];
    const pkValues: unknown[] = [];
    let paramIndex = 1;

    for (const pk of pkCols) {
      pkWhereClauses.push(`${quoteIdent(pk.columnName)} = $${paramIndex++}`);
      pkValues.push(params.primaryKey[pk.columnName]);
    }

    // Fetch before delete
    const selectSql = `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${pkWhereClauses.join(" AND ")} LIMIT 1;`;
    const selectRes = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      selectSql,
      { params: pkValues, isReadOnly: true }
    );

    if (selectRes.rows.length === 0) {
      throw new NotFoundError("Record not found or already deleted.", 404);
    }

    const currentRecord = selectRes.rows[0];

    // Self-permission modification protection: users cannot modify their own permission or membership records
    const lowerTable = table.toLowerCase();
    if (
      lowerTable === "database_permissions" ||
      lowerTable === "workspace_members" ||
      lowerTable === "organization_members"
    ) {
      const targetUserId =
        currentRecord.user_id ??
        currentRecord.userId ??
        params.primaryKey.user_id ??
        params.primaryKey.userId;
      if (targetUserId && String(targetUserId) === String(params.actor.id)) {
        throw new ForbiddenError(
          "Self-permission modification is prohibited: Users cannot modify their own permission or membership assignments.",
          403
        );
      }
    }

    // Optimistic Concurrency Check
    if (params.originalRow) {
      const orig = params.originalRow;
      const hasConflict = Object.keys(orig).some((key) => {
        if (!(key in currentRecord)) return false;
        const origVal = orig[key];
        const currVal = currentRecord[key];
        if (origVal === currVal) return false;
        return JSON.stringify(origVal) !== JSON.stringify(currVal);
      });

      if (hasConflict) {
        throw new ConcurrencyConflictError(
          "Conflict: This record was modified by another user after you loaded it. Please reload before deleting.",
          currentRecord
        );
      }
    }

    const deleteSql = `DELETE FROM ${quoteIdent(schema)}.${quoteIdent(table)} WHERE ${pkWhereClauses.join(" AND ")} RETURNING *;`;
    const deleteRes = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      deleteSql,
      { params: pkValues }
    );

    const deletedRecord = deleteRes.rows[0] || currentRecord;
    const pkString = pkCols.map((c) => String(params.primaryKey[c.columnName])).join(":");

    // Time Travel Record
    try {
      await TemporalService.recordRowVersion({
        databaseId: database.id,
        schemaName: schema,
        tableName: table,
        recordId: pkString,
        operation: "DELETE",
        oldData: deletedRecord,
        newData: null,
        changedBy: params.actor.email,
      });
    } catch (temporalErr) {
      console.warn("[RecordService] Warning: Failed to capture temporal row version:", temporalErr);
    }

    // Audit Log
    try {
      await AuditService.log({
        organizationId: params.actor.organizationId || database.organizationId,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        action: "database:record_delete",
        resourceType: "database_record",
        resourceId: `${table}:${pkString}`,
        metadata: {
          databaseId: database.id,
          schema,
          table,
          recordId: pkString,
        },
      });
    } catch (auditErr) {
      console.warn("[RecordService] Warning: Failed to log audit event:", auditErr);
    }

    return { success: true, deletedRecord };
  }
}
