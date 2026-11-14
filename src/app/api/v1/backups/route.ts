import { NextResponse } from "next/server";
import { requireDatabaseAccess, requireDatabaseAccessById } from "@/lib/auth/guards";
import { BackupService } from "@/modules/backups/backup-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSnapshotSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  databaseId: z.string().uuid(),
  name: z.string().min(2),
  snapshotType: z.enum(["manual", "daily", "pitr_point"]).default("manual"),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const databaseId = searchParams.get("databaseId");

    if (!databaseId) {
      return NextResponse.json({ error: "databaseId is required" }, { status: 400 });
    }

    const { database } = await requireDatabaseAccessById(databaseId, "backup:read");
    const snapshots = await BackupService.getSnapshots(database.id);
    return NextResponse.json({ snapshots });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createSnapshotSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { organizationId, workspaceId, databaseId, name, snapshotType } = parsed.data;

    const context = await requireDatabaseAccess(
      organizationId,
      workspaceId,
      databaseId,
      "backup:create"
    );

    const snapshot = await BackupService.createSnapshot({
      context,
      organizationId,
      workspaceId,
      databaseId,
      name,
      snapshotType,
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
