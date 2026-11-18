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

    const policy = AuditAuthorization.resolvePolicy(context);

    // Non-administrative roles (Developer, Data Analyst, Database Engineer) do not have organization security alert visibility
    if (!policy.canViewOrganization && policy.role !== "auditor") {
      return NextResponse.json({
        alerts: [],
        summary: { total: 0, open: 0, investigating: 0, resolved: 0 },
        message: "Security alerts are restricted to Owner, DBA, and Auditor roles.",
      });
    }

    const workspaceId = searchParams.get("workspaceId") || undefined;
    const status = searchParams.get("status") || undefined;
    const severity = searchParams.get("severity") || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

    const data = await AuditQueryService.getSecurityAlerts({
      organizationId: orgId,
      workspaceId,
      status,
      severity,
      limit,
      offset,
    });

    return NextResponse.json({
      ...data,
      canManageAlerts: policy.canManageAlerts,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
