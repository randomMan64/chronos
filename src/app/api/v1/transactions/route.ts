import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TransactionService } from "@/modules/transactions/transaction-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");
    const status = searchParams.get("status") || undefined;
    const actor = searchParams.get("actor") || undefined;
    const search = searchParams.get("search") || undefined;
    const minDurationMs = searchParams.get("minDurationMs") ? parseInt(searchParams.get("minDurationMs")!, 10) : undefined;
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");
    const sortBy = (searchParams.get("sortBy") as any) || "startedAt";
    const sortOrder = (searchParams.get("sortOrder") as any) || "desc";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database, context } = await requireDatabaseAccessById(databaseId, "transaction:read");

    const result = await TransactionService.getTransactions({
      databaseId: database.id,
      status,
      actor,
      search,
      minDurationMs,
      startDate: startDateStr ? new Date(startDateStr) : undefined,
      endDate: endDateStr ? new Date(endDateStr) : undefined,
      sortBy,
      sortOrder,
      limit,
      offset,
      context,
    });

    return NextResponse.json({
      transactions: result.items,
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      policy: result.policy,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
