import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookie, clearSessionCookieOnResponse } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions, auditLogs, organizationMembers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getCurrentUser();
  if (session?.sessionId) {
    try {
      await db
        .update(userSessions)
        .set({
          revokedAt: new Date(),
          revokeReason: "user_logout",
        })
        .where(eq(userSessions.id, session.sessionId));

      // Get user's org for audit log
      const [membership] = await db
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, session.userId))
        .limit(1);

      if (membership) {
        const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
        await db.insert(auditLogs).values({
          organizationId: membership.organizationId,
          actorId: session.userId,
          actorEmail: session.email,
          action: "user:logout",
          resourceType: "session",
          resourceId: session.sessionId,
          outcome: "success",
          ipAddress: ipAddress ? ipAddress.slice(0, 45) : undefined,
          metadata: {
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch {
      // ignore
    }
  }

  await clearSessionCookie();

  const response = NextResponse.json(
    { success: true, message: "Logged out successfully" },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        "Clear-Site-Data": '"cookies", "storage"',
      },
    }
  );

  clearSessionCookieOnResponse(response);
  return response;
}
