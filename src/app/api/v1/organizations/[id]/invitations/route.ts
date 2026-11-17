import { NextResponse } from "next/server";
import {
  requireOrganizationAccess,
  requirePermission,
  requireCanAssignRole,
} from "@/lib/auth/guards";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { inviteMemberSchema } from "@/lib/validation";
import { validateEmail } from "@/lib/auth/email-validator";
import { handleApiError } from "@/lib/errors";

export const runtime = "nodejs";
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

    // Role hierarchy authorization check
    requireCanAssignRole(context, parsed.data.role);

    // Centralized server-side validation: reject disposable and invalid emails BEFORE any action
    const emailValidation = validateEmail(parsed.data.email);
    if (!emailValidation.valid) {
      if (emailValidation.isDisposable) {
        return NextResponse.json(
          {
            success: false,
            code: "DISPOSABLE_EMAIL",
            message:
              "Temporary or disposable email addresses are not allowed. Please use a permanent email address.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          code: "INVALID_EMAIL",
          message: emailValidation.error || "Invalid email address format.",
        },
        { status: 400 }
      );
    }

    const invite = await InvitationService.createInvitation({
      organizationId: params.id,
      email: emailValidation.normalizedEmail,
      role: parsed.data.role,
      invitedBy: context.userId,
    });

    return NextResponse.json({ invitation: invite }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "DISPOSABLE_EMAIL") {
      return NextResponse.json(
        {
          success: false,
          code: "DISPOSABLE_EMAIL",
          message:
            "Temporary or disposable email addresses are not allowed. Please use a permanent email address.",
        },
        { status: 400 }
      );
    }
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

