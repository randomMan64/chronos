import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TransactionService } from "@/modules/transactions/transaction-service";
import { handleApiError } from "@/lib/errors";
import { db } from "@/db/connections/control-plane";
import { transactionEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;

    // Lookup transaction to identify tenant database
    const [txRecord] = await db
      .select({ databaseId: transactionEvents.databaseId })
      .from(transactionEvents)
      .where(eq(transactionEvents.transactionId, params.id))
      .limit(1);

    if (!txRecord) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Tenant and RBAC verification on transaction's database
    const { context } = await requireDatabaseAccessById(txRecord.databaseId, "transaction:read");

    const details = await TransactionService.getTransactionDetails(params.id, context);

    if (!details) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
