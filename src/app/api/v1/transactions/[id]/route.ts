import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { TransactionService } from "@/modules/transactions/transaction-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const details = await TransactionService.getTransactionDetails(params.id);

    if (!details) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Tenant and RBAC verification on transaction's database
    await requireDatabaseAccessById(details.transaction.databaseId, "transaction:inspect");

    return NextResponse.json(details);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
