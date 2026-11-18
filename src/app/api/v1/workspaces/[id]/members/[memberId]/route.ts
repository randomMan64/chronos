import { NextResponse } from "next/server";
import { requireWorkspaceAccessById, requirePermission } from "@/lib/auth/guards";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateRoleSchema = z.object({
  role: z.enum([
    "dba",
    "developer",
    "analyst",
    "engineer",
    "auditor",
    "database_engineer",
    "data_analyst",
  ]),
});

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const params = await props.params;
    const { context, workspace } = await requireWorkspaceAccessById(params.id);
    requirePermission(context, "workspace:members:assign");

    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    const updated = await WorkspaceService.updateMemberRole({
      workspaceId: workspace.id,
      organizationId: workspace.organizationId,
      memberId: params.memberId,
      newRole: parsed.data.role as any,
      actorId: context.userId,
    });

    if (!updated) {
      return NextResponse.json({ error: "Workspace member not found" }, { status: 404 });
    }

    return NextResponse.json({ member: updated });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const params = await props.params;
    const { context, workspace } = await requireWorkspaceAccessById(params.id);
    requirePermission(context, "workspace:members:revoke");

    await WorkspaceService.removeWorkspaceMember({
      workspaceId: workspace.id,
      organizationId: workspace.organizationId,
      memberId: params.memberId,
      actorId: context.userId,
    });

    return NextResponse.json({ success: true, message: "Workspace member removed successfully" });
  } catch (err: any) {
    if (err?.message?.includes("not found")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
