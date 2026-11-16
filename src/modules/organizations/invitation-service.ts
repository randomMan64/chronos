import { db } from "@/db/connections/control-plane";
import { invitations, organizationMembers, organizations, users, workspaces, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { OrganizationRole } from "@/lib/permissions/types";
import { AuditService } from "@/modules/audit/audit-service";
import { EmailService } from "@/lib/email";
import crypto from "crypto";

export class InvitationService {
  public static async createInvitation(params: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    invitedBy: string;
  }) {
    // 1. Prevent duplicate active invitations
    const existing = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, params.organizationId),
          eq(invitations.email, params.email.toLowerCase()),
          eq(invitations.status, "pending")
        )
      )
      .limit(1);

    if (existing.length > 0 && new Date(existing[0].expiresAt) > new Date()) {
      throw new Error("An active pending invitation already exists for this email address.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db
      .insert(invitations)
      .values({
        organizationId: params.organizationId,
        email: params.email.toLowerCase(),
        role: params.role,
        token,
        status: "pending",
        invitedBy: params.invitedBy,
        expiresAt,
      })
      .returning();

    await AuditService.log({
      organizationId: params.organizationId,
      actorId: params.invitedBy,
      action: "members:invite",
      resourceType: "invitation",
      resourceId: invite.id,
      metadata: { email: params.email, role: params.role },
    });

    // 2. Fetch context details for the email dispatch
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, params.organizationId))
      .limit(1);

    const [inviter] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, params.invitedBy))
      .limit(1);

    // 3. Dispatch transactional invitation email (awaited for delivery)
    const emailResult = await EmailService.sendOrganizationInvitation(params.email.toLowerCase(), {
      organizationName: org?.name || "CHRONOS Organization",
      inviterName: inviter?.fullName || "Your Team",
      role: params.role,
      invitationToken: token,
      expiresInDays: 7,
    });

    if (!emailResult.success) {
      console.warn("[InvitationService] Warning: Failed to deliver invitation email:", emailResult.error);
    }

    return invite;
  }

  public static async getInvitations(organizationId: string) {
    return await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        token: invitations.token,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId));
  }

  public static async getInvitationByToken(token: string) {
    const [invite] = await db
      .select({
        id: invitations.id,
        organizationId: invitations.organizationId,
        organizationName: organizations.name,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(eq(invitations.token, token))
      .limit(1);

    return invite || null;
  }

  public static async acceptInvitation(params: {
    token: string;
    userId: string;
  }) {
    const invite = await this.getInvitationByToken(params.token);
    if (!invite) {
      throw new Error("Invitation not found");
    }

    if (invite.status !== "pending") {
      throw new Error(`Invitation is already ${invite.status}`);
    }

    if (new Date(invite.expiresAt) < new Date()) {
      await db
        .update(invitations)
        .set({ status: "expired" })
        .where(eq(invitations.id, invite.id));
      throw new Error("Invitation has expired");
    }

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, invite.organizationId),
          eq(organizationMembers.userId, params.userId)
        )
      )
      .limit(1);

    if (existingMember.length === 0) {
      // Add member to organization
      await db.insert(organizationMembers).values({
        organizationId: invite.organizationId,
        userId: params.userId,
        role: invite.role,
      });

      // Add member to primary workspace as developer
      const [primaryWs] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.organizationId, invite.organizationId))
        .limit(1);

      if (primaryWs) {
        await db.insert(workspaceMembers).values({
          workspaceId: primaryWs.id,
          userId: params.userId,
          role: invite.role === "admin" ? "dba" : "developer",
        });
      }
    }

    // Mark invitation accepted
    await db
      .update(invitations)
      .set({ status: "accepted" })
      .where(eq(invitations.id, invite.id));

    await AuditService.log({
      organizationId: invite.organizationId,
      actorId: params.userId,
      action: "members:accept_invite",
      resourceType: "invitation",
      resourceId: invite.id,
      metadata: { role: invite.role },
    });

    return { success: true, organizationId: invite.organizationId };
  }

  public static async revokeInvitation(params: {
    organizationId: string;
    invitationId: string;
    actorId: string;
  }) {
    const [revoked] = await db
      .update(invitations)
      .set({ status: "revoked" })
      .where(
        and(
          eq(invitations.organizationId, params.organizationId),
          eq(invitations.id, params.invitationId)
        )
      )
      .returning();

    if (revoked) {
      await AuditService.log({
        organizationId: params.organizationId,
        actorId: params.actorId,
        action: "members:revoke_invite",
        resourceType: "invitation",
        resourceId: params.invitationId,
      });
    }

    return revoked || null;
  }
}

