import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
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

    const { databaseId, sql, analyze } = parsed.data;

    const { context, database } = await requireDatabaseAccessById(
      databaseId,
      "query:read"
    );

    const result = await SqlService.explainSql({
      context,
      databaseId: database.id,
      sql,
      analyze,
    });

    const queryPlan = result.rows?.[0]?.["QUERY PLAN"] ?? result.rows;

    return NextResponse.json({
      plan: queryPlan,
      rows: result.rows,
      durationMs: result.durationMs,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

