import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ token: string }> }
) {
  try {
    const params = await props.params;
    const invite = await InvitationService.getInvitationByToken(params.token);

    if (!invite) {
      return NextResponse.json({ error: "Invalid invitation link" }, { status: 404 });
    }

    return NextResponse.json({ invitation: invite });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ token: string }> }
) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required to accept invitation" },
        { status: 401 }
      );
    }

    const params = await props.params;
    const result = await InvitationService.acceptInvitation({
      token: params.token,
      userId: session.userId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

