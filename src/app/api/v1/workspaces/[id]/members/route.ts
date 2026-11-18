import { NextResponse } from "next/server";
import { requireWorkspaceAccessById, requirePermission } from "@/lib/auth/guards";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const addMemberSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
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

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { context, workspace } = await requireWorkspaceAccessById(params.id);
    requirePermission(context, "workspace:read");

    const members = await WorkspaceService.getWorkspaceMembers(workspace.id);
    return NextResponse.json({ members });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const { context, workspace } = await requireWorkspaceAccessById(params.id);
    requirePermission(context, "workspace:members:assign");

    const body = await req.json();
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const member = await WorkspaceService.addWorkspaceMember({
      workspaceId: workspace.id,
      organizationId: workspace.organizationId,
      userId: parsed.data.userId,
      role: parsed.data.role as any,
      actorId: context.userId,
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (err: any) {
    if (
      err?.message?.includes("User must belong") ||
      err?.message?.includes("already a member") ||
      err?.message?.includes("Workspace not found")
    ) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
