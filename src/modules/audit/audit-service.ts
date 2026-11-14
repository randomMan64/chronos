import { db } from "@/db/connections/control-plane";
import { auditLogs } from "@/db/schema";

export interface LogAuditEventParams {
  organizationId: string;
  workspaceId?: string;
  databaseId?: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome?: "success" | "failure" | "denied";
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export class AuditService {
  public static async log(params: LogAuditEventParams): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        organizationId: params.organizationId,
        workspaceId: params.workspaceId,
        databaseId: params.databaseId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        outcome: params.outcome || "success",
        metadata: params.metadata || {},
        ipAddress: params.ipAddress,
      });
    } catch (err) {
      // Append-only audit logger must log errors without crashing caller
      console.error("[AUDIT_SERVICE_FAILURE]", err);
    }
  }
}

