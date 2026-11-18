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

    // Strictly enforce audit.export permission: Allowed for Owner, DBA, Auditor; Denied for Developer, Data Analyst, DB Engineer
    if (!AuditAuthorization.canExportAudit(context)) {
      return NextResponse.json(
        { error: "audit.export: Your role does not have permission to export audit records. Export is restricted to Owner, DBA, and Auditor roles." },
        { status: 403 }
      );
    }

    const rawParams: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawParams[key] = val;
    });

    const parsed = auditFilterSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
    }

    const scope = AuditAuthorization.enforceQueryScope(context, parsed.data);
    const format = (searchParams.get("format") || "csv").toLowerCase() === "json" ? "json" : "csv";

    const exportResult = await AuditQueryService.exportEvents({
      ...scope.sanitizedParams,
      format,
    });

    return new Response(exportResult.data, {
      status: 200,
      headers: {
        "Content-Type": exportResult.contentType,
        "Content-Disposition": `attachment; filename="${exportResult.filename}"`,
        "Cache-Control": "no-store, no-cache",
      },
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
