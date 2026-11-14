import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { userDbManager } from "@/db/connections/user-database";
import { encryptCredential } from "@/lib/crypto";
import { testDatabaseSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = testDatabaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid connection string", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const test = await userDbManager.testConnection({
      id: "adhoc-test",
      connectionStringEncrypted: encryptCredential(parsed.data.connectionString),
    });

    return NextResponse.json(test);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

