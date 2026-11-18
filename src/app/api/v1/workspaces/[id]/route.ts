import { NextResponse } from "next/server";
import { requireWorkspaceAccessById, requirePermission } from "@/lib/auth/guards";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { context, workspace } = await requireWorkspaceAccessById(params.id);
    requirePermission(context, "workspace:read");

    const details = await WorkspaceService.getWorkspaceDetails(workspace.id);
    if (!details) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({ workspace: details });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { context, workspace } = await requireWorkspaceAccessById(params.id);
    requirePermission(context, "workspace:delete");

    const result = await WorkspaceService.deleteWorkspace({
      workspaceId: workspace.id,
      organizationId: workspace.organizationId,
      actorId: context.userId,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err?.message?.includes("Cannot delete the only workspace")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
