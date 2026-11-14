import { NextResponse } from "next/server";
import { requireAuth, requireWorkspaceAccessById, requireDatabaseAccessById } from "@/lib/auth/guards";
import { SqlService } from "@/modules/sql/sql-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const saveQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  databaseId: z.string().uuid(),
  title: z.string().min(1),
  queryText: z.string().min(1),
  description: z.string().optional(),
  isShared: z.boolean().default(false),
});

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    const { workspace } = await requireWorkspaceAccessById(workspaceId, "query:read");

    const saved = await SqlService.getSavedQueries(workspace.id, auth.userId);
    return NextResponse.json({ savedQueries: saved });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    const body = await req.json();
    const parsed = saveQuerySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Verify workspace access and database access
    await requireWorkspaceAccessById(parsed.data.workspaceId, "query:read");
    await requireDatabaseAccessById(parsed.data.databaseId, "query:read");

    const saved = await SqlService.saveQuery({
      workspaceId: parsed.data.workspaceId,
      databaseId: parsed.data.databaseId,
      userId: auth.userId,
      title: parsed.data.title,
      queryText: parsed.data.queryText,
      description: parsed.data.description,
      isShared: parsed.data.isShared,
    });

    return NextResponse.json({ savedQuery: saved }, { status: 201 });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
