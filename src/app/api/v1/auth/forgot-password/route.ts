import { NextResponse } from "next/server";
import { db } from "@/db/connections/control-plane";
import { users, passwordResetTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { EmailService } from "@/lib/email";
import crypto from "crypto";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// Simple in-memory rate limiter for password reset requests (sliding window)
const rateLimitMap = new Map<string, { count: number; firstRequest: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record) {
    rateLimitMap.set(identifier, { count: 1, firstRequest: now });
    return true;
  }

  if (now - record.firstRequest > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(identifier, { count: 1, firstRequest: now });
    return true;
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.count += 1;
  return true;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    // Rate limiting per IP and email to mitigate abuse
    if (!checkRateLimit(`ip:${ip}`) || !checkRateLimit(`email:${email}`)) {
      return NextResponse.json(
        { error: "Too many password reset attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Generic response message to prevent account enumeration
    const genericSuccessResponse = {
      success: true,
      message: "If an account matches that email address, a password reset link has been dispatched.",
    };

    // 1. Look up user by email
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.email, email), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      // Do not reveal that the user does not exist
      return NextResponse.json(genericSuccessResponse);
    }

    // 2. Invalidate any existing unused reset tokens for this user
    const existingTokens = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    if (existingTokens.length > 0) {
      // Soft expire or delete older unused tokens
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));
    }

    // 3. Generate cryptographically secure token & hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresInMinutes = 60;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // 4. Store token hash in database
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // 5. Dispatch reset email (awaited for reliability)
    const emailResult = await EmailService.sendPasswordResetEmail(user.email, {
      recipientName: user.fullName || "User",
      resetToken: rawToken,
      expiresInMinutes,
    });

    if (!emailResult.success) {
      console.error("[ForgotPassword] Failed to send email:", emailResult.error);
      // We still return generic response to prevent information leakage, but log failure
    }

    return NextResponse.json(genericSuccessResponse);
  } catch (err: unknown) {
    console.error("[ForgotPassword] Error handling reset request:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
