import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "members:manage");

    const revoked = await InvitationService.revokeInvitation({
      organizationId: params.id,
      invitationId: params.inviteId,
      actorId: context.userId,
    });

    return NextResponse.json({ success: true, revoked });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

