import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { handleApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "members:invite");

    const result = await InvitationService.cleanupDisposableInvitations({
      organizationId: params.id,
      actorId: context.userId,
    });

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${result.revokedCount} invalid disposable invitation(s).`,
      ...result,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
