import { NextResponse } from "next/server";
import { requireDatabaseAccessById } from "@/lib/auth/guards";
import { DatabaseService } from "@/modules/databases/database-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { database } = await requireDatabaseAccessById(params.id, "schema:read");
    const schemas = await DatabaseService.introspectSchemas(database.id);
    return NextResponse.json({ schemas });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
