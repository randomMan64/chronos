import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookie, clearSessionCookieOnResponse } from "@/lib/auth/session";
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
