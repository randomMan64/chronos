import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { AuditAuthorization } from "@/modules/audit/audit-authorization";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
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

    const params = await props.params;
    const event = await AuditQueryService.getEventDetails(params.id, orgId);

    if (!event) {
      return NextResponse.json({ error: "Audit event not found" }, { status: 404 });
    }

    // Role-based boundary: Developer/Analyst can only inspect their own event; DB Engineer can only inspect DB events
    if (!AuditAuthorization.canViewEvent(context, event)) {
      return NextResponse.json(
        { error: "Access denied: You do not have permission to inspect this audit event." },
        { status: 403 }
      );
    }

    return NextResponse.json({ event, auditLog: event });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

// Strict enforcement: audit.modify_events and audit.delete_events are strictly No for all roles
export async function PUT() {
  return NextResponse.json(
    { error: "audit.modify_events: Modifying audit records is strictly prohibited across all roles." },
    { status: 403 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "audit.modify_events: Modifying audit records is strictly prohibited across all roles." },
    { status: 403 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "audit.delete_events: Deleting audit records is strictly prohibited across all roles." },
    { status: 403 }
  );
}
