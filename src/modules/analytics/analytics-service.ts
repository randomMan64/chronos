import { db } from "@/db/connections/control-plane";
import { queryExecutions, databases } from "@/db/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { userDbManager } from "@/db/connections/user-database";
import { PerformanceAuthorization } from "./performance-authorization";
import { UserContext } from "@/lib/permissions/types";

export interface DatabaseCapabilities {
  pgStatStatementsInstalled: boolean;
  pgStatStatementsAccessible: boolean;
  pgVersion: string;
  trackIoTiming: boolean;
  maxConnections: number;
  collectionTime: string;
}

export interface PerformanceOverviewMetrics {
  totalQueriesTracked: number;
  queriesInTimeRange: number;
  averageExecutionDurationMs: number;
  slowQueriesCount: number;
  failedQueriesCount: number;
  peakExecutionDurationMs: number;
  activeConnections: number;
  totalConnections: number;
  maxConnections: number;
  connectionUtilizationPercent: number;
  cacheHitRatioPercent: number | null;
  pgStatStatementsActive: boolean;
  timeRange: { start: string; end: string };
  collectionTime: string;
  source: string;
}

export interface QueryPerformanceEntry {
  queryId: string;
  normalizedSql: string;
  calls: number;
  totalDurationMs: number;
  meanDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  rowsReturned: number;
  cacheHitRatioPercent: number | null;
  lastExecutionTime: string | null;
  source: "pg_stat_statements" | "sql_gateway";
  userId?: string | null;
}

export interface IndexStatisticEntry {
  schema: string;
  table: string;
  indexName: string;
  indexType: string;
  sizeBytes: number;
  sizePretty: string;
  scansCount: number;
  tuplesRead: number;
  tuplesFetched: number;
  isValid: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isUnusedCandidate: boolean;
  isHighUsage: boolean;
  isLargeIndex: boolean;
  definition?: string;
}

export interface LiveSessionEntry {
  pid: number;
  username: string;
  applicationName: string;
  clientAddress: string | null;
  backendStart: string;
  queryStart: string | null;
  stateChange: string | null;
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
  query: string;
  durationSeconds: number;
  blockingPids: number[];
  blockedByPids: number[];
}

export interface TableStatisticEntry {
  schema: string;
  tableName: string;
  liveTuples: number;
  deadTuples: number;
  deadTupleRatioPercent: number;
  tableSizeBytes: number;
  tableSizePretty: string;
  indexSizeBytes: number;
  indexSizePretty: string;
  totalSizeBytes: number;
  totalSizePretty: string;
  sequentialScans: number;
  sequentialTuplesRead: number;
  indexScans: number;
  indexTuplesFetched: number;
  lastVacuum: string | null;
  lastAutoVacuum: string | null;
  lastAnalyze: string | null;
  lastAutoAnalyze: string | null;
  needsVacuum: boolean;
}

export interface DiagnosticRecommendation {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "index" | "query" | "storage" | "connection" | "configuration";
  finding: string;
  evidence: string;
  affectedResource: string;
  suggestedAction: string;
  expectedBenefit: string;
  sqlRemediation?: string;
}

export class AnalyticsService {
  private static async getDatabaseRecord(databaseId: string) {
    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!database) {
      throw new Error(`Database with ID ${databaseId} not found`);
    }
    return database;
  }

  /**
   * Probes PostgreSQL capabilities, extension status, and configurations.
   */
  public static async probeCapabilities(databaseId: string): Promise<DatabaseCapabilities> {
    const database = await this.getDatabaseRecord(databaseId);

    let pgStatStatementsInstalled = false;
    let pgStatStatementsAccessible = false;
    let pgVersion = "PostgreSQL (unknown)";
    let trackIoTiming = false;
    let maxConnections = 100;

    try {
      const verRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `SELECT version();`,
        { isReadOnly: true, timeoutMs: 3000 }
      );
      if (verRes.rows[0]?.version) {
        pgVersion = String(verRes.rows[0].version);
      }
    } catch {
      // Fallback
    }

    try {
      const extRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';`,
        { isReadOnly: true, timeoutMs: 3000 }
      );
      pgStatStatementsInstalled = extRes.rows.length > 0;
    } catch {
      pgStatStatementsInstalled = false;
    }

    if (pgStatStatementsInstalled) {
      try {
        await userDbManager.executeQuery(
          { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
          `SELECT queryid FROM pg_stat_statements LIMIT 1;`,
          { isReadOnly: true, timeoutMs: 3000 }
        );
        pgStatStatementsAccessible = true;
      } catch {
        pgStatStatementsAccessible = false;
      }
    }

    try {
      const ioRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `SHOW track_io_timing;`,
        { isReadOnly: true, timeoutMs: 3000 }
      );
      trackIoTiming = String(ioRes.rows[0]?.track_io_timing || "").toLowerCase() === "on";
    } catch {
      trackIoTiming = false;
    }

    try {
      const maxConnRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `SHOW max_connections;`,
        { isReadOnly: true, timeoutMs: 3000 }
      );
      maxConnections = parseInt(String(maxConnRes.rows[0]?.max_connections || "100"), 10) || 100;
    } catch {
      maxConnections = 100;
    }

    return {
      pgStatStatementsInstalled,
      pgStatStatementsAccessible,
      pgVersion,
      trackIoTiming,
      maxConnections,
      collectionTime: new Date().toISOString(),
    };
  }

  /**
   * Retrieves high-level performance overview metrics combining live PostgreSQL catalogs and SQL Gateway records.
   */
  public static async getPerformanceOverview(
    databaseId: string,
    timeRange?: { start?: Date; end?: Date }
  ): Promise<PerformanceOverviewMetrics> {
    const database = await this.getDatabaseRecord(databaseId);
    const now = new Date();
    const startDate = timeRange?.start || new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endDate = timeRange?.end || now;

    // 1. Query Gateway execution stats for time range
    const gatewayWhereConditions = [
      eq(queryExecutions.databaseId, databaseId),
      gte(queryExecutions.executedAt, startDate),
      lte(queryExecutions.executedAt, endDate),
    ];

    const [statsResult] = await db
      .select({
        count: sql<number>`count(*)`,
        avgDuration: sql<number>`coalesce(avg(${queryExecutions.durationMs}), 0)`,
        maxDuration: sql<number>`coalesce(max(${queryExecutions.durationMs}), 0)`,
        slowCount: sql<number>`count(case when ${queryExecutions.durationMs} >= 100 then 1 end)`,
        failedCount: sql<number>`count(case when ${queryExecutions.status} = 'failed' then 1 end)`,
      })
      .from(queryExecutions)
      .where(and(...gatewayWhereConditions));

    const totalTrackedRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(queryExecutions)
      .where(eq(queryExecutions.databaseId, databaseId));

    const totalQueriesTracked = Number(totalTrackedRes[0]?.count || 0);
    const queriesInTimeRange = Number(statsResult?.count || 0);
    const averageExecutionDurationMs = Math.round(Number(statsResult?.avgDuration || 0) * 10) / 10;
    const peakExecutionDurationMs = Number(statsResult?.maxDuration || 0);
    const slowQueriesCount = Number(statsResult?.slowCount || 0);
    const failedQueriesCount = Number(statsResult?.failedCount || 0);

    // 2. Fetch Live PostgreSQL Statistics (Connections and Cache Hit Ratio)
    let activeConnections = 0;
    let totalConnections = 0;
    let maxConnections = 100;
    let cacheHitRatioPercent: number | null = null;
    let pgStatStatementsActive = false;

    try {
      const connRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `
        SELECT 
          count(*) filter (where state = 'active') as active_count,
          count(*) as total_count,
          current_setting('max_connections')::int as max_conn
        FROM pg_stat_activity 
        WHERE backend_type = 'client backend';
        `,
        { isReadOnly: true, timeoutMs: 4000 }
      );

      if (connRes.rows[0]) {
        activeConnections = Number(connRes.rows[0].active_count || 0);
        totalConnections = Number(connRes.rows[0].total_count || 0);
        maxConnections = Number(connRes.rows[0].max_conn || 100);
      }
    } catch {
      // User DB might be temporarily sleeping or pool restricted
    }

    try {
      const cacheRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `
        SELECT 
          round(
            (sum(blks_hit) * 100.0 / nullif(sum(blks_hit) + sum(blks_read), 0))::numeric, 
            2
          ) as cache_hit_ratio
        FROM pg_stat_database 
        WHERE datname = current_database();
        `,
        { isReadOnly: true, timeoutMs: 4000 }
      );

      if (cacheRes.rows[0]?.cache_hit_ratio !== null && cacheRes.rows[0]?.cache_hit_ratio !== undefined) {
        cacheHitRatioPercent = Number(cacheRes.rows[0].cache_hit_ratio);
      }
    } catch {
      // Cache hit ratio query unavailable
    }

    // Check pg_stat_statements
    try {
      const extCheck = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';`,
        { isReadOnly: true, timeoutMs: 2000 }
      );
      pgStatStatementsActive = extCheck.rows.length > 0;
    } catch {
      pgStatStatementsActive = false;
    }

    const connectionUtilizationPercent = maxConnections > 0
      ? Math.round((activeConnections / maxConnections) * 1000) / 10
      : 0;

    return {
      totalQueriesTracked,
      queriesInTimeRange,
      averageExecutionDurationMs,
      slowQueriesCount,
      failedQueriesCount,
      peakExecutionDurationMs,
      activeConnections,
      totalConnections,
      maxConnections,
      connectionUtilizationPercent,
      cacheHitRatioPercent,
      pgStatStatementsActive,
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      collectionTime: now.toISOString(),
      source: "PostgreSQL pg_stat_activity, pg_stat_database & CHRONOS Gateway",
    };
  }

  /**
   * Retrieves detailed query performance records.
   * Prefers pg_stat_statements when available, otherwise falls back to CHRONOS Gateway execution logs.
   */
  public static async getQueryPerformance(
    databaseId: string,
    options: {
      timeRange?: { start?: Date; end?: Date };
      minDurationMs?: number;
      search?: string;
      limit?: number;
      context: UserContext;
    }
  ): Promise<QueryPerformanceEntry[]> {
    const database = await this.getDatabaseRecord(databaseId);
    const limit = options.limit || 50;
    const policy = PerformanceAuthorization.resolvePolicy(options.context);

    // If pg_stat_statements is accessible, attempt to read engine aggregated statistics
    let pssEntries: QueryPerformanceEntry[] = [];
    try {
      const sqlQuery = `
        SELECT 
          queryid::text as query_id,
          query as normalized_sql,
          calls,
          round(total_exec_time::numeric, 2) as total_duration_ms,
          round(mean_exec_time::numeric, 2) as mean_duration_ms,
          round(min_exec_time::numeric, 2) as min_duration_ms,
          round(max_exec_time::numeric, 2) as max_duration_ms,
          rows as rows_returned,
          round(
            (shared_blks_hit * 100.0 / nullif(shared_blks_hit + shared_blks_read, 0))::numeric, 
            2
          ) as cache_hit_ratio
        FROM pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat_statements%'
          AND query NOT ILIKE '%pg_stat_activity%'
          ${options.minDurationMs ? `AND mean_exec_time >= ${Number(options.minDurationMs)}` : ""}
          ${options.search ? `AND query ILIKE '%${options.search.replace(/'/g, "''")}%'` : ""}
        ORDER BY total_exec_time DESC
        LIMIT ${limit};
      `;

      const pssRes = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        sqlQuery,
        { isReadOnly: true, timeoutMs: 5000 }
      );

      pssEntries = pssRes.rows.map((row) => {
        const rawSql = String(row.normalized_sql || "");
        const maskedSql = PerformanceAuthorization.maskSensitiveQuery(rawSql, options.context, null);
        return {
          queryId: String(row.query_id || "unknown"),
          normalizedSql: maskedSql,
          calls: Number(row.calls || 0),
          totalDurationMs: Number(row.total_duration_ms || 0),
          meanDurationMs: Number(row.mean_duration_ms || 0),
          minDurationMs: Number(row.min_duration_ms || 0),
          maxDurationMs: Number(row.max_duration_ms || 0),
          rowsReturned: Number(row.rows_returned || 0),
          cacheHitRatioPercent: row.cache_hit_ratio !== null ? Number(row.cache_hit_ratio) : null,
          lastExecutionTime: null,
          source: "pg_stat_statements" as const,
          userId: null,
        };
      });
    } catch {
      pssEntries = [];
    }

    // If pg_stat_statements returned results, return them
    if (pssEntries.length > 0) {
      return pssEntries;
    }

    // Fallback: Read from SQL Gateway queryExecutions table
    const whereConditions = [eq(queryExecutions.databaseId, databaseId)];

    if (policy.isOwnQueryOnly) {
      whereConditions.push(eq(queryExecutions.userId, options.context.userId));
    }

    if (options.timeRange?.start) {
      whereConditions.push(gte(queryExecutions.executedAt, options.timeRange.start));
    }
    if (options.timeRange?.end) {
      whereConditions.push(lte(queryExecutions.executedAt, options.timeRange.end));
    }
    if (options.minDurationMs) {
      whereConditions.push(gte(queryExecutions.durationMs, options.minDurationMs));
    }

    const gatewayExecutions = await db
      .select()
      .from(queryExecutions)
      .where(and(...whereConditions))
      .orderBy(desc(queryExecutions.durationMs))
      .limit(limit);

    return gatewayExecutions.map((exec) => {
      const maskedSql = PerformanceAuthorization.maskSensitiveQuery(
        exec.queryText,
        options.context,
        exec.userId
      );
      return {
        queryId: exec.id,
        normalizedSql: maskedSql,
        calls: 1,
        totalDurationMs: exec.durationMs || 0,
        meanDurationMs: exec.durationMs || 0,
        minDurationMs: exec.durationMs || 0,
        maxDurationMs: exec.durationMs || 0,
        rowsReturned: exec.rowCount || 0,
        cacheHitRatioPercent: null,
        lastExecutionTime: exec.executedAt.toISOString(),
        source: "sql_gateway" as const,
        userId: exec.userId,
      };
    });
  }

  /**
   * Generates EXPLAIN execution plan with safeguards.
   * If analyze is true, enforces strict timeout (10s), permissions, and blocks DDL/DROP statements.
   */
  public static async explainQuery(
    databaseId: string,
    query: string,
    analyze: boolean,
    context: UserContext
  ): Promise<{ plan: unknown; executionTimeMs?: number; analyzed: boolean; warnings?: string[] }> {
    const database = await this.getDatabaseRecord(databaseId);
    const policy = PerformanceAuthorization.resolvePolicy(context);

    if (analyze) {
      if (!policy.canExplainAnalyze) {
        throw new Error("Permission denied: EXPLAIN ANALYZE requires explicit authorization.");
      }

      // Safeguard against destructive DDL statements in EXPLAIN ANALYZE
      const trimmedQuery = query.trim().toUpperCase();
      const dangerousPatterns = [/^\s*DROP\b/, /^\s*TRUNCATE\b/, /^\s*ALTER\b/];
      for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmedQuery)) {
          throw new Error("Safety violation: EXPLAIN ANALYZE is rejected for destructive DDL statements (DROP, TRUNCATE, ALTER).");
        }
      }
    } else {
      if (!policy.canExplain) {
        throw new Error("Permission denied: query plan inspection not allowed for this role.");
      }
    }

    const explainPrefix = analyze
      ? "EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON) "
      : "EXPLAIN (COSTS, BUFFERS, FORMAT JSON) ";

    const fullExplainSql = `${explainPrefix}${query};`;
    const startTime = Date.now();

    const res = await userDbManager.executeQuery(
      { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
      fullExplainSql,
      {
        isReadOnly: !analyze,
        timeoutMs: analyze ? 10000 : 5000,
      }
    );

    const elapsed = Date.now() - startTime;
    const planOutput = res.rows[0]?.["QUERY PLAN"] || res.rows[0]?.["query plan"] || res.rows[0];

    return {
      plan: planOutput,
      executionTimeMs: elapsed,
      analyzed: analyze,
      warnings: analyze
        ? ["EXPLAIN ANALYZE executed the underlying statement on the target database with a 10s timeout."]
        : undefined,
    };
  }

  public static async getIndexStats(databaseId: string): Promise<IndexStatisticEntry[]> {
    return this.getIndexStatistics(databaseId);
  }

  /**
   * Retrieves comprehensive index statistics, identifying unused, duplicate, and invalid indexes.
   */
  public static async getIndexStatistics(databaseId: string): Promise<IndexStatisticEntry[]> {
    const database = await this.getDatabaseRecord(databaseId);

    const sqlQuery = `
      SELECT 
        schemaname,
        relname as table_name,
        indexrelname as index_name,
        idx_scan as scans_count,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched,
        pg_relation_size(indexrelid) as size_bytes,
        pg_size_pretty(pg_relation_size(indexrelid)) as size_pretty,
        indisvalid as is_valid,
        indisprimary as is_primary,
        indisunique as is_unique,
        amname as index_type,
        pg_get_indexdef(indexrelid) as definition
      FROM pg_stat_user_indexes
      JOIN pg_index ON pg_index.indexrelid = pg_stat_user_indexes.indexrelid
      JOIN pg_class c ON c.oid = pg_stat_user_indexes.indexrelid
      JOIN pg_am ON pg_am.oid = c.relam
      ORDER BY pg_relation_size(indexrelid) DESC;
    `;

    try {
      const res = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        sqlQuery,
        { isReadOnly: true, timeoutMs: 5000 }
      );

      return res.rows.map((row) => {
        const scansCount = Number(row.scans_count || 0);
        const sizeBytes = Number(row.size_bytes || 0);
        const isPrimary = Boolean(row.is_primary);
        const isUnique = Boolean(row.is_unique);
        const isValid = Boolean(row.is_valid);

        // Unused candidate: 0 scans, not PK/Unique, size > 16KB
        const isUnusedCandidate = scansCount === 0 && !isPrimary && !isUnique && sizeBytes > 16384;
        const isHighUsage = scansCount > 1000;
        const isLargeIndex = sizeBytes > 10 * 1024 * 1024; // > 10MB

        return {
          schema: String(row.schemaname),
          table: String(row.table_name),
          indexName: String(row.index_name),
          indexType: String(row.index_type || "btree"),
          sizeBytes,
          sizePretty: String(row.size_pretty),
          scansCount,
          tuplesRead: Number(row.tuples_read || 0),
          tuplesFetched: Number(row.tuples_fetched || 0),
          isValid,
          isPrimaryKey: isPrimary,
          isUnique,
          isUnusedCandidate,
          isHighUsage,
          isLargeIndex,
          definition: row.definition ? String(row.definition) : undefined,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Retrieves live active sessions, duration, wait events, and blocking pid graph from pg_stat_activity.
   */
  public static async getLiveActivityAndLocks(
    databaseId: string,
    context: UserContext
  ): Promise<{ sessions: LiveSessionEntry[]; blockedCount: number; collectionTime: string }> {
    const database = await this.getDatabaseRecord(databaseId);
    const policy = PerformanceAuthorization.resolvePolicy(context);

    if (!policy.canViewLiveSessions) {
      throw new Error("Permission denied: viewing live database sessions is not allowed for this role.");
    }

    const sqlQuery = `
      SELECT 
        a.pid,
        a.usename as username,
        coalesce(a.application_name, 'client') as application_name,
        a.client_addr::text as client_address,
        a.backend_start::text as backend_start,
        a.query_start::text as query_start,
        a.state_change::text as state_change,
        coalesce(a.state, 'unknown') as state,
        a.wait_event_type,
        a.wait_event,
        coalesce(a.query, '') as query,
        extract(epoch from (now() - a.query_start))::numeric as duration_seconds,
        pg_blocking_pids(a.pid) as blocked_by_pids
      FROM pg_stat_activity a
      WHERE a.pid <> pg_backend_pid()
        AND a.backend_type = 'client backend'
      ORDER BY a.query_start ASC NULLS LAST;
    `;

    try {
      const res = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        sqlQuery,
        { isReadOnly: true, timeoutMs: 4000 }
      );

      const pidToBlocking = new Map<number, number[]>();

      const sessions: LiveSessionEntry[] = res.rows.map((row) => {
        const pid = Number(row.pid);
        const rawBlockedBy = Array.isArray(row.blocked_by_pids)
          ? row.blocked_by_pids.map((p: unknown) => Number(p))
          : [];

        // Register reverse mapping
        for (const blocker of rawBlockedBy) {
          const list = pidToBlocking.get(blocker) || [];
          list.push(pid);
          pidToBlocking.set(blocker, list);
        }

        const rawQuery = String(row.query || "");
        const maskedQuery = PerformanceAuthorization.maskSensitiveQuery(rawQuery, context, null);

        return {
          pid,
          username: String(row.username || "unknown"),
          applicationName: String(row.application_name || "client"),
          clientAddress: row.client_address ? String(row.client_address) : null,
          backendStart: String(row.backend_start || ""),
          queryStart: row.query_start ? String(row.query_start) : null,
          stateChange: row.state_change ? String(row.state_change) : null,
          state: String(row.state),
          waitEventType: row.wait_event_type ? String(row.wait_event_type) : null,
          waitEvent: row.wait_event ? String(row.wait_event) : null,
          query: maskedQuery,
          durationSeconds: row.duration_seconds ? Math.round(Number(row.duration_seconds)) : 0,
          blockingPids: [],
          blockedByPids: rawBlockedBy,
        };
      });

      // Fill in blockingPids
      let blockedCount = 0;
      for (const session of sessions) {
        session.blockingPids = pidToBlocking.get(session.pid) || [];
        if (session.blockedByPids.length > 0) {
          blockedCount++;
        }
      }

      return {
        sessions,
        blockedCount,
        collectionTime: new Date().toISOString(),
      };
    } catch {
      return { sessions: [], blockedCount: 0, collectionTime: new Date().toISOString() };
    }
  }

  /**
   * Terminates a backend session using pg_terminate_backend.
   * Strictly permission-controlled (Owner, DBA only by default).
   */
  public static async terminateSession(
    databaseId: string,
    targetPid: number,
    context: UserContext
  ): Promise<{ success: boolean; message: string }> {
    const database = await this.getDatabaseRecord(databaseId);
    const policy = PerformanceAuthorization.resolvePolicy(context);

    if (!policy.canTerminateSession) {
      throw new Error("Permission denied: You do not have permission to terminate database sessions.");
    }

    if (targetPid <= 0) {
      throw new Error("Invalid process ID");
    }

    try {
      const res = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        `SELECT pg_terminate_backend($1) as terminated;`,
        {
          isReadOnly: false,
          timeoutMs: 4000,
          params: [targetPid],
        }
      );

      const success = Boolean(res.rows[0]?.terminated);
      return {
        success,
        message: success
          ? `Successfully terminated backend session PID ${targetPid}.`
          : `Failed to terminate session PID ${targetPid}. The session may have already completed.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error terminating session";
      throw new Error(`Failed to terminate session: ${message}`);
    }
  }

  /**
   * Retrieves table bloat, dead tuples, scan rates, and vacuum dates from pg_stat_user_tables.
   */
  public static async getTableStatistics(databaseId: string): Promise<TableStatisticEntry[]> {
    const database = await this.getDatabaseRecord(databaseId);

    const sqlQuery = `
      SELECT 
        schemaname,
        relname as table_name,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        round(
          (n_dead_tup * 100.0 / nullif(n_live_tup + n_dead_tup, 0))::numeric, 
          2
        ) as dead_tuple_ratio,
        pg_relation_size(relid) as table_size_bytes,
        pg_size_pretty(pg_relation_size(relid)) as table_size_pretty,
        pg_indexes_size(relid) as index_size_bytes,
        pg_size_pretty(pg_indexes_size(relid)) as index_size_pretty,
        pg_total_relation_size(relid) as total_size_bytes,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size_pretty,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch,
        last_vacuum::text,
        last_autovacuum::text,
        last_analyze::text,
        last_autoanalyze::text
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC;
    `;

    try {
      const res = await userDbManager.executeQuery(
        { id: database.id, connectionStringEncrypted: database.connectionStringEncrypted },
        sqlQuery,
        { isReadOnly: true, timeoutMs: 5000 }
      );

      return res.rows.map((row) => {
        const liveTuples = Number(row.live_tuples || 0);
        const deadTuples = Number(row.dead_tuples || 0);
        const deadRatio = row.dead_tuple_ratio !== null ? Number(row.dead_tuple_ratio) : 0;
        const needsVacuum = deadRatio > 20 && deadTuples > 1000;

        return {
          schema: String(row.schemaname),
          tableName: String(row.table_name),
          liveTuples,
          deadTuples,
          deadTupleRatioPercent: deadRatio,
          tableSizeBytes: Number(row.table_size_bytes || 0),
          tableSizePretty: String(row.table_size_pretty),
          indexSizeBytes: Number(row.index_size_bytes || 0),
          indexSizePretty: String(row.index_size_pretty),
          totalSizeBytes: Number(row.total_size_bytes || 0),
          totalSizePretty: String(row.total_size_pretty),
          sequentialScans: Number(row.seq_scan || 0),
          sequentialTuplesRead: Number(row.seq_tup_read || 0),
          indexScans: Number(row.idx_scan || 0),
          indexTuplesFetched: Number(row.idx_tup_fetch || 0),
          lastVacuum: row.last_vacuum ? String(row.last_vacuum) : null,
          lastAutoVacuum: row.last_autovacuum ? String(row.last_autovacuum) : null,
          lastAnalyze: row.last_analyze ? String(row.last_analyze) : null,
          lastAutoAnalyze: row.last_autoanalyze ? String(row.last_autoanalyze) : null,
          needsVacuum,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Generates actionable, evidence-based recommendations from observed statistics.
   */
  public static async getDiagnosticsAndRecommendations(
    databaseId: string
  ): Promise<DiagnosticRecommendation[]> {
    const recommendations: DiagnosticRecommendation[] = [];

    // 1. Check Table Statistics (Bloat & Vacuums)
    const tables = await this.getTableStatistics(databaseId);
    for (const t of tables) {
      if (t.needsVacuum) {
        recommendations.push({
          id: `bloat-${t.schema}-${t.tableName}`,
          severity: t.deadTupleRatioPercent > 40 ? "critical" : "high",
          category: "storage",
          finding: `Table ${t.schema}.${t.tableName} has excessive dead tuples (${t.deadTupleRatioPercent}% dead, ${t.deadTuples.toLocaleString()} tuples).`,
          evidence: `n_dead_tup: ${t.deadTuples}, n_live_tup: ${t.liveTuples}, dead_ratio: ${t.deadTupleRatioPercent}%, last_autovacuum: ${t.lastAutoVacuum || "Never"}.`,
          affectedResource: `${t.schema}.${t.tableName}`,
          suggestedAction: `Execute VACUUM ANALYZE to reclaim disk space, update planner statistics, and prevent table bloat.`,
          expectedBenefit: `Reduces table I/O, reclaims disk space, and prevents planner estimation errors.`,
          sqlRemediation: `VACUUM ANALYZE ${t.schema}."${t.tableName}";`,
        });
      }

      // Check for missing index: High sequential scans with large tuple reads
      if (t.sequentialScans > 50 && t.sequentialTuplesRead > 100000 && t.sequentialScans > t.indexScans * 2) {
        recommendations.push({
          id: `seq-scan-${t.schema}-${t.tableName}`,
          severity: "medium",
          category: "index",
          finding: `Table ${t.schema}.${t.tableName} is dominated by sequential scans (${t.sequentialScans} seq scans vs ${t.indexScans} index scans).`,
          evidence: `Total seq_tup_read: ${t.sequentialTuplesRead.toLocaleString()} rows over ${t.sequentialScans} scans.`,
          affectedResource: `${t.schema}.${t.tableName}`,
          suggestedAction: `Examine frequent filter predicates on ${t.tableName} and add targeted B-tree indexes.`,
          expectedBenefit: `Replaces full table scans with sub-millisecond index lookups.`,
        });
      }
    }

    // 2. Check Index Statistics (Unused & Invalid Indexes)
    const indexes = await this.getIndexStatistics(databaseId);
    for (const idx of indexes) {
      if (!idx.isValid) {
        recommendations.push({
          id: `invalid-idx-${idx.schema}-${idx.indexName}`,
          severity: "critical",
          category: "index",
          finding: `Index ${idx.indexName} on ${idx.table} is marked INVALID.`,
          evidence: `indisvalid = false. An invalid index consumes disk space and write overhead but cannot be used by the query planner.`,
          affectedResource: `${idx.schema}.${idx.indexName}`,
          suggestedAction: `Rebuild the index concurrently using REINDEX INDEX CONCURRENTLY.`,
          expectedBenefit: `Restores index validity and planner usability without locking the table.`,
          sqlRemediation: `REINDEX INDEX CONCURRENTLY ${idx.schema}."${idx.indexName}";`,
        });
      } else if (idx.isUnusedCandidate && idx.sizeBytes > 1024 * 1024) {
        // > 1MB and 0 scans
        recommendations.push({
          id: `unused-idx-${idx.schema}-${idx.indexName}`,
          severity: "low",
          category: "index",
          finding: `Potentially unused index ${idx.indexName} (${idx.sizePretty}) with 0 scans recorded.`,
          evidence: `scans_count = 0, size = ${idx.sizePretty}. Verify if workload has recently restarted before dropping.`,
          affectedResource: `${idx.schema}.${idx.indexName}`,
          suggestedAction: `If this index remains unutilized across a representative business cycle, drop it.`,
          expectedBenefit: `Saves ${idx.sizePretty} of disk and reduces INSERT/UPDATE/DELETE write overhead.`,
          sqlRemediation: `DROP INDEX CONCURRENTLY IF EXISTS ${idx.schema}."${idx.indexName}";`,
        });
      }
    }

    // 3. Check Overall Cache Hit Ratio
    const overview = await this.getPerformanceOverview(databaseId);
    if (overview.cacheHitRatioPercent !== null && overview.cacheHitRatioPercent < 95) {
      recommendations.push({
        id: `cache-hit-ratio-${databaseId}`,
        severity: overview.cacheHitRatioPercent < 90 ? "high" : "medium",
        category: "configuration",
        finding: `Buffer cache hit ratio is suboptimal at ${overview.cacheHitRatioPercent}%.`,
        evidence: `Standard production target is >= 99%. Only ${overview.cacheHitRatioPercent}% of page reads are served from shared_buffers.`,
        affectedResource: `PostgreSQL shared_buffers`,
        suggestedAction: `Consider increasing shared_buffers or checking for large tables causing cache churn.`,
        expectedBenefit: `Reduces disk read latency and increases overall query throughput.`,
      });
    }

    // 4. Check Connection Utilization
    if (overview.connectionUtilizationPercent > 80) {
      recommendations.push({
        id: `conn-utilization-${databaseId}`,
        severity: overview.connectionUtilizationPercent > 90 ? "critical" : "high",
        category: "connection",
        finding: `High connection saturation: ${overview.connectionUtilizationPercent}% of max_connections in use (${overview.activeConnections}/${overview.maxConnections}).`,
        evidence: `Active client connections nearing server capacity.`,
        affectedResource: `Connection Pool`,
        suggestedAction: `Use connection pooling (e.g. PgBouncer) or scale max_connections.`,
        expectedBenefit: `Prevents connection exhaustion errors (FATAL: remaining connection slots are reserved).`,
      });
    }

    return recommendations;
  }
}
