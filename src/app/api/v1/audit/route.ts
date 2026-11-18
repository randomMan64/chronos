import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { AuditAuthorization } from "@/modules/audit/audit-authorization";
import { auditFilterSchema } from "@/lib/validation";
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

    const rawParams: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawParams[key] = val;
    });

    const parsed = auditFilterSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid audit query parameters", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Enforce role-based query scope (e.g. My Activity for Developer/Analyst, Workspace DB for DB Engineer)
    const scope = AuditAuthorization.enforceQueryScope(context, parsed.data);
    const data = await AuditQueryService.getEvents(scope.sanitizedParams);

    return NextResponse.json({
      events: data.events,
      pagination: data.pagination,
      policy: scope.policy,
      isOwnActivityOnly: scope.isOwnActivityOnly,
      isDatabaseScopeOnly: scope.isDatabaseScopeOnly,
      logs: data.events,
      auditLogs: data.events,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

// Strict enforcement: audit.modify_events and audit.delete_events are strictly No for all roles
export async function POST() {
  return NextResponse.json(
    { error: "Audit records are immutable and append-only. Manual insertion is strictly forbidden." },
    { status: 405 }
  );
}

export async function PUT() {
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
