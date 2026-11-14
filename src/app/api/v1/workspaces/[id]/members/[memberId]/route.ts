import { NextResponse } from "next/server";
import { requireWorkspaceAccessById } from "@/lib/auth/guards";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateRoleSchema = z.object({
  role: z.enum(["dba", "developer", "analyst", "engineer", "auditor"]),
});

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const params = await props.params;
    // Require member management permissions on this workspace
    const { context, workspace } = await requireWorkspaceAccessById(params.id, "members:manage");

    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    const updated = await WorkspaceService.updateMemberRole({
      workspaceId: workspace.id,
      organizationId: workspace.organizationId,
      memberId: params.memberId,
      newRole: parsed.data.role,
      actorId: context.userId,
    });

    return NextResponse.json({ member: updated });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
