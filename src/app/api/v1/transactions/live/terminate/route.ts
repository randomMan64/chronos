import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TransactionService } from "@/modules/transactions/transaction-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { databaseId, pid } = body;

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }
    if (!pid || typeof pid !== "number") {
      return NextResponse.json({ error: "Valid integer PID is required" }, { status: 400 });
    }

    const { database, context } = await requireDatabaseAccessById(
      databaseId,
      "transaction:session_terminate"
    );

    const result = await TransactionService.terminateSession(database.id, pid, context);

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
