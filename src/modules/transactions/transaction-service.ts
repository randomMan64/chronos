import { db } from "@/db/connections/control-plane";
import { transactionEvents, changeEvents, rowVersions, databases, workspaces } from "@/db/schema";
import { eq, and, desc, gte, lte, sql, ilike, or } from "drizzle-orm";
import { userDbManager } from "@/db/connections/user-database";
import { UserContext } from "@/lib/permissions/types";
import { TransactionAuthorization } from "./transaction-authorization";

export interface TransactionSummaryMetrics {
  totalCount: number;
  committedCount: number;
  rolledBackCount: number;
  failedCount: number;
  activeCount: number;
  avgDurationMs: number;
  longRunningCount: number;
  lockWaitingCount: number;
}

export interface StatementTraceItem {
  seq: number;
  operation: string;
  sql: string;
  startedAt: string;
  endedAt?: string;
  durationMs: number;
  rowCount?: number;
  rowsAffected?: number;
  status: "SUCCESS" | "ERROR";
  errorCode?: string;
  errorMessage?: string;
  table?: string;
}

export interface MutationTraceItem {
  id: string;
  tableName: string;
  schemaName?: string;
  recordId: string;
  operation: "INSERT" | "UPDATE" | "DELETE" | "RESTORE";
  previousValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
  versionNumber: number;
  actor: string;
  timestamp: string;
  status: "COMMITTED" | "ATTEMPTED_DISCARDED";
  timeTravelUrl: string;
}

export interface TimelineEventItem {
  seq: number;
  timestamp: string;
  type: "BEGIN" | "STATEMENT" | "MUTATION" | "ERROR" | "COMMIT" | "ROLLBACK";
  label: string;
  details?: string;
  durationMs?: number;
  rowsAffected?: number;
  status: "SUCCESS" | "FAILED" | "DISCARDED";
  isFailureCause?: boolean;
}

export class TransactionService {
  /**
   * Calculates overview aggregation metrics for the selected database and time window.
   */
  public static async getOverview(params: {
    databaseId: string;
    range?: "15m" | "1h" | "24h" | "7d" | "30d" | "custom";
    startDate?: Date;
    endDate?: Date;
    context: UserContext;
  }): Promise<{
    metrics: TransactionSummaryMetrics;
    windowStart: string;
    windowEnd: string;
  }> {
    const policy = TransactionAuthorization.resolvePolicy(params.context);

    // Compute window boundaries
    const now = new Date();
    let windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000); // default 24h
    let windowEnd = now;

    if (params.range === "15m") {
      windowStart = new Date(now.getTime() - 15 * 60 * 1000);
    } else if (params.range === "1h") {
      windowStart = new Date(now.getTime() - 60 * 60 * 1000);
    } else if (params.range === "24h") {
      windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (params.range === "7d") {
      windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (params.range === "30d") {
      windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (params.range === "custom" && params.startDate && params.endDate) {
      windowStart = params.startDate;
      windowEnd = params.endDate;
    }

    const conditions = [
      eq(transactionEvents.databaseId, params.databaseId),
      gte(transactionEvents.startedAt, windowStart),
      lte(transactionEvents.startedAt, windowEnd),
    ];

    // Scoped access: Data Analyst only views their own queries
    if (policy.isOwnOnly) {
      conditions.push(eq(transactionEvents.actorId, params.context.userId));
    }

    const txRows = await db
      .select({
        status: transactionEvents.status,
        durationMs: transactionEvents.durationMs,
        startedAt: transactionEvents.startedAt,
      })
      .from(transactionEvents)
      .where(and(...conditions));

    let totalCount = txRows.length;
    let committedCount = 0;
    let rolledBackCount = 0;
    let failedCount = 0;
    let activeCount = 0;
    let totalDuration = 0;
    let longRunningCount = 0;

    for (const tx of txRows) {
      const dur = tx.durationMs || 0;
      totalDuration += dur;
      if (dur > 5000) longRunningCount++;

      const s = (tx.status || "").toLowerCase();
      if (s === "committed") committedCount++;
      else if (s === "rolled_back" || s === "aborted") rolledBackCount++;
      else if (s === "failed") failedCount++;
      else if (s === "started" || s === "active") activeCount++;
    }

    const avgDurationMs = totalCount > 0 ? Math.round(totalDuration / totalCount) : 0;

    // Check lock waiting count from live database if authorized
    let lockWaitingCount = 0;
    if (policy.canViewLiveLocks) {
      try {
        const live = await this.getLiveActivity(params.databaseId);
        lockWaitingCount = live.filter(
          (s: any) => s.wait_event_type === "Lock" || (s.wait_event && s.wait_event.toLowerCase().includes("lock"))
        ).length;
      } catch {
        lockWaitingCount = 0;
      }
    }

    return {
      metrics: {
        totalCount,
        committedCount,
        rolledBackCount,
        failedCount,
        activeCount,
        avgDurationMs,
        longRunningCount,
        lockWaitingCount,
      },
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  }

  /**
   * Retrieves paginated transactions with lifecycle attributes, actor filtering, and duration thresholds.
   */
  public static async getTransactions(params: {
    databaseId: string;
    status?: string;
    actor?: string;
    search?: string;
    minDurationMs?: number;
    startDate?: Date;
    endDate?: Date;
    sortBy?: "startedAt" | "durationMs" | "status";
    sortOrder?: "asc" | "desc";
    limit?: number;
    offset?: number;
    context: UserContext;
  }) {
    const policy = TransactionAuthorization.resolvePolicy(params.context);

    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    const conditions = [eq(transactionEvents.databaseId, params.databaseId)];

    // Scoped access enforcement
    if (policy.isOwnOnly) {
      conditions.push(eq(transactionEvents.actorId, params.context.userId));
    } else if (params.actor) {
      conditions.push(
        or(
          eq(transactionEvents.actorId, params.actor),
          ilike(transactionEvents.actorEmail, `%${params.actor}%`)
        )!
      );
    }

    if (params.status && params.status !== "all") {
      conditions.push(eq(transactionEvents.status, params.status.toLowerCase()));
    }

    if (params.minDurationMs && params.minDurationMs > 0) {
      conditions.push(gte(transactionEvents.durationMs, params.minDurationMs));
    }

    if (params.startDate) {
      conditions.push(gte(transactionEvents.startedAt, params.startDate));
    }
    if (params.endDate) {
      conditions.push(lte(transactionEvents.startedAt, params.endDate));
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(transactionEvents.transactionId, q),
          ilike(transactionEvents.queryText, q),
          ilike(transactionEvents.actorEmail, q)
        )!
      );
    }

    const whereClause = and(...conditions);

    // Count total matches
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactionEvents)
      .where(whereClause);

    // Ordering
    const orderCol =
      params.sortBy === "durationMs"
        ? transactionEvents.durationMs
        : params.sortBy === "status"
        ? transactionEvents.status
        : transactionEvents.startedAt;

    const orderExpr = params.sortOrder === "asc" ? orderCol : desc(orderCol);

    const rows = await db
      .select()
      .from(transactionEvents)
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(limit)
      .offset(offset);

    // Sanitize sensitive query text where required
    const sanitizedItems = rows.map((tx) => {
      const isOwn = params.context.userId === tx.actorId;
      const safeQuery = TransactionAuthorization.maskSensitiveSql(
        tx.queryText,
        params.context,
        tx.actorId
      );

      const meta = (tx.metadata || {}) as Record<string, any>;
      const statementCount = meta.statementCount || (tx.queryText ? tx.queryText.split(";").filter((s) => s.trim().length > 0).length : 1);
      const rowsAffected = meta.rowsAffected || 0;

      return {
        id: tx.id,
        databaseId: tx.databaseId,
        transactionId: tx.transactionId,
        actorId: tx.actorId,
        actorEmail: tx.actorEmail,
        status: tx.status.toUpperCase(),
        queryText: safeQuery,
        durationMs: tx.durationMs || 0,
        startedAt: tx.startedAt.toISOString(),
        endedAt: tx.endedAt ? tx.endedAt.toISOString() : undefined,
        statementCount,
        rowsAffected,
        applicationName: meta.applicationName || "chronos-sql-gateway",
        hasError: tx.status === "failed" || tx.status === "rolled_back" || Boolean(meta.error),
        errorMessage: meta.error?.message,
        isOwn,
      };
    });

    return {
      items: sanitizedItems,
      totalCount: count,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(count / limit) || 1,
      policy,
    };
  }

  /**
   * Detailed Transaction Investigation view:
   * Returns transaction summary, timeline sequence, statement breakdowns, Time Travel mutations, and outcome diagnostics.
   */
  public static async getTransactionDetails(transactionId: string, context: UserContext) {
    const policy = TransactionAuthorization.resolvePolicy(context);

    const [tx] = await db
      .select()
      .from(transactionEvents)
      .where(eq(transactionEvents.transactionId, transactionId))
      .limit(1);

    if (!tx) return null;

    // Scoped security enforcement: Data Analyst cannot inspect other users' transactions
    if (policy.isOwnOnly && tx.actorId !== context.userId) {
      throw new Error("Forbidden: You are only authorized to inspect your own transactions.");
    }

    const meta = (tx.metadata || {}) as Record<string, any>;

    // 1. Fetch Correlated Mutations from Time Travel (row_versions table)
    const capturedRowVersions = await db
      .select()
      .from(rowVersions)
      .where(
        or(
          eq(rowVersions.transactionId, tx.transactionId),
          and(
            eq(rowVersions.databaseId, tx.databaseId),
            gte(rowVersions.changedAt, new Date(tx.startedAt.getTime() - 2000)),
            lte(rowVersions.changedAt, new Date((tx.endedAt || tx.startedAt).getTime() + 2000))
          )
        )
      )
      .orderBy(desc(rowVersions.changedAt))
      .limit(50);

    const isCommitted = tx.status.toLowerCase() === "committed";

    const mutations: MutationTraceItem[] = capturedRowVersions.map((v) => ({
      id: v.id,
      tableName: v.tableName,
      schemaName: v.schemaName || "public",
      recordId: v.recordId,
      operation: v.operation as any,
      previousValues: v.oldData,
      newValues: v.newData,
      diff: v.diff,
      versionNumber: v.versionNumber,
      actor: v.changedBy,
      timestamp: v.changedAt.toISOString(),
      status: isCommitted ? "COMMITTED" : "ATTEMPTED_DISCARDED",
      timeTravelUrl: `/temporal?databaseId=${tx.databaseId}&table=${v.tableName}&recordId=${encodeURIComponent(v.recordId)}`,
    }));

    // 2. Build Structured Statement Traces
    let statements: StatementTraceItem[] = [];
    if (meta.statements && Array.isArray(meta.statements) && meta.statements.length > 0) {
      statements = meta.statements.map((s: any, idx: number) => ({
        seq: s.seq || idx + 1,
        operation: s.operation || s.command || "QUERY",
        sql: TransactionAuthorization.maskSensitiveSql(s.sql, context, tx.actorId),
        startedAt: s.startedAt || tx.startedAt.toISOString(),
        endedAt: s.endedAt,
        durationMs: s.durationMs || 0,
        rowCount: s.rowCount,
        rowsAffected: s.rowsAffected,
        status: s.status === "ERROR" ? "ERROR" : "SUCCESS",
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        table: s.table,
      }));
    } else if (tx.queryText) {
      // Reconstruct statement sequence from queryText
      const rawStatements = tx.queryText
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      statements = rawStatements.map((stmt, idx) => {
        const opMatch = stmt.match(/^\s*([A-Za-z]+)\b/);
        const op = opMatch ? opMatch[1].toUpperCase() : "SQL";
        const hasErr = idx === rawStatements.length - 1 && (tx.status === "failed" || tx.status === "rolled_back");

        return {
          seq: idx + 1,
          operation: op,
          sql: TransactionAuthorization.maskSensitiveSql(stmt, context, tx.actorId),
          startedAt: tx.startedAt.toISOString(),
          endedAt: tx.endedAt?.toISOString(),
          durationMs: idx === 0 ? (tx.durationMs || 0) : 0,
          status: hasErr ? "ERROR" : "SUCCESS",
          errorCode: hasErr ? meta.error?.code : undefined,
          errorMessage: hasErr ? meta.error?.message : undefined,
        };
      });
    }

    // 3. Build Chronological Lifecycle Timeline
    const timeline: TimelineEventItem[] = [];
    let seqCounter = 1;

    timeline.push({
      seq: seqCounter++,
      timestamp: tx.startedAt.toISOString(),
      type: "BEGIN",
      label: "BEGIN TRANSACTION",
      details: "Transaction boundary initiated via CHRONOS SQL Gateway",
      durationMs: 0,
      status: "SUCCESS",
    });

    for (const stmt of statements) {
      const isFailed = stmt.status === "ERROR";
      timeline.push({
        seq: seqCounter++,
        timestamp: stmt.startedAt,
        type: "STATEMENT",
        label: `${stmt.operation} Statement`,
        details: stmt.sql,
        durationMs: stmt.durationMs,
        rowsAffected: stmt.rowsAffected,
        status: isFailed ? "FAILED" : "SUCCESS",
        isFailureCause: isFailed,
      });

      if (isFailed && stmt.errorMessage) {
        timeline.push({
          seq: seqCounter++,
          timestamp: stmt.endedAt || stmt.startedAt,
          type: "ERROR",
          label: `SQL Error (${stmt.errorCode || "42000"})`,
          details: stmt.errorMessage,
          status: "FAILED",
          isFailureCause: true,
        });
      }
    }

    for (const m of mutations) {
      timeline.push({
        seq: seqCounter++,
        timestamp: m.timestamp,
        type: "MUTATION",
        label: `${m.operation} ${m.tableName} (record: ${m.recordId})`,
        details: isCommitted
          ? `Persisted as version v${m.versionNumber}`
          : "Mutation discarded due to transaction rollback",
        status: isCommitted ? "SUCCESS" : "DISCARDED",
      });
    }

    if (isCommitted) {
      timeline.push({
        seq: seqCounter++,
        timestamp: (tx.endedAt || tx.startedAt).toISOString(),
        type: "COMMIT",
        label: "COMMIT TRANSACTION",
        details: "All row modifications permanently persisted to database storage",
        status: "SUCCESS",
      });
    } else {
      timeline.push({
        seq: seqCounter++,
        timestamp: (tx.endedAt || tx.startedAt).toISOString(),
        type: "ROLLBACK",
        label: "ROLLBACK TRANSACTION",
        details: meta.error
          ? `Rollback triggered by error in statement: ${meta.error.message || "Execution exception"}`
          : "Explicit or client-initiated ROLLBACK executed. All modifications discarded.",
        status: "DISCARDED",
        isFailureCause: true,
      });
    }

    // 4. Outcome Diagnostics Explanation
    let outcomeExplanation = "";
    if (isCommitted) {
      outcomeExplanation = `Transaction committed successfully in ${tx.durationMs}ms. All statements completed without errors, and ${mutations.length} mutations were permanently applied to table storage.`;
    } else if (tx.status === "rolled_back" || tx.status === "aborted") {
      outcomeExplanation = `Transaction rolled back. Any mutations attempted during this transaction were discarded, and database integrity was preserved. No persistent storage changes were written.`;
    } else {
      outcomeExplanation = `Transaction execution failed with error: ${meta.error?.message || "Execution failure"}. All pending operations were rolled back.`;
    }

    return {
      transaction: {
        id: tx.id,
        transactionId: tx.transactionId,
        postgresXid: meta.postgresXid || null,
        traceId: meta.traceId || tx.transactionId,
        databaseId: tx.databaseId,
        workspaceId: meta.workspaceId || null,
        actorId: tx.actorId,
        actorEmail: tx.actorEmail,
        applicationName: meta.applicationName || "chronos-sql-gateway",
        clientIp: policy.canReadSensitiveSql ? meta.clientIp || null : null,
        status: tx.status.toUpperCase(),
        startedAt: tx.startedAt.toISOString(),
        endedAt: tx.endedAt ? tx.endedAt.toISOString() : undefined,
        durationMs: tx.durationMs || 0,
        statementCount: statements.length,
        rowsAffected: meta.rowsAffected || 0,
        queryText: TransactionAuthorization.maskSensitiveSql(tx.queryText, context, tx.actorId),
      },
      timeline,
      statements,
      mutations,
      outcome: {
        status: tx.status.toUpperCase(),
        isCommitted,
        isRolledBack: tx.status === "rolled_back" || tx.status === "aborted",
        isFailed: tx.status === "failed",
        error: meta.error || null,
        explanation: outcomeExplanation,
        changesPersisted: isCommitted,
      },
      policy,
    };
  }

  /**
   * Introspects live PostgreSQL transactions, blocking graphs, and lock diagnostic relationships.
   */
  public static async getLiveTransactionsAndLocks(databaseId: string, context: UserContext) {
    const policy = TransactionAuthorization.resolvePolicy(context);

    if (!policy.canViewLiveSessions && !policy.canViewLiveLocks) {
      throw new Error("Permission denied: You do not have permission to view live transactions or locks.");
    }

    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    // 1. Live sessions from pg_stat_activity
    const sessionsSql = `
      SELECT 
        pid,
        usename,
        client_addr::text as client_ip,
        application_name,
        state,
        xact_start,
        query_start,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - xact_start)) * 1000, 0)::int as xact_age_ms,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000, 0)::int as duration_ms,
        query,
        wait_event_type,
        wait_event,
        backend_xid::text as xid,
        backend_xmin::text as xmin,
        pg_blocking_pids(pid) as blocking_pids
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND datname = current_database()
      ORDER BY xact_age_ms DESC, duration_ms DESC
      LIMIT 100;
    `;

    // 2. Lock graph from pg_locks joined with pg_class
    const locksSql = `
      SELECT 
        l.pid,
        l.locktype,
        l.mode,
        l.granted,
        COALESCE(c.relname, 'non-relational') as relation_name,
        COALESCE(n.nspname, 'public') as schema_name,
        l.transactionid::text as lock_txid
      FROM pg_locks l
      LEFT JOIN pg_class c ON l.relation = c.oid
      LEFT JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE l.pid <> pg_backend_pid()
      ORDER BY l.granted ASC, l.pid ASC
      LIMIT 150;
    `;

    let sessionsRows: any[] = [];
    let locksRows: any[] = [];

    try {
      const sessRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        sessionsSql,
        { isReadOnly: true }
      );
      sessionsRows = sessRes.rows || [];
    } catch {
      sessionsRows = [];
    }

    try {
      const lockRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        locksSql,
        { isReadOnly: true }
      );
      locksRows = lockRes.rows || [];
    } catch {
      locksRows = [];
    }

    // Build map of sessions by PID
    const sessionMap = new Map<number, any>();
    for (const s of sessionsRows) {
      sessionMap.set(s.pid, s);
    }

    // Build blocking relationships graph
    const blockingGraph: Array<{
      blockerPid: number;
      blockerUser: string;
      blockerQuery: string;
      blockedPid: number;
      blockedUser: string;
      blockedQuery: string;
      waitEvent: string;
      waitingDurationMs: number;
      lockType?: string;
      relationName?: string;
    }> = [];

    for (const s of sessionsRows) {
      const blockingPids = Array.isArray(s.blocking_pids) ? s.blocking_pids : [];
      if (blockingPids.length > 0) {
        for (const blockerPid of blockingPids) {
          const blocker = sessionMap.get(blockerPid);
          const relatedLock = locksRows.find((l) => l.pid === blockerPid && l.granted);

          blockingGraph.push({
            blockerPid,
            blockerUser: blocker?.usename || "unknown",
            blockerQuery: TransactionAuthorization.maskSensitiveSql(blocker?.query || "idle in transaction", context),
            blockedPid: s.pid,
            blockedUser: s.usename || "unknown",
            blockedQuery: TransactionAuthorization.maskSensitiveSql(s.query, context),
            waitEvent: `${s.wait_event_type || "Lock"}: ${s.wait_event || "exclusive"}`,
            waitingDurationMs: s.duration_ms || s.xact_age_ms || 0,
            lockType: relatedLock?.mode || "ExclusiveLock",
            relationName: relatedLock?.relation_name || "table/relation",
          });
        }
      }
    }

    // Mask queries in sessions if required
    const sanitizedSessions = sessionsRows.map((s) => ({
      pid: s.pid,
      usename: s.usename,
      clientIp: policy.canReadSensitiveSql ? s.client_ip : null,
      applicationName: s.application_name,
      state: s.state,
      xactStart: s.xact_start,
      queryStart: s.query_start,
      xactAgeMs: s.xact_age_ms,
      durationMs: s.duration_ms,
      waitEventType: s.wait_event_type,
      waitEvent: s.wait_event,
      xid: s.xid,
      xmin: s.xmin,
      blockingPids: s.blocking_pids || [],
      isBlocked: Array.isArray(s.blocking_pids) && s.blocking_pids.length > 0,
      query: TransactionAuthorization.maskSensitiveSql(s.query, context),
    }));

    return {
      sessions: sanitizedSessions,
      locks: locksRows,
      blockingGraph,
      uninstrumentedNotice:
        "Direct client connections bypassing the CHRONOS SQL Gateway are monitored via PostgreSQL pg_stat_activity and pg_locks. Note: Historical lifecycle statement tracing and mutation correlation are exclusively available for Gateway-managed transactions.",
      policy,
    };
  }

  /**
   * Safely terminates a PostgreSQL backend session, requiring explicit authorization.
   */
  public static async terminateSession(databaseId: string, pid: number, context: UserContext): Promise<{ success: boolean; pid: number }> {
    const policy = TransactionAuthorization.resolvePolicy(context);

    if (!policy.canTerminateSession) {
      throw new Error("Permission denied: Your role is not permitted to terminate database sessions.");
    }

    if (!pid || pid <= 0) {
      throw new Error("Invalid PID specified.");
    }

    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    // Guard: Prevent terminating our own backend worker
    const sql = `
      SELECT pg_terminate_backend($1) as terminated
      WHERE $1 <> pg_backend_pid();
    `;

    const res = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      sql,
      { params: [pid] }
    );

    const terminated = Boolean(res.rows[0]?.terminated);
    return { success: terminated, pid };
  }

  /**
   * Low-level helper to query live connection rows.
   */
  public static async getLiveActivity(databaseId: string) {
    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    const sql = `
      SELECT 
        pid,
        usename,
        client_addr::text as client_ip,
        application_name,
        state,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000, 0)::int as duration_ms,
        query,
        wait_event_type,
        wait_event
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND datname = current_database()
      ORDER BY duration_ms DESC
      LIMIT 50;
    `;

    try {
      const res = await userDbManager.executeQuery(
        {
          id: database.id,
          connectionStringEncrypted: database.connectionStringEncrypted,
        },
        sql,
        { isReadOnly: true }
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  /**
   * Records a complete transaction lifecycle event to the control plane.
   */
  public static async recordTransaction(params: {
    databaseId: string;
    transactionId: string;
    actorId?: string;
    actorEmail?: string;
    status: "started" | "committed" | "rolled_back" | "failed" | "aborted";
    queryText?: string;
    durationMs?: number;
    startedAt?: Date;
    endedAt?: Date;
    metadata?: Record<string, unknown>;
  }) {
    const [recorded] = await db
      .insert(transactionEvents)
      .values({
        databaseId: params.databaseId,
        transactionId: params.transactionId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        status: params.status,
        queryText: params.queryText,
        durationMs: params.durationMs || 0,
        startedAt: params.startedAt || new Date(),
        endedAt: params.endedAt || new Date(),
        metadata: params.metadata || {},
      })
      .returning();

    return recorded;
  }
}
