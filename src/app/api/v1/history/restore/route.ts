import { NextResponse } from "next/server";
import { requireDatabaseAccess } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { restoreRecordSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = restoreRecordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { organizationId, workspaceId, databaseId, versionId, reason } = parsed.data;

    const context = await requireDatabaseAccess(
      organizationId,
      workspaceId,
      databaseId,
      "history:restore"
    );

    const result = await TemporalService.restoreRecord({
      context,
      organizationId,
      workspaceId,
      databaseId,
      versionId,
      reason,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

