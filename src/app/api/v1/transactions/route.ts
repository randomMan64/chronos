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
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database } = await requireDatabaseAccessById(databaseId, "transaction:inspect");

    const transactions = await TransactionService.getTransactions({
      databaseId: database.id,
      status,
      limit,
      offset,
    });

    return NextResponse.json({ transactions });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
