import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions, devices, auditLogs } from "@/db/schema";
import { eq, desc, and, lt, gte, isNull, gt, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    // 1. Fetch active, non-revoked, non-expired sessions for this user with device details
    const rawSessions = await db
      .select({
        id: userSessions.id,
        deviceId: userSessions.deviceId,
        ipAddress: userSessions.ipAddress,
        userAgent: userSessions.userAgent,
        country: userSessions.country,
        region: userSessions.region,
        city: userSessions.city,
        createdAt: userSessions.createdAt,
        lastActiveAt: userSessions.lastActiveAt,
        expiresAt: userSessions.expiresAt,
        deviceName: devices.deviceName,
        deviceType: devices.deviceType,
        manufacturer: devices.manufacturer,
        model: devices.model,
        operatingSystem: devices.operatingSystem,
        operatingSystemVersion: devices.operatingSystemVersion,
        browser: devices.browser,
        browserVersion: devices.browserVersion,
        firstSeenAt: devices.firstSeenAt,
        lastSeenAt: devices.lastSeenAt,
      })
      .from(userSessions)
      .leftJoin(devices, eq(devices.id, userSessions.deviceId))
      .where(
        and(
          eq(userSessions.userId, sessionUser.userId),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(userSessions.lastActiveAt));

    const sessions = rawSessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress || "127.0.0.1",
      userAgent: s.userAgent || "Web Browser",
      country: s.country,
      region: s.region,
      city: s.city,
      location:
        [s.city, s.country].filter(Boolean).join(", ") ||
        (s.ipAddress === "127.0.0.1" || !s.ipAddress
          ? "Local Network"
          : "Unknown Location"),
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt || s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === sessionUser.sessionId,
      device: {
        id: s.deviceId,
        name:
          s.deviceName ||
          (s.userAgent ? s.userAgent.slice(0, 40) : "Current Workstation"),
        type: s.deviceType || "desktop",
        manufacturer: s.manufacturer,
        model: s.model,
        operatingSystem: s.operatingSystem || "Unknown OS",
        operatingSystemVersion: s.operatingSystemVersion,
        browser: s.browser || "Web Browser",
        browserVersion: s.browserVersion,
        firstSeenAt: s.firstSeenAt || s.createdAt,
        lastSeenAt: s.lastSeenAt || s.lastActiveAt || s.createdAt,
      },
    }));

    // If no explicit sessions found, provide fallback for current active session
    if (sessions.length === 0) {
      sessions.push({
        id: sessionUser.sessionId || "current-active-session",
        ipAddress: "127.0.0.1",
        userAgent: "Current Browser / Workstation",
        country: null,
        region: null,
        city: null,
        location: "Local Network",
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 86400000),
        isCurrent: true,
        device: {
          id: null,
          name: "Current Workstation",
          type: "desktop",
          manufacturer: null,
          model: null,
          operatingSystem: "Windows / Desktop",
          operatingSystemVersion: null,
          browser: "Web Browser",
          browserVersion: null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Automatically prune login/session audit logs older than 30 days
    try {
      await db
        .delete(auditLogs)
        .where(
          and(
            inArray(auditLogs.action, [
              "user:login",
              "user:new_device_login",
              "user:logout",
              "user:session_revoked",
              "user:password_change",
            ]),
            lt(auditLogs.createdAt, thirtyDaysAgo),
          ),
        );
    } catch (cleanupErr) {
      console.warn("Failed to prune expired login history:", cleanupErr);
    }

    // 2. Fetch security/login history for this user within the past 30 days
    const loginHistory = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        outcome: auditLogs.outcome,
        ipAddress: auditLogs.ipAddress,
        timestamp: auditLogs.createdAt,
        createdAt: auditLogs.createdAt,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorId, sessionUser.userId),
          inArray(auditLogs.action, [
            "user:login",
            "user:new_device_login",
            "user:logout",
            "user:session_revoked",
            "user:password_change",
          ]),
          gte(auditLogs.createdAt, thirtyDaysAgo),
        ),
      )
      .orderBy(desc(auditLogs.createdAt));

    return NextResponse.json({
      sessions,
      loginHistory,
    });
  } catch (err) {
    console.error("Failed to load sessions:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
