import { NextResponse } from "next/server";
import { getCurrentUser, createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { handleApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ token: string }> }
) {
  try {
    const params = await props.params;
    const session = await getCurrentUser();
    const details = await InvitationService.getInvitationDetails(
      params.token,
      session?.userId
    );

    if (details.state === "invalid") {
      return NextResponse.json(
        { error: details.message || "Invalid invitation link", state: "invalid" },
        { status: 404 }
      );
    }

    if (details.state === "org_not_found") {
      return NextResponse.json(
        { error: details.message || "Organization not found", state: "org_not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...details,
      invitation: details.invitation,
    });
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
    const params = await props.params;
    const session = await getCurrentUser();
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable for authenticated users
    }

    // Existing authenticated user
    if (session && session.userId) {
      const result = await InvitationService.acceptInvitation({
        token: params.token,
        userId: session.userId,
      });

      return NextResponse.json({
        success: true,
        organizationId: result.organizationId,
        organizationName: result.organizationName,
      });
    }

    // New user registration
    const { fullName, password, confirmPassword } = body;
    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { error: "Full name is required." },
        { status: 400 }
      );
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 }
      );
    }

    const result = await InvitationService.acceptInvitationWithRegistration({
      token: params.token,
      fullName,
      password,
    });

    const sessionToken = await createSessionToken({
      userId: result.user.id,
      email: result.user.email,
      sessionId: result.sessionId,
    });

    await setSessionCookie(sessionToken);

    return NextResponse.json({
      success: true,
      user: result.user,
      organizationId: result.organizationId,
      organizationName: result.organizationName,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
