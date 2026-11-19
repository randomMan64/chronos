import { db } from "@/db/connections/control-plane";
import {
  databases,
  workspaces,
} from "@/db/schema/control-plane";
import {
  queryExecutions,
  transactionEvents,
  changeEvents,
  snapshots,
} from "@/db/schema/temporal";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";
import { userDbManager } from "@/db/connections/user-database";
import { UserContext } from "@/lib/permissions/types";
import { ChronosRole, normalizeRole } from "@/lib/permissions/roles";

export type TimeRangeKey =
  | "15m"
  | "1h"
  | "6h"
  | "24h"
  | "7d"
  | "30d"
  | "custom";

export interface MetricComparison {
  current: number;
  previous: number | null;
  changePct: number | null;
  trend: "up" | "down" | "neutral";
  formattedCurrent?: string;
  formattedPrevious?: string;
}

export interface VolumeDataPoint {
  timestamp: string;
  timeLabel: string;
  success: number;
  failed: number;
  total: number;
}

export interface LatencyDataPoint {
  timestamp: string;
  timeLabel: string;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
}

export interface SlowQueryDataPoint {
  timestamp: string;
  timeLabel: string;
  slowCount: number;
  thresholdMs: number;
}

export interface StorageDataPoint {
  timestamp: string;
  timeLabel: string;
  sizeBytes: number;
  sizeFormatted: string;
  source: string;
}

export interface IssueAlert {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  module: "analyzer" | "transactions" | "temporal" | "explorer" | "audit";
  modulePath: string;
  detectedAt: string;
}

export interface RecentActivityItem {
  id: string;
  actor: string;
  operation: string;
  database: string;
  table: string;
  timestamp: string;
  result: "success" | "error";
  relatedTransactionId?: string | null;
  targetModule: "temporal" | "transactions" | "analyzer" | "audit";
  linkUrl: string;
}

export interface OverviewTelemetryResponse {
  organization: {
    id: string;
    name: string;
  };
  workspace: {
    id: string;
    name: string;
    environment: string;
  };
  selectedDatabase: {
    id: string | null;
    name: string;
    environment: string;
    status: string;
    version?: string;
  } | null;
  availableDatabases: Array<{
    id: string;
    name: string;
    environment: string;
    status: string;
  }>;
  currentRole: ChronosRole;
  effectiveRoleLabel: string;
  timeRange: {
    key: TimeRangeKey;
    start: string;
    end: string;
    durationMs: number;
  };
  lastUpdated: string;
  kpis: {
    totalQueries: MetricComparison;
    avgLatency: MetricComparison;
    p95Latency: MetricComparison;
    failedQueries: MetricComparison;
    activeConnections: MetricComparison;
    activeTransactions: MetricComparison;
    slowQueries: MetricComparison;
    databaseSize: MetricComparison & { sizeFormatted: string };
  };
  charts: {
    queryVolume: VolumeDataPoint[];
    queryLatency: LatencyDataPoint[];
    transactionOutcomes: {
      committed: number;
      rolledBack: number;
      failed: number;
      total: number;
    };
    connectionUtilization: {
      active: number;
      idle: number;
      max: number;
      utilizationPct: number;
      timeline: Array<{
        timeLabel: string;
        active: number;
        idle: number;
        max: number;
      }>;
    };
    queryTypeDistribution: Array<{
      type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL" | "OTHER";
      count: number;
    }>;
    slowQueryTrends: SlowQueryDataPoint[];
    databaseStorage: {
      isHistoricalAvailable: boolean;
      data: StorageDataPoint[];
      currentFormatted: string;
      note?: string;
    };
    resourceSummary: {
      cacheHitRatio: number | null;
      activeConnections: number;
      maxConnections: number;
      connectionUtilizationPct: number;
      databaseSizeBytes: number | null;
      databaseSizeFormatted: string;
      topRelations: Array<{
        name: string;
        sizeFormatted: string;
        bytes: number;
      }>;
      pgStatStatementsActive: boolean;
    };
  };
  issues: IssueAlert[];
  recentActivity: RecentActivityItem[];
}

export class OverviewService {
  /**
   * Helper to compute percentage delta and trend.
   */
  public static computeMetricComparison(
    current: number,
    previous: number | null,
    lowerIsBetter = false
  ): MetricComparison {
    if (previous === null || previous === 0) {
      return {
        current,
        previous,
        changePct: null,
        trend: "neutral",
      };
    }

    const diff = current - previous;
    const changePct = Math.round((diff / previous) * 1000) / 10;

    let trend: "up" | "down" | "neutral" = "neutral";
    if (changePct > 0) {
      trend = lowerIsBetter ? "up" : "up";
    } else if (changePct < 0) {
      trend = "down";
    }

    return {
      current,
      previous,
      changePct,
      trend,
    };
  }

  /**
   * Formats byte size into human readable string.
   */
  public static formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return "N/A";
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Resolves time window boundaries.
   */
  public static resolveTimeWindow(
    range: TimeRangeKey = "24h",
    customStart?: Date,
    customEnd?: Date
  ): {
    start: Date;
    end: Date;
    prevStart: Date;
    prevEnd: Date;
    durationMs: number;
  } {
    const end = customEnd && !isNaN(customEnd.getTime()) ? customEnd : new Date();
    let durationMs = 24 * 60 * 60 * 1000;

    switch (range) {
      case "15m":
        durationMs = 15 * 60 * 1000;
        break;
      case "1h":
        durationMs = 60 * 60 * 1000;
        break;
      case "6h":
        durationMs = 6 * 60 * 60 * 1000;
        break;
      case "24h":
        durationMs = 24 * 60 * 60 * 1000;
        break;
      case "7d":
        durationMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case "30d":
        durationMs = 30 * 24 * 60 * 60 * 1000;
        break;
      case "custom":
        if (customStart && !isNaN(customStart.getTime())) {
          durationMs = Math.max(60000, end.getTime() - customStart.getTime());
        }
        break;
    }

    const start =
      range === "custom" && customStart && !isNaN(customStart.getTime())
        ? customStart
        : new Date(end.getTime() - durationMs);

    const prevEnd = new Date(start.getTime());
    const prevStart = new Date(start.getTime() - durationMs);

    return { start, end, prevStart, prevEnd, durationMs };
  }

  /**
   * Retrieves aggregated telemetry and charts for the Operations Command Centre.
   */
  public static async getOverviewTelemetry(params: {
    workspaceId: string;
    organizationId: string;
    databaseId?: string | null;
    range?: TimeRangeKey;
    startDate?: Date;
    endDate?: Date;
    context: UserContext;
  }): Promise<OverviewTelemetryResponse> {
    const {
      workspaceId,
      organizationId,
      databaseId,
      range = "24h",
      startDate,
      endDate,
      context,
    } = params;

    const { start, end, prevStart, prevEnd, durationMs } =
      this.resolveTimeWindow(range, startDate, endDate);

    // 1. Resolve workspace databases
    const workspaceDbs = await db
      .select({
        id: databases.id,
        name: databases.name,
        environment: databases.environment,
        status: databases.status,
        connectionStringEncrypted: databases.connectionStringEncrypted,
        lastTestedAt: databases.lastTestedAt,
      })
      .from(databases)
      .where(
        and(
          eq(databases.workspaceId, workspaceId),
          eq(databases.organizationId, organizationId)
        )
      )
      .orderBy(databases.name);

    let selectedDbRecord =
      databaseId && databaseId !== "all"
        ? workspaceDbs.find((d: { id: string }) => d.id === databaseId) || null
        : workspaceDbs[0] || null;

    const role = normalizeRole(context.workspaceRole || context.organizationRole);

    // 2. Fetch Query Executions for Current and Previous Windows
    const targetDbIds =
      selectedDbRecord && databaseId !== "all"
        ? [selectedDbRecord.id]
        : workspaceDbs.map((d: { id: string }) => d.id);

    const hasDbs = targetDbIds.length > 0;

    // RBAC: If role is developer or data_analyst without global inspect, constrain query logs
    const isRestrictedViewer =
      role === "developer" || role === "data_analyst";

    let currentQueries: Array<{
      id: string;
      databaseId: string;
      queryText: string;
      durationMs: number;
      status: string;
      executedAt: Date;
      userId: string | null;
    }> = [];

    let prevQueries: Array<{
      durationMs: number;
      status: string;
    }> = [];

    if (hasDbs) {
      const currentConditions = [
        inArray(queryExecutions.databaseId, targetDbIds),
        gte(queryExecutions.executedAt, start),
        lte(queryExecutions.executedAt, end),
      ];

      const prevConditions = [
        inArray(queryExecutions.databaseId, targetDbIds),
        gte(queryExecutions.executedAt, prevStart),
        lte(queryExecutions.executedAt, prevEnd),
      ];

      if (isRestrictedViewer && context.userId) {
        currentConditions.push(eq(queryExecutions.userId, context.userId));
        prevConditions.push(eq(queryExecutions.userId, context.userId));
      }

      currentQueries = await db
        .select({
          id: queryExecutions.id,
          databaseId: queryExecutions.databaseId,
          queryText: queryExecutions.queryText,
          durationMs: queryExecutions.durationMs,
          status: queryExecutions.status,
          executedAt: queryExecutions.executedAt,
          userId: queryExecutions.userId,
        })
        .from(queryExecutions)
        .where(and(...currentConditions))
        .orderBy(desc(queryExecutions.executedAt));

      prevQueries = await db
        .select({
          durationMs: queryExecutions.durationMs,
          status: queryExecutions.status,
        })
        .from(queryExecutions)
        .where(and(...prevConditions));
    }

    // 3. Compute KPI Metrics
    const totalCurrentQueries = currentQueries.length;
    const totalPrevQueries = prevQueries.length;
    const kpiTotalQueries = this.computeMetricComparison(
      totalCurrentQueries,
      totalPrevQueries
    );

    const currentDurations = currentQueries
      .map((q) => q.durationMs)
      .sort((a, b) => a - b);
    const prevDurations = prevQueries
      .map((q) => q.durationMs)
      .sort((a, b) => a - b);

    const avgLatencyVal =
      currentDurations.length > 0
        ? Math.round(
            currentDurations.reduce((acc, v) => acc + v, 0) /
              currentDurations.length
          )
        : 0;

    const prevAvgLatencyVal =
      prevDurations.length > 0
        ? Math.round(
            prevDurations.reduce((acc, v) => acc + v, 0) / prevDurations.length
          )
        : null;

    const kpiAvgLatency = this.computeMetricComparison(
      avgLatencyVal,
      prevAvgLatencyVal,
      true
    );

    // Percentiles: P95 and P99 computed from actual samples
    const p95LatencyVal =
      currentDurations.length > 0
        ? currentDurations[Math.floor(currentDurations.length * 0.95)]
        : 0;
    const prevP95LatencyVal =
      prevDurations.length > 0
        ? prevDurations[Math.floor(prevDurations.length * 0.95)]
        : null;
    const kpiP95Latency = this.computeMetricComparison(
      p95LatencyVal,
      prevP95LatencyVal,
      true
    );

    const failedCurrent = currentQueries.filter(
      (q) => q.status === "error"
    ).length;
    const failedPrev = prevQueries.filter((q) => q.status === "error").length;
    const kpiFailedQueries = this.computeMetricComparison(
      failedCurrent,
      failedPrev,
      true
    );

    const slowThresholdMs = 200;
    const slowCurrent = currentQueries.filter(
      (q) => q.durationMs >= slowThresholdMs
    ).length;
    const slowPrev = prevQueries.filter(
      (q) => q.durationMs >= slowThresholdMs
    ).length;
    const kpiSlowQueries = this.computeMetricComparison(
      slowCurrent,
      slowPrev,
      true
    );

    // 4. Transaction Events
    let txEvents: Array<{
      status: string;
      durationMs: number | null;
      startedAt: Date;
    }> = [];

    if (hasDbs) {
      txEvents = await db
        .select({
          status: transactionEvents.status,
          durationMs: transactionEvents.durationMs,
          startedAt: transactionEvents.startedAt,
        })
        .from(transactionEvents)
        .where(
          and(
            inArray(transactionEvents.databaseId, targetDbIds),
            gte(transactionEvents.startedAt, start),
            lte(transactionEvents.startedAt, end)
          )
        );
    }

    const txCommitted = txEvents.filter((t) => t.status === "committed").length;
    const txRolledBack = txEvents.filter(
      (t) => t.status === "rolled_back"
    ).length;
    const txFailed = txEvents.filter(
      (t) => t.status === "failed" || t.status === "aborted"
    ).length;
    const txActiveCount = txEvents.filter((t) => t.status === "started").length;

    const kpiActiveTransactions = this.computeMetricComparison(
      txActiveCount,
      null
    );

    // 5. Query Time Series Generation (Volume, Latency, Slow)
    const numBuckets = durationMs <= 3600000 ? 12 : 24;
    const bucketInterval = durationMs / numBuckets;

    const volumeChart: VolumeDataPoint[] = [];
    const latencyChart: LatencyDataPoint[] = [];
    const slowQueryTrends: SlowQueryDataPoint[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const bStart = new Date(start.getTime() + i * bucketInterval);
      const bEnd = new Date(start.getTime() + (i + 1) * bucketInterval);

      const bucketQueries = currentQueries.filter(
        (q) => q.executedAt >= bStart && q.executedAt < bEnd
      );

      const bSuccess = bucketQueries.filter(
        (q) => q.status === "success"
      ).length;
      const bFailed = bucketQueries.filter((q) => q.status === "error").length;
      const bTotal = bucketQueries.length;

      const bDurations = bucketQueries
        .map((q) => q.durationMs)
        .sort((a, b) => a - b);
      const bAvg =
        bDurations.length > 0
          ? Math.round(
              bDurations.reduce((a, b) => a + b, 0) / bDurations.length
            )
          : 0;
      const bP95 =
        bDurations.length > 0
          ? bDurations[Math.floor(bDurations.length * 0.95)]
          : 0;
      const bP99 =
        bDurations.length > 0
          ? bDurations[Math.floor(bDurations.length * 0.99)]
          : 0;

      const bSlow = bucketQueries.filter(
        (q) => q.durationMs >= slowThresholdMs
      ).length;

      const timeLabel =
        durationMs > 24 * 3600000
          ? bStart.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : bStart.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });

      volumeChart.push({
        timestamp: bStart.toISOString(),
        timeLabel,
        success: bSuccess,
        failed: bFailed,
        total: bTotal,
      });

      latencyChart.push({
        timestamp: bStart.toISOString(),
        timeLabel,
        avgMs: bAvg,
        p95Ms: bP95,
        p99Ms: bP99,
      });

      slowQueryTrends.push({
        timestamp: bStart.toISOString(),
        timeLabel,
        slowCount: bSlow,
        thresholdMs: slowThresholdMs,
      });
    }

    // 6. Query Type Distribution (Bar Chart)
    const typeCounts: Record<
      "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL" | "OTHER",
      number
    > = {
      SELECT: 0,
      INSERT: 0,
      UPDATE: 0,
      DELETE: 0,
      DDL: 0,
      OTHER: 0,
    };

    for (const q of currentQueries) {
      const trimmed = q.queryText.trim().toUpperCase();
      if (trimmed.startsWith("SELECT") || trimmed.startsWith("WITH")) {
        typeCounts.SELECT++;
      } else if (trimmed.startsWith("INSERT")) {
        typeCounts.INSERT++;
      } else if (trimmed.startsWith("UPDATE")) {
        typeCounts.UPDATE++;
      } else if (trimmed.startsWith("DELETE")) {
        typeCounts.DELETE++;
      } else if (
        trimmed.startsWith("CREATE") ||
        trimmed.startsWith("ALTER") ||
        trimmed.startsWith("DROP") ||
        trimmed.startsWith("TRUNCATE")
      ) {
        typeCounts.DDL++;
      } else {
        typeCounts.OTHER++;
      }
    }

    const queryTypeDistribution = (
      ["SELECT", "INSERT", "UPDATE", "DELETE", "DDL", "OTHER"] as const
    ).map((type) => ({
      type,
      count: typeCounts[type],
    }));

    // 7. Live PostgreSQL Database Telemetry (Connections, Storage, Cache Hit)
    let activeConnectionsCount = 1;
    let idleConnectionsCount = 0;
    let maxConnectionsCount = 100;
    let cacheHitRatio: number | null = null;
    let databaseSizeBytes: number | null = null;
    let pgStatStatementsActive = false;
    let topRelations: Array<{
      name: string;
      sizeFormatted: string;
      bytes: number;
    }> = [];
    let postgresVersion: string | undefined = undefined;

    if (selectedDbRecord && selectedDbRecord.connectionStringEncrypted) {
      try {
        const poolConfig = {
          id: selectedDbRecord.id,
          connectionStringEncrypted:
            selectedDbRecord.connectionStringEncrypted,
        };

        // A. Connection statistics from pg_stat_activity
        const connRes = await userDbManager.executeQuery(
          poolConfig,
          `
          SELECT 
            count(*) filter (where state = 'active') as active_count,
            count(*) filter (where state = 'idle' or state = 'idle in transaction') as idle_count,
            current_setting('max_connections')::int as max_conn,
            version() as pg_version
          FROM pg_stat_activity 
          WHERE backend_type = 'client backend';
          `,
          { isReadOnly: true, timeoutMs: 3000 }
        );

        if (connRes.rows[0]) {
          activeConnectionsCount = Number(connRes.rows[0].active_count || 0);
          idleConnectionsCount = Number(connRes.rows[0].idle_count || 0);
          maxConnectionsCount = Number(connRes.rows[0].max_conn || 100);
          postgresVersion = String(connRes.rows[0].pg_version || "").split(" on ")[0];
        }

        // B. Cache hit ratio from pg_stat_database
        const cacheRes = await userDbManager.executeQuery(
          poolConfig,
          `
          SELECT 
            round(
              (sum(blks_hit) * 100.0 / nullif(sum(blks_hit) + sum(blks_read), 0))::numeric, 
              2
            ) as cache_hit_ratio
          FROM pg_stat_database 
          WHERE datname = current_database();
          `,
          { isReadOnly: true, timeoutMs: 3000 }
        );

        if (
          cacheRes.rows[0]?.cache_hit_ratio !== null &&
          cacheRes.rows[0]?.cache_hit_ratio !== undefined
        ) {
          cacheHitRatio = Number(cacheRes.rows[0].cache_hit_ratio);
        }

        // C. Database size
        const sizeRes = await userDbManager.executeQuery(
          poolConfig,
          `SELECT pg_database_size(current_database())::bigint as db_size;`,
          { isReadOnly: true, timeoutMs: 3000 }
        );

        if (sizeRes.rows[0]?.db_size) {
          databaseSizeBytes = Number(sizeRes.rows[0].db_size);
        }

        // D. Top relations by size
        const relRes = await userDbManager.executeQuery(
          poolConfig,
          `
          SELECT 
            c.relname as table_name,
            pg_total_relation_size(c.oid)::bigint as total_bytes
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND c.relkind = 'r'
          ORDER BY total_bytes DESC
          LIMIT 5;
          `,
          { isReadOnly: true, timeoutMs: 3000 }
        );

        topRelations = relRes.rows.map((r) => ({
          name: String(r.table_name),
          bytes: Number(r.total_bytes || 0),
          sizeFormatted: this.formatBytes(Number(r.total_bytes || 0)),
        }));

        // E. Check pg_stat_statements
        const extRes = await userDbManager.executeQuery(
          poolConfig,
          `SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';`,
          { isReadOnly: true, timeoutMs: 2000 }
        );
        pgStatStatementsActive = extRes.rows.length > 0;
      } catch {
        // Fall back gracefully if user DB is not reachable
      }
    }

    const connUtilPct =
      maxConnectionsCount > 0
        ? Math.round(
            ((activeConnectionsCount + idleConnectionsCount) /
              maxConnectionsCount) *
              1000
          ) / 10
        : 0;

    const kpiActiveConnections = this.computeMetricComparison(
      activeConnectionsCount,
      null
    );

    const kpiDatabaseSize = {
      ...this.computeMetricComparison(databaseSizeBytes || 0, null),
      sizeFormatted: this.formatBytes(databaseSizeBytes),
    };

    // 8. Storage History (snapshots or live point)
    let snapshotRecords: Array<{
      createdAt: Date;
      metadata: Record<string, unknown> | null;
    }> = [];

    if (hasDbs) {
      snapshotRecords = await db
        .select({
          createdAt: snapshots.createdAt,
          metadata: snapshots.metadata,
        })
        .from(snapshots)
        .where(inArray(snapshots.databaseId, targetDbIds))
        .orderBy(snapshots.createdAt);
    }

    const storageDataPoints: StorageDataPoint[] = [];
    if (snapshotRecords.length > 0) {
      for (const snap of snapshotRecords) {
        const snapBytes = Number(snap.metadata?.sizeBytes || databaseSizeBytes || 0);
        storageDataPoints.push({
          timestamp: snap.createdAt.toISOString(),
          timeLabel: snap.createdAt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          sizeBytes: snapBytes,
          sizeFormatted: this.formatBytes(snapBytes),
          source: "Snapshot Metadata",
        });
      }
    }

    // Always include current live measurement as latest point
    if (databaseSizeBytes !== null) {
      storageDataPoints.push({
        timestamp: new Date().toISOString(),
        timeLabel: "Live",
        sizeBytes: databaseSizeBytes,
        sizeFormatted: this.formatBytes(databaseSizeBytes),
        source: "pg_database_size",
      });
    }

    // 9. Operational Issues & Alerts
    const issues: IssueAlert[] = [];
    const baseDbParam = selectedDbRecord
      ? `databaseId=${selectedDbRecord.id}`
      : "";

    const makeAnalyzerUrl = (tab: string, extraParams?: string) => {
      const parts = [baseDbParam, `tab=${tab}`];
      if (extraParams) parts.push(extraParams);
      const query = parts.filter(Boolean).join("&");
      return query ? `/analyzer?${query}` : `/analyzer`;
    };

    // Failed queries alert
    if (failedCurrent > 0) {
      const failureRate =
        totalCurrentQueries > 0
          ? Math.round((failedCurrent / totalCurrentQueries) * 100)
          : 100;
      issues.push({
        id: "alert-failed-queries",
        severity: failureRate >= 10 ? "critical" : "high",
        title: `${failedCurrent} Failed SQL Query Execution(s)`,
        description: `${failureRate}% of executed queries resulted in database errors during the selected time window.`,
        module: "analyzer",
        modulePath: makeAnalyzerUrl("queries"),
        detectedAt: new Date().toISOString(),
      });
    }

    // Slow queries alert
    if (slowCurrent > 0) {
      issues.push({
        id: "alert-slow-queries",
        severity: slowCurrent > 10 ? "high" : "medium",
        title: `${slowCurrent} Slow Query Execution(s) Detected`,
        description: `Queries exceeded the ${slowThresholdMs}ms latency threshold. Inspect execution plans and index recommendations.`,
        module: "analyzer",
        modulePath: makeAnalyzerUrl("queries", "minDuration=100"),
        detectedAt: new Date().toISOString(),
      });
    }

    // High connection utilization alert
    if (connUtilPct >= 80) {
      issues.push({
        id: "alert-conn-util",
        severity: connUtilPct >= 95 ? "critical" : "medium",
        title: `High Connection Utilization (${connUtilPct}%)`,
        description: `Active and idle client connections are approaching max_connections (${activeConnectionsCount + idleConnectionsCount}/${maxConnectionsCount}).`,
        module: "analyzer",
        modulePath: makeAnalyzerUrl("sessions"),
        detectedAt: new Date().toISOString(),
      });
    }

    // Cache hit ratio warning
    if (cacheHitRatio !== null && cacheHitRatio < 90) {
      issues.push({
        id: "alert-cache-hit",
        severity: "medium",
        title: `Buffer Cache Hit Ratio Below Target (${cacheHitRatio}%)`,
        description: "Shared buffer cache efficiency is sub-optimal (< 90%). Disk reads are serving queries.",
        module: "analyzer",
        modulePath: makeAnalyzerUrl("overview"),
        detectedAt: new Date().toISOString(),
      });
    }

    // Extension warning
    if (!pgStatStatementsActive && selectedDbRecord) {
      issues.push({
        id: "alert-missing-extension",
        severity: "low",
        title: "pg_stat_statements Extension Not Installed",
        description: "Install 'pg_stat_statements' to enable engine-level query planning and buffer hit telemetry.",
        module: "analyzer",
        modulePath: makeAnalyzerUrl("overview"),
        detectedAt: new Date().toISOString(),
      });
    }

    // 10. Recent Activity Table
    const recentActivity: RecentActivityItem[] = [];

    // Combine recent queryExecutions and changeEvents
    for (const q of currentQueries.slice(0, 8)) {
      const opMatch = q.queryText.trim().match(/^([A-Z]+)/i);
      const op = opMatch ? opMatch[1].toUpperCase() : "SQL";
      const dbObj = workspaceDbs.find((d: { id: string }) => d.id === q.databaseId);
      const qLink = dbObj
        ? `/analyzer?databaseId=${dbObj.id}&tab=queries`
        : "/analyzer?tab=queries";

      recentActivity.push({
        id: `act-${q.id}`,
        actor: q.userId ? "Engineer" : "SQL Gateway",
        operation: op,
        database: dbObj?.name || "Cluster",
        table: "-",
        timestamp: q.executedAt.toISOString(),
        result: q.status === "error" ? "error" : "success",
        relatedTransactionId: null,
        targetModule: "analyzer",
        linkUrl: qLink,
      });
    }

    // Fetch temporal change events for richer activity
    try {
      if (hasDbs) {
        const changes = await db
          .select({
            id: changeEvents.id,
            tableName: changeEvents.tableName,
            eventType: changeEvents.eventType,
            createdAt: changeEvents.createdAt,
          })
          .from(changeEvents)
          .where(inArray(changeEvents.databaseId, targetDbIds))
          .orderBy(desc(changeEvents.createdAt))
          .limit(5);

        for (const c of changes) {
          recentActivity.push({
            id: `chg-${c.id}`,
            actor: "Audited User",
            operation: c.eventType.toUpperCase(),
            database: selectedDbRecord?.name || "Cluster",
            table: c.tableName,
            timestamp: c.createdAt.toISOString(),
            result: "success",
            relatedTransactionId: null,
            targetModule: "temporal",
            linkUrl: `/temporal?table=${c.tableName}`,
          });
        }
      }
    } catch {
      // Ignore if changeEvents empty
    }

    // Sort combined activity descending
    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      organization: {
        id: organizationId,
        name: context.organizationRole || "Organization",
      },
      workspace: {
        id: workspaceId,
        name: "Default Workspace",
        environment: selectedDbRecord?.environment || "production",
      },
      selectedDatabase: selectedDbRecord
        ? {
            id: selectedDbRecord.id,
            name: selectedDbRecord.name,
            environment: selectedDbRecord.environment || "production",
            status: selectedDbRecord.status || "active",
            version: postgresVersion,
          }
        : null,
      availableDatabases: workspaceDbs.map((d) => ({
        id: d.id,
        name: d.name,
        environment: d.environment || "production",
        status: d.status || "active",
      })),
      currentRole: role,
      effectiveRoleLabel: role.replace("_", " ").toUpperCase(),
      timeRange: {
        key: range,
        start: start.toISOString(),
        end: end.toISOString(),
        durationMs,
      },
      lastUpdated: new Date().toISOString(),
      kpis: {
        totalQueries: kpiTotalQueries,
        avgLatency: kpiAvgLatency,
        p95Latency: kpiP95Latency,
        failedQueries: kpiFailedQueries,
        activeConnections: kpiActiveConnections,
        activeTransactions: kpiActiveTransactions,
        slowQueries: kpiSlowQueries,
        databaseSize: kpiDatabaseSize,
      },
      charts: {
        queryVolume: volumeChart,
        queryLatency: latencyChart,
        transactionOutcomes: {
          committed: txCommitted,
          rolledBack: txRolledBack,
          failed: txFailed,
          total: txCommitted + txRolledBack + txFailed,
        },
        connectionUtilization: {
          active: activeConnectionsCount,
          idle: idleConnectionsCount,
          max: maxConnectionsCount,
          utilizationPct: connUtilPct,
          timeline: [
            {
              timeLabel: "Current",
              active: activeConnectionsCount,
              idle: idleConnectionsCount,
              max: maxConnectionsCount,
            },
          ],
        },
        queryTypeDistribution,
        slowQueryTrends,
        databaseStorage: {
          isHistoricalAvailable: snapshotRecords.length > 0,
          data: storageDataPoints,
          currentFormatted: this.formatBytes(databaseSizeBytes),
          note:
            snapshotRecords.length === 0
              ? "Single live measurement recorded. Historical periodic storage tracking is recorded when snapshot schedules or retention tasks run."
              : undefined,
        },
        resourceSummary: {
          cacheHitRatio,
          activeConnections: activeConnectionsCount,
          maxConnections: maxConnectionsCount,
          connectionUtilizationPct: connUtilPct,
          databaseSizeBytes,
          databaseSizeFormatted: this.formatBytes(databaseSizeBytes),
          topRelations,
          pgStatStatementsActive,
        },
      },
      issues,
      recentActivity: recentActivity.slice(0, 10),
    };
  }
}
