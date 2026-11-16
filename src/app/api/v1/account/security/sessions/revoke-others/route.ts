import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions, auditLogs, organizationMembers } from "@/db/schema";
import { eq, and, ne, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated", code: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    let revokedCount = 0;
    if (sessionUser.sessionId) {
      await db.transaction(async (tx) => {
        const result = await tx
          .update(userSessions)
          .set({
            revokedAt: new Date(),
            revokeReason: "revoke_all_others",
          })
          .where(
            and(
              eq(userSessions.userId, sessionUser.userId),
              ne(userSessions.id, sessionUser.sessionId),
              isNull(userSessions.revokedAt)
            )
          );
        revokedCount = (result as any)?.rowCount ?? 1;

        // Log audit trail within transaction
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
            resourceId: sessionUser.sessionId,
            outcome: "success",
            ipAddress: ipAddress ? ipAddress.slice(0, 45) : undefined,
            metadata: {
              revocationType: "revoke_all_others",
              revokedCount,
            },
          });
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "All other sessions have been revoked. Other devices must re-authenticate.",
      revokedCount,
    });
  } catch (err) {
    console.error("Failed to revoke sessions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
