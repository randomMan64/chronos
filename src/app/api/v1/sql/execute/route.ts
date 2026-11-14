import { NextResponse } from "next/server";
import { requireDatabaseAccess } from "@/lib/auth/guards";
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

    const { databaseId, workspaceId, organizationId, sql, maxRows, timeoutMs } = parsed.data;

    // Enforce database-level access and permission check
    const context = await requireDatabaseAccess(
      organizationId,
      workspaceId,
      databaseId,
      "query:execute"
    );

    const result = await SqlService.executeSql({
      context,
      databaseId,
      workspaceId,
      organizationId,
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

