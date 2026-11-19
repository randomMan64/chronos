import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { AnalyticsService } from "@/modules/analytics/analytics-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { databaseId, query, analyze } = body;

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "SQL query string is required" }, { status: 400 });
    }

    const requiredPermission = analyze ? "performance:explain_analyze" : "performance:explain";
    const { database, context } = await requireDatabaseAccessById(databaseId, requiredPermission);

    const result = await AnalyticsService.explainQuery(
      database.id,
      query.trim(),
      Boolean(analyze),
      context
    );

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
