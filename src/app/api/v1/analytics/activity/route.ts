import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TransactionService } from "@/modules/transactions/transaction-service";
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

    const activity = await TransactionService.getLiveActivity(database.id);
    return NextResponse.json({ activity });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
