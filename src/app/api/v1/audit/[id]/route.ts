import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { AuditQueryService } from "@/modules/audit/audit-query-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const params = await props.params;
    const log = await AuditQueryService.getLogDetails(params.id);

    if (!log) {
      return NextResponse.json({ error: "Audit event not found" }, { status: 404 });
    }

    return NextResponse.json({ auditLog: log });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

