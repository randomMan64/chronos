import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookie } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userSessions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getCurrentUser();
  if (session?.sessionId) {
    try {
      await db.delete(userSessions).where(eq(userSessions.id, session.sessionId));
    } catch {
      // ignore
    }
  }

  await clearSessionCookie();
  return NextResponse.json({ success: true, message: "Logged out successfully" });
}

