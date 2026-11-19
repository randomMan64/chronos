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
    const minDurationStr = searchParams.get("minDuration");
    const search = searchParams.get("search") || undefined;
    const limitStr = searchParams.get("limit");

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database, context } = await requireDatabaseAccessById(databaseId, "performance:query_stats");

    const timeRange = (startStr || endStr) ? {
      start: startStr ? new Date(startStr) : undefined,
      end: endStr ? new Date(endStr) : undefined,
    } : undefined;

    const minDurationMs = minDurationStr ? Number(minDurationStr) : undefined;
    const limit = limitStr ? Math.min(Number(limitStr), 200) : 50;

    const queries = await AnalyticsService.getQueryPerformance(database.id, {
      timeRange,
      minDurationMs,
      search,
      limit,
      context,
    });

    return NextResponse.json({ queries });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
