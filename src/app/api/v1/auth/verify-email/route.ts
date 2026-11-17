import { NextResponse } from "next/server";
import { db } from "@/db/connections/control-plane";
import {
  users,
  emailVerificationTokens,
  organizations,
  organizationMembers,
  workspaces,
  workspaceMembers,
  invitations,
  auditLogs,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import crypto from "crypto";
import { AuditService } from "@/modules/audit/audit-service";
import { handleApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawToken = typeof body.token === "string" ? body.token.trim() : "";

    if (!rawToken) {
      return NextResponse.json(
        { error: "Verification token is required", code: "INVALID_TOKEN" },
        { status: 400 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // 1. Find token record
    const [tokenRecord] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRecord) {
      return NextResponse.json(
        {
          error: "Invalid or nonexistent verification token. Please request a new one.",
          code: "INVALID_TOKEN",
        },
        { status: 400 }
      );
    }

    // 2. Check if already consumed
    if (tokenRecord.consumedAt !== null) {
      // Check if user is already verified
      const [u] = await db
        .select({ isEmailVerified: users.isEmailVerified })
        .from(users)
        .where(eq(users.id, tokenRecord.userId))
        .limit(1);

      if (u?.isEmailVerified) {
        return NextResponse.json({
          success: true,
          message: "Email is already verified. You can sign in.",
          alreadyVerified: true,
          email: tokenRecord.email,
        });
      }

      return NextResponse.json(
        {
          error: "This verification link has already been used. Please request a fresh one.",
          code: "TOKEN_ALREADY_USED",
          email: tokenRecord.email,
        },
        { status: 400 }
      );
    }

    // 3. Check expiration (30 minutes)
    if (new Date(tokenRecord.expiresAt) < new Date()) {
      return NextResponse.json(
        {
          error: "Verification link has expired. Please request a fresh one.",
          code: "TOKEN_EXPIRED",
          email: tokenRecord.email,
        },
        { status: 400 }
      );
    }

    // 4. Atomic transaction to verify user and initialize pending assets
    const result = await db.transaction(async (tx) => {
      // Mark token consumed
      const now = new Date();
      await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: now })
        .where(eq(emailVerificationTokens.id, tokenRecord.id));

      // Fetch user with lock
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, tokenRecord.userId))
        .for("update")
        .limit(1);

      if (!user) {
        throw new Error("User account associated with this token not found.");
      }

      // Mark user as verified
      await tx
        .update(users)
        .set({
          isEmailVerified: true,
          emailVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));

      let createdOrgId: string | null = null;
      let createdWsId: string | null = null;

      // Handle pending organization creation if this is a new owner
      if (user.pendingOrganizationName) {
        const orgName = user.pendingOrganizationName;
        const orgSlug =
          orgName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") +
          "-" +
          crypto.randomBytes(3).toString("hex");

        const [newOrg] = await tx
          .insert(organizations)
          .values({
            name: orgName,
            slug: orgSlug,
          })
          .returning();

        createdOrgId = newOrg.id;

        await tx.insert(organizationMembers).values({
          organizationId: newOrg.id,
          userId: user.id,
          role: "owner",
        });

        const [newWs] = await tx
          .insert(workspaces)
          .values({
            organizationId: newOrg.id,
            name: "Primary Workspace",
            slug: "primary",
            environment: "development",
          })
          .returning();

        createdWsId = newWs.id;

        await tx.insert(workspaceMembers).values({
          workspaceId: newWs.id,
          userId: user.id,
          role: "dba",
        });

        // Clear pending organization name
        await tx
          .update(users)
          .set({ pendingOrganizationName: null })
          .where(eq(users.id, user.id));
      }

      // Handle pending invitation if user registered via invite
      const pendingInvId = user.pendingInvitationId;
      if (pendingInvId) {
        const [invite] = await tx
          .select()
          .from(invitations)
          .where(and(eq(invitations.id, pendingInvId), eq(invitations.status, "pending")))
          .limit(1);

        if (invite && new Date(invite.expiresAt) > now) {
          // Add to organization
          await tx.insert(organizationMembers).values({
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
          });

          // Add to primary workspace if exists
          const [primaryWs] = await tx
            .select()
            .from(workspaces)
            .where(eq(workspaces.organizationId, invite.organizationId))
            .limit(1);

          if (primaryWs) {
            await tx.insert(workspaceMembers).values({
              workspaceId: primaryWs.id,
              userId: user.id,
              role: invite.role === "admin" || invite.role === "owner" ? "dba" : "developer",
            });
          }

          // Mark invitation as accepted
          await tx
            .update(invitations)
            .set({
              status: "accepted",
              acceptedAt: now,
            })
            .where(eq(invitations.id, invite.id));

          // Clear pending invitation
          await tx
            .update(users)
            .set({ pendingInvitationId: null })
            .where(eq(users.id, user.id));

          // Audit log for invitation acceptance
          await tx.insert(auditLogs).values({
            organizationId: invite.organizationId,
            actorId: user.id,
            actorEmail: user.email,
            action: "members:accept_invite_registered",
            resourceType: "invitation",
            resourceId: invite.id,
            outcome: "success",
            metadata: {
              role: invite.role,
              acceptedAt: now.toISOString(),
            },
          });
        }
      }

      // Also check any pending invitation matching user's email directly
      const pendingInvites = await tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.email, user.email.toLowerCase()),
            eq(invitations.status, "pending")
          )
        );

      for (const invite of pendingInvites) {
        if (new Date(invite.expiresAt) > now) {
          // Check if already a member
          const [existingMem] = await tx
            .select()
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, invite.organizationId),
                eq(organizationMembers.userId, user.id)
              )
            )
            .limit(1);

          if (!existingMem) {
            await tx.insert(organizationMembers).values({
              organizationId: invite.organizationId,
              userId: user.id,
              role: invite.role,
            });

            const [primaryWs] = await tx
              .select()
              .from(workspaces)
              .where(eq(workspaces.organizationId, invite.organizationId))
              .limit(1);

            if (primaryWs) {
              await tx.insert(workspaceMembers).values({
                workspaceId: primaryWs.id,
                userId: user.id,
                role: invite.role === "admin" || invite.role === "owner" ? "dba" : "developer",
              });
            }

            await tx
              .update(invitations)
              .set({
                status: "accepted",
                acceptedAt: now,
              })
              .where(eq(invitations.id, invite.id));
          }
        }
      }

      return {
        user,
        createdOrgId,
        createdWsId,
      };
    });

    // Record audit log for email verification
    if (result.createdOrgId) {
      try {
        await AuditService.log({
          organizationId: result.createdOrgId,
          workspaceId: result.createdWsId || undefined,
          actorId: result.user.id,
          actorEmail: result.user.email,
          action: "auth:email_verified",
          resourceType: "user",
          resourceId: result.user.id,
          outcome: "success",
          metadata: {
            verifiedAt: new Date().toISOString(),
          },
        });
      } catch (auditErr) {
        console.warn("[VerifyEmail] Audit logging error:", auditErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully.",
      email: tokenRecord.email,
    });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
