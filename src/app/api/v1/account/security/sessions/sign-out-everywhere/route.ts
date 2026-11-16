import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookieOnResponse, clearSessionCookie } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions, auditLogs, organizationMembers } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    let revokedCount = 0;
    await db.transaction(async (tx) => {
      const result = await tx
        .update(userSessions)
        .set({
          revokedAt: new Date(),
          revokeReason: "sign_out_everywhere",
        })
        .where(
          and(
            eq(userSessions.userId, sessionUser.userId),
            isNull(userSessions.revokedAt)
          )
        );
      revokedCount = (result as any)?.rowCount ?? 1;

      // Log audit event within transaction
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
          resourceId: sessionUser.sessionId || sessionUser.userId,
          outcome: "success",
          ipAddress: ipAddress ? ipAddress.slice(0, 45) : undefined,
          metadata: {
            revocationType: "sign_out_everywhere",
            revokedCount,
          },
        });
      }
    });

    await clearSessionCookie();

    const response = NextResponse.json({
      success: true,
      message: "Successfully signed out from all devices.",
      revokedCount,
    });

    clearSessionCookieOnResponse(response);
    return response;
  } catch (err) {
    console.error("Failed to sign out from all devices:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
