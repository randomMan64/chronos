import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions, auditLogs } from "@/db/schema";
import { eq, desc, and, lt, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    // 1. Fetch active sessions for this user
    const rawSessions = await db
      .select({
        id: userSessions.id,
        ipAddress: userSessions.ipAddress,
        userAgent: userSessions.userAgent,
        createdAt: userSessions.createdAt,
        expiresAt: userSessions.expiresAt,
      })
      .from(userSessions)
      .where(eq(userSessions.userId, sessionUser.userId))
      .orderBy(desc(userSessions.createdAt));

    const sessions = rawSessions.map((s) => ({
      ...s,
      isCurrent: s.id === sessionUser.sessionId,
    }));

    // If no explicit sessions stored in user_sessions (e.g. initial demo user), provide current session fallback
    if (sessions.length === 0) {
      sessions.push({
        id: sessionUser.sessionId || "current-active-session",
        ipAddress: "127.0.0.1",
        userAgent: "Current Browser / Workstation",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 86400000),
        isCurrent: true,
      });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Automatically prune login history older than 30 days from database
    try {
      await db
        .delete(auditLogs)
        .where(
          and(
            eq(auditLogs.action, "user:login"),
            lt(auditLogs.createdAt, thirtyDaysAgo)
          )
        );
    } catch (cleanupErr) {
      console.warn("Failed to prune expired login history:", cleanupErr);
    }

    // 2. Fetch login history for this user within the past 30 days
    const loginHistory = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        outcome: auditLogs.outcome,
        ipAddress: auditLogs.ipAddress,
        timestamp: auditLogs.createdAt,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorId, sessionUser.userId),
          eq(auditLogs.action, "user:login"),
          gte(auditLogs.createdAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(auditLogs.createdAt));

    return NextResponse.json({
      sessions,
      loginHistory,
    });
  } catch (err) {
    console.error("Failed to load sessions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
