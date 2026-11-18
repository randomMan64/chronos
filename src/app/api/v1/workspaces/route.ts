import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import { createWorkspaceSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("organizationId");

    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const context = await requireOrganizationAccess(orgId);
    requirePermission(context, "workspace:read");

    const isOwnerOrAdmin =
      context.organizationRole === "owner" || context.organizationRole === "admin";
    const wss = await WorkspaceService.getAccessibleWorkspaces({
      organizationId: orgId,
      userId: context.userId,
      isOwnerOrAdmin,
    });
    return NextResponse.json({ workspaces: wss });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = createWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const context = await requireOrganizationAccess(parsed.data.organizationId);
    requirePermission(context, "workspace:create");

    const ws = await WorkspaceService.createWorkspace({
      organizationId: parsed.data.organizationId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      environment: parsed.data.environment,
      actorId: context.userId,
    });

    return NextResponse.json({ workspace: ws }, { status: 201 });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

