import { NextResponse } from "next/server";
import { requireWorkspaceAccessById } from "@/lib/auth/guards";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { workspace } = await requireWorkspaceAccessById(params.id, "workspace:read");
    const members = await WorkspaceService.getWorkspaceMembers(workspace.id);
    return NextResponse.json({ members });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
