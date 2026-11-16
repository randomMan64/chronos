import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db/connections/control-plane";
import { users, userSessions, organizationMembers, organizations, workspaces } from "@/db/schema";
import { loginSchema } from "@/lib/validation";
import {
  createSessionToken,
  setSessionCookie,
  attachSessionCookieToResponse,
  attachDeviceCookieToResponse,
  DEVICE_COOKIE_NAME,
} from "@/lib/auth/session";
import { parseUserAgent, resolveOrCreateDevice } from "@/lib/auth/device-detector";
import { AuditService } from "@/modules/audit/audit-service";
import { handleApiError } from "@/lib/errors";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Find User
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase()), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Verify Password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Detect device and resolve/create device record
    const cookieHeader = req.headers.get("cookie") || "";
    const deviceCookieMatch = cookieHeader.match(new RegExp(`(?:^|; )${DEVICE_COOKIE_NAME}=([^;]*)`));
    const rawDeviceKey = deviceCookieMatch ? decodeURIComponent(deviceCookieMatch[1]) : null;

    const deviceInfo = parseUserAgent(req.headers.get("user-agent"), req.headers);
    const { device, deviceKey, isNewDevice } = await resolveOrCreateDevice({
      userId: user.id,
      rawDeviceKey,
      deviceInfo,
    });

    // Create Session
    const tokenHash = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [newSession] = await db
      .insert(userSessions)
      .values({
        userId: user.id,
        deviceId: device.id,
        tokenHash,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
        country: deviceInfo.country,
        region: deviceInfo.region,
        city: deviceInfo.city,
        lastActiveAt: new Date(),
        expiresAt,
      })
      .returning();

    const sessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      sessionId: newSession.id,
    });

    await setSessionCookie(sessionToken);

    // Get default user organization
    const orgMems = await db
      .select({
        org: organizations,
        member: organizationMembers,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);

    const defaultOrg = orgMems[0]?.org;

    let defaultWs = null;
    if (defaultOrg) {
      const wss = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.organizationId, defaultOrg.id))
        .limit(1);
      defaultWs = wss[0] || null;

      // Log new device audit event if applicable
      if (isNewDevice) {
        await AuditService.log({
          organizationId: defaultOrg.id,
          actorId: user.id,
          actorEmail: user.email,
          action: "user:new_device_login",
          resourceType: "device",
          resourceId: device.id,
          outcome: "success",
          ipAddress: deviceInfo.ipAddress || undefined,
          metadata: {
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            browser: device.browser,
            os: device.operatingSystem,
            location: [deviceInfo.city, deviceInfo.country].filter(Boolean).join(", "),
          },
        });
      }

      // Log login audit
      await AuditService.log({
        organizationId: defaultOrg.id,
        actorId: user.id,
        actorEmail: user.email,
        action: "user:login",
        resourceType: "session",
        resourceId: newSession.id,
        outcome: "success",
        ipAddress: deviceInfo.ipAddress || undefined,
        metadata: {
          deviceId: device.id,
          deviceName: device.deviceName,
        },
      });
    }

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
        },
        organization: defaultOrg
          ? {
              id: defaultOrg.id,
              name: defaultOrg.name,
              slug: defaultOrg.slug,
              role: orgMems[0]?.member.role,
            }
          : null,
        workspace: defaultWs
          ? {
              id: defaultWs.id,
              name: defaultWs.name,
              slug: defaultWs.slug,
              environment: defaultWs.environment,
            }
          : null,
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

