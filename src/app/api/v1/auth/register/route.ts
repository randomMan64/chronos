import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db/connections/control-plane";
import { users, emailVerificationTokens } from "@/db/schema";
import { registerSchema } from "@/lib/validation";
import { EmailService } from "@/lib/email";
import {
  normalizeEmail,
  isValidEmailSyntax,
  isDisposableEmail,
} from "@/lib/auth/email-validator";
import { handleApiError } from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { email: rawEmail, password, fullName, organizationName } = parsed.data;

    // 1. Strict RFC email syntax check
    if (!isValidEmailSyntax(rawEmail)) {
      return NextResponse.json(
        { error: "Invalid email address format.", code: "INVALID_EMAIL" },
        { status: 400 }
      );
    }

    // 2. Reject disposable / temporary email domains
    if (isDisposableEmail(rawEmail)) {
      return NextResponse.json(
        {
          error:
            "Temporary and disposable email addresses are not permitted. Please use a valid, permanent email address.",
          code: "DISPOSABLE_EMAIL",
        },
        { status: 400 }
      );
    }

    const email = normalizeEmail(rawEmail);
    const passwordHash = await bcrypt.hash(password, 12);
    const orgName = organizationName?.trim() || `${fullName.split(" ")[0]}'s Team`;

    // 3. Check if user already exists
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let targetUserId: string;

    if (existing) {
      if (existing.isEmailVerified) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }

      // Existing user is unverified: update profile, password, pending org name
      await db
        .update(users)
        .set({
          fullName,
          passwordHash,
          pendingOrganizationName: orgName,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));

      targetUserId = existing.id;

      // Invalidate prior unconsumed tokens
      await db
        .update(emailVerificationTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(emailVerificationTokens.userId, existing.id),
            isNull(emailVerificationTokens.consumedAt)
          )
        );
    } else {
      // Create new pending unverified user
      const [newUser] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          fullName,
          isEmailVerified: false,
          pendingOrganizationName: orgName,
        })
        .returning();

      targetUserId = newUser.id;
    }

    // 4. Generate 256-bit cryptographically secure verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await db.insert(emailVerificationTokens).values({
      userId: targetUserId,
      tokenHash,
      email,
      expiresAt,
    });

    // 5. Dispatch Verification Email (do not block account creation if SMTP fails)
    try {
      await EmailService.sendVerificationEmail(email, {
        recipientName: fullName,
        verificationToken: rawToken,
        expiresInMinutes: 30,
      });
    } catch (emailErr) {
      console.error("[Register] Failed to send verification email:", emailErr);
    }

    // 6. Return response WITHOUT session or device cookies
    return NextResponse.json(
      {
        success: true,
        email,
        requiresVerification: true,
        message:
          "Account created successfully. A verification link has been sent to your email address.",
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
