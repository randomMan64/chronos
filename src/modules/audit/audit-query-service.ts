import { db } from "@/db/connections/control-plane";
import { auditLogs } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export class AuditQueryService {
  public static async getLogs(params: {
    organizationId: string;
    workspaceId?: string;
    databaseId?: string;
    action?: string;
    actorEmail?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    const conditions = [eq(auditLogs.organizationId, params.organizationId)];

    if (params.workspaceId) conditions.push(eq(auditLogs.workspaceId, params.workspaceId));
    if (params.databaseId) conditions.push(eq(auditLogs.databaseId, params.databaseId));
    if (params.action) conditions.push(eq(auditLogs.action, params.action));
    if (params.actorEmail) conditions.push(eq(auditLogs.actorEmail, params.actorEmail));

    return await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  public static async getLogDetails(id: string) {
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, id))
      .limit(1);

    return log || null;
  }
}

