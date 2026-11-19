import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { AnalyticsService } from "@/modules/analytics/analytics-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");
    const startStr = searchParams.get("start");
    const endStr = searchParams.get("end");

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database } = await requireDatabaseAccessById(databaseId, "performance:overview");

    const timeRange = {
      start: startStr ? new Date(startStr) : undefined,
      end: endStr ? new Date(endStr) : undefined,
    };

    const overview = await AnalyticsService.getPerformanceOverview(database.id, timeRange);
    return NextResponse.json(overview);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
