import { NextResponse } from "next/server";
import { validateSessionState, clearSessionCookieOnResponse } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await validateSessionState();

  if (!result.valid) {
    const response = NextResponse.json(
      {
        authenticated: false,
        sessionValid: false,
        reason: result.code || "UNAUTHENTICATED",
      },
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

  return NextResponse.json(
    {
      authenticated: true,
      sessionValid: true,
      reason: null,
    },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    }
  );
}
