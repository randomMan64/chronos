import { NextResponse } from "next/server";
import { requireDatabaseAccess } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { timeTravelQuerySchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = timeTravelQuerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { organizationId, workspaceId, databaseId, schemaName, tableName, asOfTimestamp, recordId, page, pageSize } =
      parsed.data;

    // Time travel is read-only: requires history:read
    await requireDatabaseAccess(organizationId, workspaceId, databaseId, "history:read");

    const result = await TemporalService.queryAsOfTimestamp({
      databaseId,
      schemaName,
      tableName,
      recordId,
      asOfTimestamp: new Date(asOfTimestamp),
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

