import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db/connections/control-plane";
import { users, organizations, organizationMembers, workspaces, workspaceMembers, userSessions } from "@/db/schema";
import { registerSchema } from "@/lib/validation";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { AuditService } from "@/modules/audit/audit-service";
import { handleApiError } from "@/lib/errors";
import { EmailService } from "@/lib/email";
import { eq } from "drizzle-orm";
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

    const { email, password, fullName, organizationName } = parsed.data;

    // Check if user already exists
    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const orgName = organizationName || `${fullName.split(" ")[0]}'s Team`;
    const orgSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") + "-" + crypto.randomBytes(3).toString("hex");

    // 1. Create User
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        fullName,
      })
      .returning();

    // 2. Create Default Organization
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: orgName,
        slug: orgSlug,
      })
      .returning();

    // 3. Assign User as Organization Owner
    await db.insert(organizationMembers).values({
      organizationId: newOrg.id,
      userId: newUser.id,
      role: "owner",
    });

    // 4. Create First Workspace (Default: development)
    const [newWs] = await db
      .insert(workspaces)
      .values({
        organizationId: newOrg.id,
        name: "Primary Workspace",
        slug: "primary",
        environment: "development",
      })
      .returning();

    // 5. Assign User as Workspace DBA/Admin
    await db.insert(workspaceMembers).values({
      workspaceId: newWs.id,
      userId: newUser.id,
      role: "dba",
    });

    // 6. Create Session
    const tokenHash = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [newSession] = await db
      .insert(userSessions)
      .values({
        userId: newUser.id,
        tokenHash,
        expiresAt,
      })
      .returning();

    const sessionToken = await createSessionToken({
      userId: newUser.id,
      email: newUser.email,
      sessionId: newSession.id,
    });

    await setSessionCookie(sessionToken);

    // Audit Log
    await AuditService.log({
      organizationId: newOrg.id,
      workspaceId: newWs.id,
      actorId: newUser.id,
      actorEmail: newUser.email,
      action: "user:register",
      resourceType: "user",
      resourceId: newUser.id,
      outcome: "success",
      metadata: { organizationName: newOrg.name, workspaceName: newWs.name },
    });

    // 8. Dispatch Welcome Email (awaited for reliability)
    try {
      await EmailService.sendWelcomeEmail(newUser.email, {
        recipientName: newUser.fullName,
      });
    } catch (emailErr) {
      console.error("[Register] Failed to send welcome email:", emailErr);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
      },
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        slug: newOrg.slug,
        role: "owner",
      },
      workspace: {
        id: newWs.id,
        name: newWs.name,
        slug: newWs.slug,
        environment: newWs.environment,
      },
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

