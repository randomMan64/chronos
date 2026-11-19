import { db } from "@/db/connections/control-plane";
import { queryExecutions, savedQueries, databases } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { userDbManager, QueryResult } from "@/db/connections/user-database";
import { AuditService } from "@/modules/audit/audit-service";
import { TransactionService } from "@/modules/transactions/transaction-service";
import { UserContext } from "@/lib/permissions/types";

export interface ExecuteSqlInput {
  context: UserContext;
  databaseId: string;
  workspaceId: string;
  organizationId: string;
  sql: string;
  maxRows?: number;
  timeoutMs?: number;
}

const CONTROL_PLANE_TABLES = [
  "users",
  "user_sessions",
  "user_preferences",
  "organizations",
  "organization_members",
  "workspaces",
  "workspace_members",
  "databases",
  "database_permissions",
  "audit_logs",
  "query_executions",
  "saved_queries",
  "invitations",
];

const CONTROL_PLANE_REGEX = new RegExp(
  `\\b(${CONTROL_PLANE_TABLES.join("|")})\\b`,
  "i"
);

export class SqlService {
  public static async executeSql(input: ExecuteSqlInput): Promise<QueryResult> {
    // 1. Cross-tenant isolation: Verify database belongs to organization and workspace
    const [database] = await db
      .select()
      .from(databases)
      .where(
        and(
          eq(databases.id, input.databaseId),
          eq(databases.organizationId, input.organizationId),
          eq(databases.workspaceId, input.workspaceId)
        )
      )
      .limit(1);

    if (!database) {
      throw new Error("Database not found in this organization and workspace context");
    }

    // 2. Enforce query execution permission (e.g. Auditor roles without explicit grant are rejected)
    if (!input.context.effectivePermissions.has("query:execute")) {
      throw new Error(
        "Permission Denied: Missing 'query:execute' permission. Auditor roles cannot execute arbitrary queries."
      );
    }

    const trimmedSql = input.sql.trim();

    // 3. Security: Prevent access to CHRONOS internal control plane tables
    if (CONTROL_PLANE_REGEX.test(trimmedSql)) {
      throw new Error(
        "Security Violation: Access to CHRONOS internal control-plane tables is strictly prohibited."
      );
    }

    // 4. Modifying SQL check (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE)
    const isModifying = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i.test(
      trimmedSql
    );

    // If user is Analyst or lacks query:write permission, reject modifying queries
    const canWrite = input.context.effectivePermissions.has("query:write");
    if (isModifying && !canWrite) {
      throw new Error("Permission Denied: Your role is restricted to read-only queries.");
    }

    // 5. Force read-only transaction if caller lacks write permissions
    const forceReadOnly = !canWrite;

    // Apply strict statement limits
    const safeMaxRows = Math.min(Math.max(input.maxRows || 1000, 1), 5000);
    const safeTimeoutMs = Math.min(Math.max(input.timeoutMs || 30000, 1000), 60000);

    const traceId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const hasExplicitRollback = /\bROLLBACK\b/i.test(trimmedSql);
    const rawStatements = trimmedSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const start = Date.now();
    try {
      const result = await userDbManager.executeQuery(
        {
          id: database.id,
          connectionStringEncrypted: database.connectionStringEncrypted,
        },
        trimmedSql,
        {
          isReadOnly: forceReadOnly,
          maxRows: safeMaxRows,
          timeoutMs: safeTimeoutMs,
        }
      );

      // Record execution in control plane history
      await db.insert(queryExecutions).values({
        databaseId: database.id,
        workspaceId: input.workspaceId,
        userId: input.context.userId,
        queryText: trimmedSql,
        durationMs: result.durationMs,
        rowCount: result.rowCount,
        status: "success",
      });

      // Record transaction lifecycle event in control plane
      const status = hasExplicitRollback ? "rolled_back" : "committed";
      await TransactionService.recordTransaction({
        databaseId: database.id,
        transactionId: traceId,
        actorId: input.context.userId,
        actorEmail: input.context.email,
        status,
        queryText: trimmedSql,
        durationMs: result.durationMs,
        startedAt: new Date(start),
        endedAt: new Date(),
        metadata: {
          traceId,
          workspaceId: input.workspaceId,
          statementCount: rawStatements.length,
          rowsAffected: result.rowCount || 0,
          applicationName: "chronos-sql-gateway",
          statements: rawStatements.map((stmt, idx) => ({
            seq: idx + 1,
            operation: stmt.match(/^\s*([A-Za-z]+)\b/)?.[1]?.toUpperCase() || "SQL",
            sql: stmt,
            startedAt: new Date(start).toISOString(),
            endedAt: new Date().toISOString(),
            durationMs: Math.round(result.durationMs / (rawStatements.length || 1)),
            rowsAffected: idx === rawStatements.length - 1 ? result.rowCount : 0,
            status: "SUCCESS",
          })),
        },
      });

      // Audit modifying statements
      if (isModifying) {
        await AuditService.log({
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          databaseId: database.id,
          actorId: input.context.userId,
          actorEmail: input.context.email,
          action: "sql:execute_modifying",
          resourceType: "database_query",
          resourceId: database.id,
          metadata: {
            command: result.command,
            rowCount: result.rowCount,
            durationMs: result.durationMs,
            transactionId: traceId,
          },
        });
      }

      return { ...result, transactionId: traceId };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - start;

      // Record failure in history
      await db.insert(queryExecutions).values({
        databaseId: database.id,
        workspaceId: input.workspaceId,
        userId: input.context.userId,
        queryText: trimmedSql,
        durationMs,
        rowCount: 0,
        status: "error",
        errorMessage: errorMsg,
      });

      // Persist failure/rollback telemetry trace to control plane (guaranteed never rolled back)
      const isRollback = hasExplicitRollback || /rollback/i.test(errorMsg);
      await TransactionService.recordTransaction({
        databaseId: database.id,
        transactionId: traceId,
        actorId: input.context.userId,
        actorEmail: input.context.email,
        status: isRollback ? "rolled_back" : "failed",
        queryText: trimmedSql,
        durationMs,
        startedAt: new Date(start),
        endedAt: new Date(),
        metadata: {
          traceId,
          workspaceId: input.workspaceId,
          statementCount: rawStatements.length,
          rowsAffected: 0,
          applicationName: "chronos-sql-gateway",
          error: {
            message: errorMsg,
          },
          statements: rawStatements.map((stmt, idx) => ({
            seq: idx + 1,
            operation: stmt.match(/^\s*([A-Za-z]+)\b/)?.[1]?.toUpperCase() || "SQL",
            sql: stmt,
            startedAt: new Date(start).toISOString(),
            durationMs: Math.round(durationMs / (rawStatements.length || 1)),
            status: idx === rawStatements.length - 1 ? "ERROR" : "SUCCESS",
            errorMessage: idx === rawStatements.length - 1 ? errorMsg : undefined,
          })),
        },
      });

      throw err;
    }
  }

  public static async explainSql(input: {
    context: UserContext;
    databaseId: string;
    sql: string;
    analyze?: boolean;
  }) {
    const { database } = await import("@/lib/auth/guards").then((m) =>
      m.requireDatabaseAccessById(input.databaseId, "query:read")
    );

    const trimmedSql = input.sql.trim();

    if (CONTROL_PLANE_REGEX.test(trimmedSql)) {
      throw new Error(
        "Security Violation: Access to CHRONOS internal control-plane tables is strictly prohibited."
      );
    }

    const isAnalyze = Boolean(input.analyze);
    const isModifying = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(trimmedSql);

    // If EXPLAIN ANALYZE is requested on a modifying statement, require query:write
    if (isAnalyze && isModifying && !input.context.effectivePermissions.has("query:write")) {
      throw new Error("EXPLAIN ANALYZE on modifying statements requires write permissions");
    }

    const explainQuery = `EXPLAIN ${isAnalyze ? "(ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)" : "(FORMAT JSON)"} ${trimmedSql}`;

    return await userDbManager.executeQuery(
      {
        id: database.id,
        connectionStringEncrypted: database.connectionStringEncrypted,
      },
      explainQuery,
      { isReadOnly: !isModifying }
    );
  }

  public static async getQueryHistory(databaseId: string, limit = 50) {
    return await db
      .select()
      .from(queryExecutions)
      .where(eq(queryExecutions.databaseId, databaseId))
      .orderBy(desc(queryExecutions.executedAt))
      .limit(limit);
  }

  public static async saveQuery(params: {
    workspaceId: string;
    databaseId: string;
    userId: string;
    title: string;
    queryText: string;
    description?: string;
    isShared?: boolean;
  }) {
    const [saved] = await db
      .insert(savedQueries)
      .values({
        workspaceId: params.workspaceId,
        databaseId: params.databaseId,
        userId: params.userId,
        title: params.title,
        queryText: params.queryText,
        description: params.description,
        isShared: params.isShared || false,
      })
      .returning();

    return saved;
  }

  public static async getSavedQueries(workspaceId: string, userId: string) {
    return await db
      .select()
      .from(savedQueries)
      .where(
        and(
          eq(savedQueries.workspaceId, workspaceId),
          eq(savedQueries.userId, userId)
        )
      )
      .orderBy(desc(savedQueries.updatedAt));
  }
}
