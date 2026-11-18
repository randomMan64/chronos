import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");
    const tableName = searchParams.get("tableName") || searchParams.get("table");
    const recordId = searchParams.get("recordId");
    const schema = searchParams.get("schema") || "public";

    if (!databaseId || !tableName || !recordId) {
      return NextResponse.json(
        { error: "databaseId, tableName, and recordId are required" },
        { status: 400 }
      );
    }

    const { database } = await requireDatabaseAccessById(databaseId, "history:read");

    const currentRecord = await TemporalService.getCurrentRecord({
      databaseId: database.id,
      schemaName: schema,
      tableName,
      recordId,
    });

    return NextResponse.json({ currentRecord });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
