import { db } from "@/db/connections/control-plane";
import { auditLogs, securityAlerts } from "@/db/schema";
import { eq, and, gte, inArray } from "drizzle-orm";

export type AuditCategory =
  | "authentication"
  | "workspace"
  | "iam"
  | "database"
  | "admin"
  | "system";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface LogAuditEventParams {
  organizationId: string;
  workspaceId?: string;
  databaseId?: string;
  actorId?: string;
  actorEmail?: string;
  eventCategory?: AuditCategory;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome?: "success" | "failure" | "denied";
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  durationMs?: number;
}

export function inferCategory(action: string, resourceType?: string): AuditCategory {
  const act = action.toLowerCase();
  const res = (resourceType || "").toLowerCase();

  if (
    act.startsWith("auth:") ||
    act.startsWith("user:") ||
    act.startsWith("password:") ||
    act.startsWith("session:") ||
    act.startsWith("device:") ||
    act.includes("login") ||
    act.includes("logout") ||
    act.includes("session") ||
    res === "session" ||
    res === "device" ||
    res === "user"
  ) {
    return "authentication";
  }

  if (
    act.startsWith("workspace:") ||
    act.startsWith("member:") ||
    act.startsWith("members:") ||
    act.startsWith("invitation:") ||
    act.startsWith("invitations:") ||
    res === "workspace" ||
    res === "invitation" ||
    res === "member"
  ) {
    return "workspace";
  }

  if (
    act.startsWith("role:") ||
    act.startsWith("roles:") ||
    act.startsWith("permission:") ||
    act.startsWith("permissions:") ||
    act.startsWith("access:") ||
    act.includes("role") ||
    act.includes("permission") ||
    res === "role" ||
    res === "permission"
  ) {
    return "iam";
  }

  if (
    act.startsWith("database:") ||
    act.startsWith("sql:") ||
    act.startsWith("schema:") ||
    act.startsWith("table:") ||
    act.startsWith("connection:") ||
    act.startsWith("record:") ||
    act.startsWith("history:") ||
    act.includes("query") ||
    act.includes("record") ||
    res === "query" ||
    res === "schema" ||
    res === "table" ||
    res === "row_version" ||
    res === "database_record" ||
    res === "database_table"
  ) {
    return "database";
  }

  if (
    act.startsWith("cluster:") ||
    act.startsWith("backup:") ||
    act.startsWith("restore:") ||
    act.startsWith("admin:") ||
    act.startsWith("organization:") ||
    act.startsWith("account:") ||
    act.includes("backup") ||
    act.includes("restore") ||
    res === "database" ||
    res === "cluster" ||
    res === "snapshot" ||
    res === "backup" ||
    res === "organization"
  ) {
    return "admin";
  }

  return "system";
}

export function inferSeverity(outcome: string, action: string): AuditSeverity {
  const act = action.toLowerCase();
  if (outcome === "denied") return "warning";
  if (outcome === "failure") return "error";

  if (
    act.includes("delete") ||
    act.includes("drop") ||
    act.includes("destroy") ||
    act.includes("transfer_ownership")
  ) {
    return "warning";
  }

  if (act.includes("organization:delete") || act.includes("sign_out_everywhere")) {
    return "critical";
  }

  return "info";
}

export class AuditService {
  /**
   * Records an append-only audit event and evaluates security rules.
   */
  public static async log(params: LogAuditEventParams): Promise<void> {
    try {
      const outcome = params.outcome || "success";
      const category = params.eventCategory || inferCategory(params.action, params.resourceType);
      const severity = params.severity || inferSeverity(outcome, params.action);

      // Sanitize metadata to never log sensitive credentials, passwords, or tokens
      const sanitizedMetadata = { ...(params.metadata || {}) };
      delete (sanitizedMetadata as Record<string, unknown>).password;
      delete (sanitizedMetadata as Record<string, unknown>).passwordHash;
      delete (sanitizedMetadata as Record<string, unknown>).token;
      delete (sanitizedMetadata as Record<string, unknown>).tokenHash;
      delete (sanitizedMetadata as Record<string, unknown>).secret;
      delete (sanitizedMetadata as Record<string, unknown>).connectionString;
      delete (sanitizedMetadata as Record<string, unknown>).connectionStringEncrypted;

      await db.insert(auditLogs).values({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        databaseId: params.databaseId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        eventCategory: category,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        outcome,
        severity,
        metadata: sanitizedMetadata,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        sessionId: params.sessionId,
        requestId: params.requestId,
        durationMs: params.durationMs,
      });

      // Asynchronously evaluate real security detection rules
      AuditService.evaluateSecurityRules({
        ...params,
        eventCategory: category,
        outcome,
        severity,
      }).catch((ruleErr) => {
        console.warn("[SECURITY_RULE_EVAL_ERROR]", ruleErr);
      });
    } catch (err) {
      // Append-only audit logger must log errors without crashing caller
      console.error("[AUDIT_SERVICE_FAILURE]", err);
    }
  }

  /**
   * Explicit security detection rules operating on real audit events
   */
  private static async evaluateSecurityRules(params: LogAuditEventParams & {
    eventCategory: AuditCategory;
    outcome: "success" | "failure" | "denied";
    severity: AuditSeverity;
  }): Promise<void> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Rule 1: Repeated Failed Logins
    if (params.action === "user:login" && params.outcome === "failure") {
      const recentFailures = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, params.organizationId),
            eq(auditLogs.action, "user:login"),
            eq(auditLogs.outcome, "failure"),
            gte(auditLogs.createdAt, fifteenMinutesAgo)
          )
        );

      const matchingFailures = recentFailures.filter(
        (f) =>
          (params.actorEmail && f.actorEmail === params.actorEmail) ||
          (params.ipAddress && f.ipAddress === params.ipAddress)
      );

      if (matchingFailures.length >= 3) {
        await AuditService.recordOrUpdateAlert({
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          ruleId: "REPEATED_LOGIN_FAILURES",
          title: "Repeated Failed Login Attempts",
          description: `Observed ${matchingFailures.length} failed authentication attempts for ${params.actorEmail || params.ipAddress} within 15 minutes.`,
          severity: matchingFailures.length >= 5 ? "critical" : "high",
          relatedUserEmail: params.actorEmail,
          relatedUserId: params.actorId,
          ipAddress: params.ipAddress,
          eventCount: matchingFailures.length,
          metadata: { failureCount: matchingFailures.length, sampleIp: params.ipAddress },
        });
      }
    }

    // Rule 2: Repeated Access Denied Events
    if (params.outcome === "denied") {
      const recentDenied = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, params.organizationId),
            eq(auditLogs.outcome, "denied"),
            gte(auditLogs.createdAt, fifteenMinutesAgo)
          )
        );

      const matchingDenied = recentDenied.filter(
        (d) =>
          (params.actorEmail && d.actorEmail === params.actorEmail) ||
          (params.ipAddress && d.ipAddress === params.ipAddress)
      );

      if (matchingDenied.length >= 3) {
        await AuditService.recordOrUpdateAlert({
          organizationId: params.organizationId,
          workspaceId: params.workspaceId,
          ruleId: "REPEATED_ACCESS_DENIED",
          title: "Multiple Unauthorized Access Rejections",
          description: `User "${params.actorEmail || "unknown"}" was denied permission for ${matchingDenied.length} restricted operations in 15 minutes.`,
          severity: "high",
          relatedUserEmail: params.actorEmail,
          relatedUserId: params.actorId,
          ipAddress: params.ipAddress,
          eventCount: matchingDenied.length,
          metadata: { deniedCount: matchingDenied.length, lastAction: params.action },
        });
      }
    }

    // Rule 3: Privileged Role Assignment / Ownership Transfer
    if (
      params.action === "organization:transfer_ownership" ||
      (params.action === "roles:assign" &&
        (params.metadata?.newRole === "owner" || params.metadata?.newRole === "dba"))
    ) {
      await AuditService.recordOrUpdateAlert({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        ruleId: "PERMISSION_ESCALATION",
        title: "Privileged Role Assignment / Escalation",
        description: `Actor "${params.actorEmail || "system"}" assigned high-privilege access or ownership to target resource "${params.resourceId || "unknown"}".`,
        severity: params.action.includes("transfer_ownership") ? "high" : "medium",
        relatedUserEmail: params.actorEmail,
        relatedUserId: params.actorId,
        ipAddress: params.ipAddress,
        eventCount: 1,
        metadata: { action: params.action, targetRole: params.metadata?.newRole },
      });
    }

    // Rule 4: Destructive Administrative Actions
    if (
      params.action === "organization:delete" ||
      params.action === "workspace:delete" ||
      params.action === "database:delete" ||
      params.action === "backup:restore"
    ) {
      await AuditService.recordOrUpdateAlert({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        ruleId: "SUSPICIOUS_ADMIN_ACTION",
        title: "Destructive Administrative Operation",
        description: `High-impact administrative action "${params.action}" executed on ${params.resourceType} "${params.resourceId || "target"}".`,
        severity: params.action === "organization:delete" ? "critical" : "high",
        relatedUserEmail: params.actorEmail,
        relatedUserId: params.actorId,
        ipAddress: params.ipAddress,
        eventCount: 1,
        metadata: { action: params.action, resourceType: params.resourceType, resourceId: params.resourceId },
      });
    }

    // Rule 5: Bulk Multi-Device Session Invalidation
    if (
      params.action === "session:revoke_others" ||
      params.action === "session:sign_out_everywhere"
    ) {
      await AuditService.recordOrUpdateAlert({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        ruleId: "SUSPICIOUS_SESSION",
        title: "Bulk Multi-Device Session Invalidation",
        description: `User "${params.actorEmail || "unknown"}" terminated all concurrent active device sessions.`,
        severity: "medium",
        relatedUserEmail: params.actorEmail,
        relatedUserId: params.actorId,
        ipAddress: params.ipAddress,
        eventCount: 1,
        metadata: { action: params.action },
      });
    }
  }

  /**
   * Deduplicates active alerts by updating existing open alerts or creating a new one
   */
  private static async recordOrUpdateAlert(params: {
    organizationId: string;
    workspaceId?: string;
    ruleId: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    relatedUserEmail?: string;
    relatedUserId?: string;
    ipAddress?: string;
    eventCount: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);

    const existingAlerts = await db
      .select()
      .from(securityAlerts)
      .where(
        and(
          eq(securityAlerts.organizationId, params.organizationId),
          eq(securityAlerts.ruleId, params.ruleId),
          inArray(securityAlerts.status, ["open", "investigating"]),
          gte(securityAlerts.createdAt, twoHoursAgo)
        )
      );

    const match = existingAlerts.find(
      (a) =>
        (params.relatedUserEmail && a.relatedUserEmail === params.relatedUserEmail) ||
        (params.ipAddress && a.ipAddress === params.ipAddress)
    );

    if (match) {
      await db
        .update(securityAlerts)
        .set({
          eventCount: Math.max(match.eventCount + 1, params.eventCount),
          lastEventAt: new Date(),
          severity: params.severity,
          updatedAt: new Date(),
          description: params.description,
          metadata: { ...(match.metadata || {}), ...(params.metadata || {}) },
        })
        .where(eq(securityAlerts.id, match.id));
    } else {
      await db.insert(securityAlerts).values({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        ruleId: params.ruleId,
        title: params.title,
        description: params.description,
        severity: params.severity,
        status: "open",
        relatedUserEmail: params.relatedUserEmail,
        relatedUserId: params.relatedUserId,
        ipAddress: params.ipAddress,
        eventCount: params.eventCount,
        firstEventAt: new Date(),
        lastEventAt: new Date(),
        metadata: params.metadata || {},
      });
    }
  }
}
