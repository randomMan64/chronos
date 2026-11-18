import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { AuditAuthorization } from "@/modules/audit/audit-authorization";
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
    const timeRange = searchParams.get("timeRange") || "24h";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    // Apply role-based scope boundaries (e.g. Developer only sees metrics for their own operations)
    const scope = AuditAuthorization.enforceQueryScope(context, {
      workspaceId,
      timeRange,
      startDate,
      endDate,
    });

    const data = await AuditQueryService.getMetrics({
      organizationId: orgId,
      workspaceId: scope.sanitizedParams.workspaceId,
      actorEmail: scope.sanitizedParams.actorEmail,
      allowedCategories: scope.allowedCategories,
      timeRange,
      startDate,
      endDate,
    });

    return NextResponse.json(data);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
