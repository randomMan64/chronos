import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      {
        status: 401,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  }

  return NextResponse.json(session, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
