import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { inviteMemberSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "members:invite");

    const invites = await InvitationService.getInvitations(params.id);
    return NextResponse.json({ invitations: invites });
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
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "members:invite");

    const body = await req.json();
    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const invite = await InvitationService.createInvitation({
      organizationId: params.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invitedBy: context.userId,
    });

    return NextResponse.json({ invitation: invite }, { status: 201 });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

