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
    const { database: dbRecord } = await requireDatabaseAccessById(params.id, "database:read");
    const db = await DatabaseService.getDatabaseDetails(dbRecord.id);

    if (!db) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 });
    }

    return NextResponse.json({
      database: {
        id: db.id,
        workspaceId: db.workspaceId,
        organizationId: db.organizationId,
        name: db.name,
        host: db.host,
        port: db.port,
        databaseName: db.databaseName,
        username: db.username,
        environment: db.environment,
        status: db.status,
        lastTestedAt: db.lastTestedAt,
        isTemporalEnabled: db.isTemporalEnabled,
      },
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
