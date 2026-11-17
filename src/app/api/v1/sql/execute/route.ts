import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { SqlService } from "@/modules/sql/sql-service";
import { executeSqlSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = executeSqlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { databaseId, sql, maxRows, timeoutMs } = parsed.data;

    // Enforce database-level access and permission check using authoritative database record
    const { context, database } = await requireDatabaseAccessById(
      databaseId,
      "query:execute"
    );

    const result = await SqlService.executeSql({
      context,
      databaseId: database.id,
      workspaceId: database.workspaceId,
      organizationId: database.organizationId,
      sql,
      maxRows,
      timeoutMs,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

