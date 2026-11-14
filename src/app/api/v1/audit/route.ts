import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organizationId");

    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const context = await requireOrganizationAccess(orgId);
    requirePermission(context, "audit:read");

    const workspaceId = searchParams.get("workspaceId") || undefined;
    const databaseId = searchParams.get("databaseId") || undefined;
    const action = searchParams.get("action") || undefined;
    const actorEmail = searchParams.get("actorEmail") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const logs = await AuditQueryService.getLogs({
      organizationId: orgId,
      workspaceId,
      databaseId,
      action,
      actorEmail,
      limit,
      offset,
    });

    return NextResponse.json({ auditLogs: logs });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

