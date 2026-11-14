import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database } = await requireDatabaseAccessById(databaseId, "history:read");

    const tables = await TemporalService.getTemporalTables(database.id);
    return NextResponse.json({ temporalTables: tables });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
