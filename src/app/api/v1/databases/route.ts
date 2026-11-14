import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { DatabaseService } from "@/modules/databases/database-service";
import { registerDatabaseSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organizationId");
    const wsId = searchParams.get("workspaceId") || undefined;

    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const context = await requireOrganizationAccess(orgId);
    requirePermission(context, "database:read");

    const dbs = await DatabaseService.getDatabases({
      organizationId: orgId,
      workspaceId: wsId,
    });

    return NextResponse.json({ databases: dbs });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerDatabaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const context = await requireOrganizationAccess(parsed.data.organizationId);
    requirePermission(context, "database:create");

    const result = await DatabaseService.registerDatabase({
      organizationId: parsed.data.organizationId,
      workspaceId: parsed.data.workspaceId,
      name: parsed.data.name,
      connectionString: parsed.data.connectionString,
      environment: parsed.data.environment,
      isTemporalEnabled: parsed.data.isTemporalEnabled,
      actorId: context.userId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

