import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { users, auditLogs, organizationMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const dynamic = "force-dynamic";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;

    // Fetch user password hash
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, sessionUser.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Security Verification: Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "Current password is incorrect. Verification failed." },
        { status: 400 }
      );
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Get user's primary org for audit trail
    const [primaryOrg] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);

    if (primaryOrg) {
      await db.insert(auditLogs).values({
        organizationId: primaryOrg.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "user:password_change",
        resourceType: "user",
        resourceId: user.id,
        outcome: "success",
        metadata: {
          timestamp: new Date().toISOString(),
          type: "password_rotation",
        },
      });
    }

    return NextResponse.json({
      message: "Password changed successfully. Your account is secured.",
    });
  } catch (err) {
    console.error("Failed to change password:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
