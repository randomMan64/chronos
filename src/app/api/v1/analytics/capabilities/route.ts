import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { AnalyticsService } from "@/modules/analytics/analytics-service";
import { PerformanceAuthorization } from "@/modules/analytics/performance-authorization";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database, context } = await requireDatabaseAccessById(databaseId, "performance:overview");

    const capabilities = await AnalyticsService.probeCapabilities(database.id);
    const policy = PerformanceAuthorization.resolvePolicy(context);

    return NextResponse.json({
      capabilities,
      policy,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
