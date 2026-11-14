import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { AnalyticsService } from "@/modules/analytics/analytics-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database } = await requireDatabaseAccessById(databaseId, "performance:inspect");

    const indexes = await AnalyticsService.getIndexStats(database.id);
    return NextResponse.json({ indexes });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
