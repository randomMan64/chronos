import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookieOnResponse } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions, auditLogs, organizationMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id: targetSessionId } = await props.params;

  if (!targetSessionId) {
    return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
  }

  try {
    // 1. Verify session exists and belongs to the authenticated user
    const [targetSession] = await db
      .select()
      .from(userSessions)
      .where(and(eq(userSessions.id, targetSessionId), eq(userSessions.userId, sessionUser.userId)))
      .limit(1);

    if (!targetSession) {
      return NextResponse.json(
        { error: "Session not found or does not belong to you." },
        { status: 404 }
      );
    }

    // 2. Mark session as revoked and record audit log inside a transaction
    await db.transaction(async (tx) => {
      await tx
        .update(userSessions)
        .set({
          revokedAt: new Date(),
          revokeReason: "manual_revocation",
        })
        .where(eq(userSessions.id, targetSessionId));

      const [membership] = await tx
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, sessionUser.userId))
        .limit(1);

      if (membership) {
        const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
        await tx.insert(auditLogs).values({
          organizationId: membership.organizationId,
          actorId: sessionUser.userId,
          actorEmail: sessionUser.email,
          action: "user:session_revoked",
          resourceType: "session",
          resourceId: targetSessionId,
          outcome: "success",
          ipAddress: ipAddress ? ipAddress.slice(0, 45) : undefined,
          metadata: {
            revocationType: "individual",
            targetSessionId,
            isCurrentSession: targetSessionId === sessionUser.sessionId,
          },
        });
      }
    });

    const isCurrentSession = targetSessionId === sessionUser.sessionId;

    const response = NextResponse.json({
      success: true,
      message: isCurrentSession
        ? "Current session terminated."
        : "Session revoked successfully. The device has been signed out.",
      isCurrentSession,
    });

    if (isCurrentSession) {
      clearSessionCookieOnResponse(response);
    }

    return response;
  } catch (err) {
    console.error("Failed to revoke session:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
