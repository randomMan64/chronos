import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    let deletedCount = 0;
    if (sessionUser.sessionId) {
      const result = await db
        .delete(userSessions)
        .where(
          and(
            eq(userSessions.userId, sessionUser.userId),
            ne(userSessions.id, sessionUser.sessionId)
          )
        );
      deletedCount = (result as any)?.rowCount ?? 1;
    }

    return NextResponse.json({
      message: "All other sessions have been revoked. Other devices must re-authenticate.",
      revokedCount: deletedCount,
    });
  } catch (err) {
    console.error("Failed to revoke sessions:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
