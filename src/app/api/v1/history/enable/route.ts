import { NextResponse } from "next/server";
import { requireDatabaseAccess, requirePermission } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const enableSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  databaseId: z.string().uuid(),
  schemaName: z.string().default("public"),
  tableName: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = enableSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { organizationId, workspaceId, databaseId, schemaName, tableName } = parsed.data;

    const context = await requireDatabaseAccess(
      organizationId,
      workspaceId,
      databaseId,
      "schema:write"
    );

    const result = await TemporalService.enableTemporalTable({
      databaseId,
      schemaName,
      tableName,
      actorEmail: context.email,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

