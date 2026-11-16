import { NextResponse } from "next/server";
import { db } from "@/db/connections/control-plane";
import { users, passwordResetTokens, userSessions, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { EmailService } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;
    const tokenHash = crypto.createHash("sha256").update(token.trim()).digest("hex");

    // 1. Look up token in database
    const [tokenRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Invalid or expired password reset link." },
        { status: 400 }
      );
    }

    // 2. Check if already consumed (single-use enforcement)
    if (tokenRecord.usedAt !== null) {
      return NextResponse.json(
        { error: "This password reset link has already been used. Please request a new one." },
        { status: 400 }
      );
    }

    // 3. Check expiration
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This password reset link has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // 4. Fetch the user
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, tokenRecord.userId), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "The associated account could not be found or is inactive." },
        { status: 400 }
      );
    }

    // 5. Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // 6. Update user password
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // 7. Mark token as consumed (single-use)
    await db
      .update(passwordResetTokens)
      .set({
        usedAt: new Date(),
      })
      .where(eq(passwordResetTokens.id, tokenRecord.id));

    // 8. Revoke all active sessions for this user (security requirement)
    await db
      .delete(userSessions)
      .where(eq(userSessions.userId, user.id));

    // 9. Log audit event
    const ipAddress = req.headers.get("x-forwarded-for") || undefined;
    try {
      await db.insert(auditLogs).values({
        organizationId: "00000000-0000-0000-0000-000000000000", // placeholder system org
        actorId: user.id,
        actorEmail: user.email,
        action: "auth:password_reset_completed",
        resourceType: "user",
        resourceId: user.id,
        outcome: "success",
        ipAddress: ipAddress ? ipAddress.slice(0, 45) : undefined,
        metadata: {
          timestamp: new Date().toISOString(),
          tokenId: tokenRecord.id,
        },
      });
    } catch {
      // Non-blocking if placeholder org is omitted
    }

    // 10. Send security notification email (password changed)
    await EmailService.sendPasswordChangedNotification(user.email, {
      recipientName: user.fullName || "User",
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      message: "Password has been successfully reset. Please log in with your new password.",
    });
  } catch (err: unknown) {
    console.error("[ResetPassword] Error completing password reset:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while resetting your password." },
      { status: 500 }
    );
  }
}
