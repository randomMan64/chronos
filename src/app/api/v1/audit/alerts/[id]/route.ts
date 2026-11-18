import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { AuditAuthorization } from "@/modules/audit/audit-authorization";
import { updateAlertStatusSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organizationId");

    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const context = await requireOrganizationAccess(orgId);
    requirePermission(context, "audit:read");

    // Strictly enforce audit.manage_alerts permission: Allowed for Owner and DBA; Denied for Auditor, Developer, Analyst, DB Engineer
    if (!AuditAuthorization.canManageAlerts(context)) {
      return NextResponse.json(
        { error: "audit.manage_alerts: You do not have permission to manage security alerts. Alert management is restricted to Owner and DBA roles." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = updateAlertStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid status value", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const params = await props.params;
    const updated = await AuditQueryService.updateSecurityAlertStatus({
      alertId: params.id,
      organizationId: orgId,
      status: parsed.data.status,
      actorEmail: context.email,
    });

    return NextResponse.json({ alert: updated });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
