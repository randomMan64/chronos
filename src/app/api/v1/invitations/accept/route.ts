import { NextResponse } from "next/server";
import {
  getCurrentUser,
  createSessionToken,
  setSessionCookie,
  attachSessionCookieToResponse,
  attachDeviceCookieToResponse,
  DEVICE_COOKIE_NAME,
} from "@/lib/auth/session";
import { parseUserAgent, resolveOrCreateDevice } from "@/lib/auth/device-detector";
import { db } from "@/db/connections/control-plane";
import { userSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InvitationService } from "@/modules/organizations/invitation-service";
import { handleApiError } from "@/lib/errors";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Invitation token is required"),
  fullName: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = acceptInvitationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { token, fullName, password, confirmPassword } = parsed.data;
    const session = await getCurrentUser();

    // Scenario B: Existing authenticated user
    if (session && session.userId) {
      const result = await InvitationService.acceptInvitation({
        token,
        userId: session.userId,
      });

      return NextResponse.json({
        success: true,
        message: "Invitation accepted successfully.",
        organizationId: result.organizationId,
        organizationName: result.organizationName,
      });
    }

    // Scenario A: New user registration through invitation
    if (!fullName || !fullName.trim()) {
      return NextResponse.json(
        { error: "Full Name is required to set up your account." },
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
      token,
      fullName,
      password,
    });

    // Detect device and resolve/create device record
    const cookieHeader = req.headers.get("cookie") || "";
    const deviceCookieMatch = cookieHeader.match(new RegExp(`(?:^|; )${DEVICE_COOKIE_NAME}=([^;]*)`));
    const rawDeviceKey = deviceCookieMatch ? decodeURIComponent(deviceCookieMatch[1]) : null;

    const deviceInfo = parseUserAgent(req.headers.get("user-agent"), req.headers);
    const { device, deviceKey } = await resolveOrCreateDevice({
      userId: result.user.id,
      rawDeviceKey,
      deviceInfo,
    });

    // Associate session with device and network metadata
    await db
      .update(userSessions)
      .set({
        deviceId: device.id,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        country: deviceInfo.country,
        region: deviceInfo.region,
        city: deviceInfo.city,
        lastActiveAt: new Date(),
      })
      .where(eq(userSessions.id, result.sessionId));

    // Establish authenticated session for the newly registered user
    const sessionToken = await createSessionToken({
      userId: result.user.id,
      email: result.user.email,
      sessionId: result.sessionId,
    });

    await setSessionCookie(sessionToken);

    const response = NextResponse.json(
      {
        success: true,
        message: "Account created and invitation accepted successfully.",
        user: result.user,
        organizationId: result.organizationId,
        organizationName: result.organizationName,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );

    attachSessionCookieToResponse(response, sessionToken);
    attachDeviceCookieToResponse(response, deviceKey);

    return response;
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
