import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
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

    const { databaseId, schemaName, tableName, asOfTimestamp, recordId, page, pageSize } =
      parsed.data;

    // Time travel is read-only: requires history:read
    const { database } = await requireDatabaseAccessById(databaseId, "history:read");

    const parsedDate = new Date(asOfTimestamp);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid AS OF timestamp provided." }, { status: 400 });
    }

    const result = await TemporalService.queryAsOfTimestamp({
      databaseId: database.id,
      schemaName,
      tableName,
      recordId,
      asOfTimestamp: parsedDate,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

