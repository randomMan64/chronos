import { NextResponse } from "next/server";
import { requireDatabaseAccess } from "@/lib/auth/guards";
import { BackupService } from "@/modules/backups/backup-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const restoreSnapshotSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  databaseId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  confirmationPhrase: z.string(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = restoreSnapshotSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { organizationId, workspaceId, databaseId, snapshotId, confirmationPhrase } = parsed.data;

    const context = await requireDatabaseAccess(
      organizationId,
      workspaceId,
      databaseId,
      "backup:restore"
    );

    const result = await BackupService.restoreSnapshot({
      context,
      organizationId,
      workspaceId,
      databaseId,
      snapshotId,
      confirmationPhrase,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

