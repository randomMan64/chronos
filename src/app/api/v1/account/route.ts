import { NextResponse } from "next/server";
import { getCurrentUser, clearSessionCookieOnResponse } from "@/lib/auth/session";
import { AccountDeletionService } from "@/modules/account/account-deletion-service";
import { deleteAccountSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const preview = await AccountDeletionService.getAccountDeletionPreview(sessionUser.userId);
    return NextResponse.json(preview);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function DELETE(req: Request) {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = deleteAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await AccountDeletionService.deleteAccount({
      userId: sessionUser.userId,
      password: parsed.data.password,
      confirmationPhrase: parsed.data.confirmationPhrase,
    });

    const response = NextResponse.json({
      success: true,
      message: result.message,
      nextUrl: "/login",
    });

    return clearSessionCookieOnResponse(response);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
