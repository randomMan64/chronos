import { NextResponse } from "next/server";
import { getAuthenticatedSession, clearSessionCookieOnResponse } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || !session.user) {
    const response = NextResponse.json(
      { error: "Session has expired or been revoked.", code: "SESSION_REVOKED" },
      {
        status: 401,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
    clearSessionCookieOnResponse(response);
    return response;
  }

  return NextResponse.json(session, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
