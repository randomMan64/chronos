import { NextResponse } from "next/server";
import { requireDatabaseAccess } from "@/lib/auth/guards";
import { SqlService } from "@/modules/sql/sql-service";
import { explainSqlSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = explainSqlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { databaseId, workspaceId, organizationId, sql, analyze } = parsed.data;

    const context = await requireDatabaseAccess(
      organizationId,
      workspaceId,
      databaseId,
      "query:read"
    );

    const result = await SqlService.explainSql({
      context,
      databaseId,
      sql,
      analyze,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

