import { NextResponse } from "next/server";
import { db } from "@/db/connections/control-plane";
import { users, emailVerificationTokens } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";
import crypto from "crypto";
import { EmailService } from "@/lib/email";
import { validateEmail } from "@/lib/auth/email-validator";
import { handleApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_SECONDS = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email : "";

    const validation = validateEmail(rawEmail);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error:
            validation.code === "DISPOSABLE_EMAIL"
              ? "Temporary or disposable email addresses are not allowed. Please use a permanent email address."
              : "A valid email address is required.",
          code: validation.code,
        },
        { status: 400 }
      );
    }

    const email = validation.normalizedEmail;

    // 1. Check rate limit based on most recent token for this email
    const [latestToken] = await db
      .select({ createdAt: emailVerificationTokens.createdAt })
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.email, email))
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1);

    if (latestToken) {
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(latestToken.createdAt).getTime()) / 1000
      );
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        const retryAfter = RESEND_COOLDOWN_SECONDS - elapsedSeconds;
        return NextResponse.json(
          {
            error: `Please wait ${retryAfter} seconds before requesting another verification email.`,
            retryAfter,
            code: "RATE_LIMITED",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(retryAfter),
            },
          }
        );
      }
    }

    // 2. Look up user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // If user does not exist or is already verified, return generic success to avoid enumeration
    if (!user || user.isEmailVerified) {
      return NextResponse.json({
        success: true,
        message:
          "If an unverified account exists with this email, a verification link has been sent.",
      });
    }

    // 3. Invalidate prior unconsumed tokens
    await db
      .update(emailVerificationTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(emailVerificationTokens.userId, user.id),
          isNull(emailVerificationTokens.consumedAt)
        )
      );

    // 4. Generate new verification token (32 bytes = 256 bits, cryptographically secure)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash,
      email: user.email,
      expiresAt,
    });

    // 5. Send verification email
    try {
      await EmailService.sendVerificationEmail(user.email, {
        recipientName: user.fullName,
        verificationToken: rawToken,
        expiresInMinutes: 30,
      });
    } catch (emailErr) {
      console.error("[ResendVerification] Failed to dispatch verification email:", emailErr);
    }

    return NextResponse.json({
      success: true,
      message: "A new verification link has been sent to your email address.",
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
