import { db } from "@/db/connections/control-plane";
import { auditLogs, securityAlerts } from "@/db/schema";
import { eq, and, desc, asc, gte, lte, sql, or, ilike, inArray } from "drizzle-orm";
import { inferCategory } from "./audit-service";

export interface AuditEventItem {
  id: string;
  organizationId: string;
  workspaceId?: string | null;
  databaseId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  eventCategory: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "success" | "failure" | "denied";
  severity: "info" | "warning" | "error" | "critical";
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  durationMs?: number | null;
  createdAt: string;
}

export class AuditQueryService {
  /**
   * Calculates dashboard summary metrics and event distribution.
   */
  public static async getMetrics(params: {
    organizationId: string;
    workspaceId?: string;
    actorEmail?: string;
    allowedCategories?: string[];
    timeRange?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const now = Date.now();
    let startTime: Date;
    let endTime: Date = params.endDate ? new Date(params.endDate) : new Date(now);

    if (params.timeRange === "15m") {
      startTime = new Date(now - 15 * 60 * 1000);
    } else if (params.timeRange === "1h") {
      startTime = new Date(now - 3600 * 1000);
    } else if (params.timeRange === "24h") {
      startTime = new Date(now - 24 * 3600 * 1000);
    } else if (params.timeRange === "7d") {
      startTime = new Date(now - 7 * 24 * 3600 * 1000);
    } else if (params.timeRange === "30d") {
      startTime = new Date(now - 30 * 24 * 3600 * 1000);
    } else if (params.timeRange === "custom" && params.startDate) {
      startTime = new Date(params.startDate);
    } else {
      startTime = new Date(now - 24 * 3600 * 1000); // Default: Last 24 Hours
    }

    const baseConditions = [
      eq(auditLogs.organizationId, params.organizationId),
      gte(auditLogs.createdAt, startTime),
      lte(auditLogs.createdAt, endTime),
    ];
    if (params.workspaceId) {
      baseConditions.push(eq(auditLogs.workspaceId, params.workspaceId));
    }
    if (params.actorEmail) {
      baseConditions.push(ilike(auditLogs.actorEmail, `%${params.actorEmail.trim()}%`));
    }
    if (params.allowedCategories && params.allowedCategories.length > 0) {
      baseConditions.push(inArray(auditLogs.eventCategory, params.allowedCategories));
    }

    const whereClause = and(...baseConditions);

    // Fetch all logs matching time range for metrics aggregation
    const events = await db
      .select({
        id: auditLogs.id,
        eventCategory: auditLogs.eventCategory,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        outcome: auditLogs.outcome,
        severity: auditLogs.severity,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(whereClause);

    const totalEvents = events.length;
    let failedLogins = 0;
    let adminActions = 0;

    const categoryBreakdown: Record<string, number> = {
      authentication: 0,
      workspace: 0,
      iam: 0,
      database: 0,
      admin: 0,
      system: 0,
    };

    for (const e of events) {
      let cat = e.eventCategory;
      if (!cat || cat === "system") {
        cat = inferCategory(e.action, e.resourceType);
      }
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

      if ((e.action === "user:login" || e.action.startsWith("auth:")) && (e.outcome === "failure" || e.outcome === "denied")) {
        failedLogins++;
      }

      if (
        cat === "admin" ||
        cat === "iam" ||
        e.action.includes("backup:") ||
        e.action.includes("restore:") ||
        e.action.includes("roles:") ||
        e.action.includes("workspace:")
      ) {
        adminActions++;
      }
    }

    // Query active security alerts count
    const alertConditions = [
      eq(securityAlerts.organizationId, params.organizationId),
      inArray(securityAlerts.status, ["open", "investigating"]),
    ];
    if (params.workspaceId) {
      alertConditions.push(eq(securityAlerts.workspaceId, params.workspaceId));
    }

    const activeAlerts = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityAlerts)
      .where(and(...alertConditions));

    const securityAlertsCount = activeAlerts[0]?.count || 0;

    return {
      timeRange: params.timeRange || "24h",
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      metrics: {
        totalAuditEvents: totalEvents,
        failedLoginAttempts: failedLogins,
        administrativeActions: adminActions,
        securityAlerts: securityAlertsCount,
      },
      categoryBreakdown,
    };
  }

  /**
   * Searchable, filterable, server-side paginated Event Explorer query.
   */
  public static async getEvents(params: {
    organizationId: string;
    workspaceId?: string;
    databaseId?: string;
    category?: string;
    action?: string;
    outcome?: string;
    severity?: string;
    actorEmail?: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    timeRange?: string;
    sortBy?: "createdAt" | "action" | "outcome" | "severity";
    sortOrder?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(Math.max(1, params.pageSize || 50), 200);
    const offset = (page - 1) * pageSize;

    const conditions = [eq(auditLogs.organizationId, params.organizationId)];

    if (params.workspaceId) {
      conditions.push(eq(auditLogs.workspaceId, params.workspaceId));
    }
    if (params.databaseId) {
      conditions.push(eq(auditLogs.databaseId, params.databaseId));
    }
    if (params.category && params.category !== "all") {
      conditions.push(eq(auditLogs.eventCategory, params.category));
    }
    if (params.action && params.action !== "all") {
      conditions.push(eq(auditLogs.action, params.action));
    }
    if (params.outcome && params.outcome !== "all") {
      conditions.push(eq(auditLogs.outcome, params.outcome));
    }
    if (params.severity && params.severity !== "all") {
      conditions.push(eq(auditLogs.severity, params.severity));
    }
    if (params.actorEmail) {
      conditions.push(ilike(auditLogs.actorEmail, `%${params.actorEmail.trim()}%`));
    }
    if (params.resourceType && params.resourceType !== "all") {
      conditions.push(eq(auditLogs.resourceType, params.resourceType));
    }
    if (params.resourceId) {
      conditions.push(eq(auditLogs.resourceId, params.resourceId.trim()));
    }
    if (params.ipAddress) {
      conditions.push(ilike(auditLogs.ipAddress, `%${params.ipAddress.trim()}%`));
    }

    // Time-based filtering
    if (params.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(params.startDate)));
    } else if (params.timeRange && params.timeRange !== "all") {
      const now = Date.now();
      const cutoff =
        params.timeRange === "15m"
          ? now - 15 * 60 * 1000
          : params.timeRange === "1h"
          ? now - 3600 * 1000
          : params.timeRange === "24h"
          ? now - 24 * 3600 * 1000
          : params.timeRange === "7d"
          ? now - 7 * 24 * 3600 * 1000
          : params.timeRange === "30d"
          ? now - 30 * 24 * 3600 * 1000
          : 0;

      if (cutoff > 0) {
        conditions.push(gte(auditLogs.createdAt, new Date(cutoff)));
      }
    }

    if (params.endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(params.endDate)));
    }

    // Search query across email, action, resource, ID, IP
    if (params.search && params.search.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(auditLogs.actorEmail, term),
          ilike(auditLogs.action, term),
          ilike(auditLogs.resourceType, term),
          ilike(auditLogs.resourceId, term),
          ilike(auditLogs.ipAddress, term),
          sql`${auditLogs.id}::text ILIKE ${term}`
        )!
      );
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);

    const totalCount = countRow?.count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    let orderColumn;
    if (params.sortBy === "action") {
      orderColumn = auditLogs.action;
    } else if (params.sortBy === "outcome") {
      orderColumn = auditLogs.outcome;
    } else if (params.sortBy === "severity") {
      orderColumn = auditLogs.severity;
    } else {
      orderColumn = auditLogs.createdAt;
    }

    const sortFn = params.sortOrder === "asc" ? asc : desc;

    // Fetch paginated events
    const rows = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(sortFn(orderColumn), desc(auditLogs.id))
      .limit(pageSize)
      .offset(offset);

    const events: AuditEventItem[] = rows.map((r) => {
      let cat = r.eventCategory;
      if (!cat || cat === "system") {
        cat = inferCategory(r.action, r.resourceType);
      }
      return {
        id: r.id,
        organizationId: r.organizationId,
        workspaceId: r.workspaceId,
        databaseId: r.databaseId,
        actorId: r.actorId,
        actorEmail: r.actorEmail,
        eventCategory: cat,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        outcome: r.outcome as "success" | "failure" | "denied",
        severity: (r.severity || "info") as "info" | "warning" | "error" | "critical",
        metadata: r.metadata,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        sessionId: r.sessionId,
        requestId: r.requestId,
        durationMs: r.durationMs,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return {
      events,
      pagination: {
        totalCount,
        page,
        pageSize,
        totalPages,
      },
    };
  }

  /**
   * Fetches single audit event details with organization isolation.
   */
  public static async getEventDetails(id: string, organizationId: string): Promise<AuditEventItem | null> {
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.id, id), eq(auditLogs.organizationId, organizationId)))
      .limit(1);

    if (!row) return null;

    let cat = row.eventCategory;
    if (!cat || cat === "system") {
      cat = inferCategory(row.action, row.resourceType);
    }

    return {
      id: row.id,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      databaseId: row.databaseId,
      actorId: row.actorId,
      actorEmail: row.actorEmail,
      eventCategory: cat,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      outcome: row.outcome as "success" | "failure" | "denied",
      severity: (row.severity || "info") as "info" | "warning" | "error" | "critical",
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      sessionId: row.sessionId,
      requestId: row.requestId,
      durationMs: row.durationMs,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Security Monitoring Alerts query.
   */
  public static async getSecurityAlerts(params: {
    organizationId: string;
    workspaceId?: string;
    status?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(1, params.limit || 50), 100);
    const offset = Math.max(0, params.offset || 0);

    const conditions = [eq(securityAlerts.organizationId, params.organizationId)];
    if (params.workspaceId) {
      conditions.push(eq(securityAlerts.workspaceId, params.workspaceId));
    }
    if (params.status && params.status !== "all") {
      conditions.push(eq(securityAlerts.status, params.status));
    }
    if (params.severity && params.severity !== "all") {
      conditions.push(eq(securityAlerts.severity, params.severity));
    }

    const whereClause = and(...conditions);

    const alerts = await db
      .select()
      .from(securityAlerts)
      .where(whereClause)
      .orderBy(desc(securityAlerts.lastEventAt))
      .limit(limit)
      .offset(offset);

    // Summary counts
    const summaryRows = await db
      .select({
        status: securityAlerts.status,
        count: sql<number>`count(*)::int`,
      })
      .from(securityAlerts)
      .where(eq(securityAlerts.organizationId, params.organizationId))
      .groupBy(securityAlerts.status);

    const summary = {
      total: 0,
      open: 0,
      investigating: 0,
      resolved: 0,
    };

    for (const s of summaryRows) {
      const count = Number(s.count) || 0;
      summary.total += count;
      if (s.status === "open") summary.open = count;
      if (s.status === "investigating") summary.investigating = count;
      if (s.status === "resolved") summary.resolved = count;
    }

    return {
      alerts: alerts.map((a) => ({
        id: a.id,
        ruleId: a.ruleId,
        title: a.title,
        description: a.description,
        severity: a.severity,
        status: a.status,
        relatedUserEmail: a.relatedUserEmail,
        relatedUserId: a.relatedUserId,
        ipAddress: a.ipAddress,
        eventCount: a.eventCount,
        firstEventAt: a.firstEventAt.toISOString(),
        lastEventAt: a.lastEventAt.toISOString(),
        metadata: a.metadata,
        resolvedBy: a.resolvedBy,
        resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      })),
      summary,
    };
  }

  /**
   * Updates investigation status of a security alert.
   */
  public static async updateSecurityAlertStatus(params: {
    alertId: string;
    organizationId: string;
    status: "open" | "investigating" | "resolved";
    actorEmail?: string;
  }) {
    const [alert] = await db
      .select()
      .from(securityAlerts)
      .where(
        and(
          eq(securityAlerts.id, params.alertId),
          eq(securityAlerts.organizationId, params.organizationId)
        )
      )
      .limit(1);

    if (!alert) throw new Error("Security alert not found");

    const [updated] = await db
      .update(securityAlerts)
      .set({
        status: params.status,
        resolvedBy: params.status === "resolved" ? params.actorEmail || "administrator" : null,
        resolvedAt: params.status === "resolved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(securityAlerts.id, alert.id))
      .returning();

    return updated;
  }

  /**
   * Exports audit events in CSV or JSON format respecting applied filters.
   */
  public static async exportEvents(params: {
    organizationId: string;
    workspaceId?: string;
    databaseId?: string;
    category?: string;
    action?: string;
    outcome?: string;
    severity?: string;
    actorEmail?: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    timeRange?: string;
    format: "csv" | "json";
  }): Promise<{ data: string; contentType: string; filename: string }> {
    const { events } = await this.getEvents({
      ...params,
      page: 1,
      pageSize: 2000,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (params.format === "json") {
      const sanitized = events.map((e) => ({
        id: e.id,
        category: e.eventCategory,
        action: e.action,
        status: e.outcome,
        severity: e.severity,
        actor: e.actorEmail || "system",
        resourceType: e.resourceType,
        resourceId: e.resourceId || "",
        ipAddress: e.ipAddress || "",
        userAgent: e.userAgent || "",
        sessionId: e.sessionId || "",
        timestamp: e.createdAt,
        metadata: e.metadata || {},
      }));

      return {
        data: JSON.stringify(sanitized, null, 2),
        contentType: "application/json; charset=utf-8",
        filename: `chronos-audit-export-${timestamp}.json`,
      };
    }

    // CSV format
    const headers = [
      "Event ID",
      "Timestamp (UTC)",
      "Category",
      "Action",
      "Status",
      "Severity",
      "Actor Email",
      "Resource Type",
      "Resource ID",
      "IP Address",
      "User Agent",
    ];

    const escapeCsv = (val: unknown) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(",")];
    for (const e of events) {
      csvRows.push(
        [
          escapeCsv(e.id),
          escapeCsv(e.createdAt),
          escapeCsv(e.eventCategory),
          escapeCsv(e.action),
          escapeCsv(e.outcome),
          escapeCsv(e.severity),
          escapeCsv(e.actorEmail || "system"),
          escapeCsv(e.resourceType),
          escapeCsv(e.resourceId || ""),
          escapeCsv(e.ipAddress || ""),
          escapeCsv(e.userAgent || ""),
        ].join(",")
      );
    }

    return {
      data: csvRows.join("\n"),
      contentType: "text/csv; charset=utf-8",
      filename: `chronos-audit-export-${timestamp}.csv`,
    };
  }
}
