import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ table: string }> }
) {
  try {
    const params = await props.params;
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");
    const schema = searchParams.get("schema") || "public";
    const recordId = searchParams.get("recordId") || undefined;
    const operation = searchParams.get("operation") || undefined;
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database } = await requireDatabaseAccessById(databaseId, "history:read");

    const versions = await TemporalService.getRecordTimeline({
      databaseId: database.id,
      schemaName: schema,
      tableName: params.table,
      recordId,
      operation,
      startDate: startDateStr ? new Date(startDateStr) : undefined,
      endDate: endDateStr ? new Date(endDateStr) : undefined,
      limit,
      offset,
    });

    return NextResponse.json({ versions });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
