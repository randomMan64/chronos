import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { AnalyticsService } from "@/modules/analytics/analytics-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { databaseId, pid } = body;

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }
    const targetPid = Number(pid);
    if (!targetPid || isNaN(targetPid) || targetPid <= 0) {
      return NextResponse.json({ error: "Valid numeric pid is required" }, { status: 400 });
    }

    const { database, context } = await requireDatabaseAccessById(databaseId, "performance:session_terminate");

    const result = await AnalyticsService.terminateSession(database.id, targetPid, context);
    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
