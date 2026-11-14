import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { DatabaseService } from "@/modules/databases/database-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string; table: string }> }
) {
  try {
    const params = await props.params;
    const { database } = await requireDatabaseAccessById(params.id, "query:read");
    const { searchParams } = new URL(req.url);

    const schema = searchParams.get("schema") || "public";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 500);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
    const orderBy = searchParams.get("orderBy") || undefined;
    const orderDir = (searchParams.get("orderDir") as "ASC" | "DESC") || undefined;

    const result = await DatabaseService.fetchTableRows({
      databaseId: database.id,
      schema,
      table: params.table,
      limit,
      offset,
      orderBy,
      orderDir,
    });

    return NextResponse.json({
      table: params.table,
      schema,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      durationMs: result.durationMs,
      limit,
      offset,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
