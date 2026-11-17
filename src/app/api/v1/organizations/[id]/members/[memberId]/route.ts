import { NextResponse } from "next/server";
import {
  requireOrganizationAccess,
  requirePermission,
  requireCanAssignRole,
} from "@/lib/auth/guards";
import { OrganizationService } from "@/modules/organizations/organization-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateRoleSchema = z.object({
  role: z.enum([
    "owner",
    "dba",
    "developer",
    "data_analyst",
    "database_engineer",
    "auditor",
    "admin",
    "member",
  ]),
});

export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "members:manage");

    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
    }

    // Role hierarchy authorization check
    requireCanAssignRole(context, parsed.data.role);

    const updated = await OrganizationService.updateMemberRole({
      organizationId: params.id,
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

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "members:manage");

    const deleted = await OrganizationService.removeMember({
      organizationId: params.id,
      memberId: params.memberId,
      actorId: context.userId,
    });

    return NextResponse.json({ success: true, removed: deleted });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

