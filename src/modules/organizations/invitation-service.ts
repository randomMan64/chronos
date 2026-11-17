import { db } from "@/db/connections/control-plane";
import {
  invitations,
  organizationMembers,
  organizations,
  users,
  workspaces,
  workspaceMembers,
  userSessions,
  auditLogs,
  emailVerificationTokens,
} from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { OrganizationRole } from "@/lib/permissions/types";
import { AuditService } from "@/modules/audit/audit-service";
import { EmailService } from "@/lib/email";
import { isDisposableEmail } from "@/lib/auth/email-validator";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export type InvitationState =
  | "valid"
  | "expired"
  | "revoked"
  | "already_accepted"
  | "invalid"
  | "org_not_found"
  | "already_member";

export interface InvitationDetailsResult {
  state: InvitationState;
  message?: string;
  invitation?: {
    id: string;
    organizationId: string;
    organizationName: string;
    inviterName: string;
    email: string;
    role: string;
    expiresAt: Date;
    status: string;
  };
  userExists: boolean;
  isAlreadyMember: boolean;
  emailMismatch: boolean;
  currentUser?: {
    userId: string;
    email: string;
    fullName?: string;
  } | null;
}

export class InvitationService {
  /**
   * Create a new invitation for an organization member.
   * Generates a cryptographically secure token and stores only its SHA-256 hash.
   */
  public static async createInvitation(params: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    invitedBy: string;
  }) {
    const normalizedEmail = params.email.toLowerCase().trim();

    // 1. Prevent duplicate active invitations
    const existing = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, params.organizationId),
          eq(invitations.email, normalizedEmail),
          eq(invitations.status, "pending")
        )
      )
      .limit(1);

    if (existing.length > 0 && new Date(existing[0].expiresAt) > new Date()) {
      throw new Error("An active pending invitation already exists for this email address.");
    }

    // 2. Generate raw token and store its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invite] = await db
      .insert(invitations)
      .values({
        organizationId: params.organizationId,
        email: normalizedEmail,
        role: params.role,
        token: tokenHash, // Store only token hash
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
      metadata: { email: normalizedEmail, role: params.role },
    });

    // 3. Fetch context details for the email dispatch
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

    // 4. Dispatch transactional invitation email with raw token (awaited for delivery)
    const emailResult = await EmailService.sendOrganizationInvitation(normalizedEmail, {
      organizationName: org?.name || "CHRONOS Organization",
      inviterName: inviter?.fullName || "Your Team",
      role: params.role,
      invitationToken: rawToken, // Never pass the hash in the email
      expiresInDays: 7,
    });

    if (!emailResult.success) {
      console.warn("[InvitationService] Warning: Failed to deliver invitation email:", emailResult.error);
    }

    return {
      ...invite,
      token: rawToken,
    };
  }

  /**
   * Retrieve all invitations for an organization.
   */
  public static async getInvitations(organizationId: string) {
    return await db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId));
  }

  /**
   * Retrieve an invitation by raw token or hash, joining organization and inviter.
   */
  public static async getInvitationByToken(token: string) {
    if (!token || !token.trim()) return null;
    const tokenHash = hashInvitationToken(token);
    const cleanToken = token.trim();

    const [invite] = await db
      .select({
        id: invitations.id,
        organizationId: invitations.organizationId,
        organizationName: organizations.name,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        createdAt: invitations.createdAt,
        inviterName: users.fullName,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .leftJoin(users, eq(users.id, invitations.invitedBy))
      .where(
        or(
          eq(invitations.token, tokenHash),
          eq(invitations.token, cleanToken)
        )
      )
      .limit(1);

    return invite || null;
  }

  /**
   * Evaluate full invitation state and context for acceptance UI.
   */
  public static async getInvitationDetails(
    token: string,
    currentUserId?: string
  ): Promise<InvitationDetailsResult> {
    if (!token || !token.trim()) {
      return {
        state: "invalid",
        message: "Invalid or missing invitation token.",
        userExists: false,
        isAlreadyMember: false,
        emailMismatch: false,
      };
    }

    const invite = await this.getInvitationByToken(token);
    if (!invite) {
      return {
        state: "invalid",
        message: "This invitation link is invalid or does not exist.",
        userExists: false,
        isAlreadyMember: false,
        emailMismatch: false,
      };
    }

    // Verify organization still exists
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, invite.organizationId))
      .limit(1);

    if (!org) {
      return {
        state: "org_not_found",
        message: "The organization associated with this invitation no longer exists.",
        userExists: false,
        isAlreadyMember: false,
        emailMismatch: false,
      };
    }

    // Check if account already exists with invited email
    const [userWithEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invite.email.toLowerCase()))
      .limit(1);
    const userExists = Boolean(userWithEmail);

    // Check status
    if (invite.status === "revoked") {
      return {
        state: "revoked",
        message: "This invitation has been revoked by the organization administrator.",
        invitation: {
          id: invite.id,
          organizationId: invite.organizationId,
          organizationName: invite.organizationName,
          inviterName: invite.inviterName || "Administrator",
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          status: invite.status,
        },
        userExists,
        isAlreadyMember: false,
        emailMismatch: false,
      };
    }

    if (invite.status === "accepted") {
      return {
        state: "already_accepted",
        message: "This invitation has already been accepted.",
        invitation: {
          id: invite.id,
          organizationId: invite.organizationId,
          organizationName: invite.organizationName,
          inviterName: invite.inviterName || "Administrator",
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          status: invite.status,
        },
        userExists,
        isAlreadyMember: false,
        emailMismatch: false,
      };
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return {
        state: "expired",
        message: `This invitation expired on ${new Date(invite.expiresAt).toLocaleDateString()}. Please contact the administrator for a new invitation.`,
        invitation: {
          id: invite.id,
          organizationId: invite.organizationId,
          organizationName: invite.organizationName,
          inviterName: invite.inviterName || "Administrator",
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          status: "expired",
        },
        userExists,
        isAlreadyMember: false,
        emailMismatch: false,
      };
    }

    // Authenticated user checks
    let isAlreadyMember = false;
    let emailMismatch = false;
    let currentUser: InvitationDetailsResult["currentUser"] = null;

    if (currentUserId) {
      const [authUser] = await db
        .select({ id: users.id, email: users.email, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);

      if (authUser) {
        currentUser = {
          userId: authUser.id,
          email: authUser.email,
          fullName: authUser.fullName,
        };

        if (authUser.email.toLowerCase() !== invite.email.toLowerCase()) {
          emailMismatch = true;
        } else {
          // Check if already an org member
          const [membership] = await db
            .select({ id: organizationMembers.id })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, invite.organizationId),
                eq(organizationMembers.userId, authUser.id)
              )
            )
            .limit(1);

          if (membership) {
            isAlreadyMember = true;
          }
        }
      }
    }

    return {
      state: isAlreadyMember ? "already_member" : "valid",
      message: isAlreadyMember
        ? "You are already a member of this organization."
        : undefined,
      invitation: {
        id: invite.id,
        organizationId: invite.organizationId,
        organizationName: invite.organizationName,
        inviterName: invite.inviterName || "Administrator",
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        status: invite.status,
      },
      userExists,
      isAlreadyMember,
      emailMismatch,
      currentUser,
    };
  }

  /**
   * Scenario B: Existing authenticated user accepts invitation.
   * Atomic database transaction.
   */
  public static async acceptInvitation(params: {
    token: string;
    userId: string;
  }) {
    if (!params.token || !params.token.trim()) {
      throw new Error("Invitation token is required.");
    }

    const tokenHash = hashInvitationToken(params.token);
    const cleanToken = params.token.trim();

    return await db.transaction(async (tx) => {
      // 1. Lock and safely validate the invitation record
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(
          or(
            eq(invitations.token, tokenHash),
            eq(invitations.token, cleanToken)
          )
        )
        .for("update")
        .limit(1);

      if (!invite) {
        throw new Error("Invitation not found or invalid.");
      }

      // 2. Verify status
      if (invite.status !== "pending") {
        throw new Error(`Invitation is no longer pending (status: ${invite.status}).`);
      }

      // 3. Verify expiration
      if (new Date(invite.expiresAt) < new Date()) {
        await tx
          .update(invitations)
          .set({ status: "expired" })
          .where(eq(invitations.id, invite.id));
        throw new Error("This invitation has expired.");
      }

      // 4. Verify organization exists
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, invite.organizationId))
        .limit(1);

      if (!org) {
        throw new Error("The organization associated with this invitation no longer exists.");
      }

      // 5. Verify user and email match
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, params.userId))
        .limit(1);

      if (!user) {
        throw new Error("Authenticated user account not found.");
      }

      if (user.isEmailVerified === false) {
        throw new Error("Please verify your email address before accepting invitations.");
      }

      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new Error(
          `This invitation was sent to ${invite.email}. Please sign in using the invited email address.`
        );
      }

      // 6. Check existing membership
      const [existingMember] = await tx
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, invite.organizationId),
            eq(organizationMembers.userId, user.id)
          )
        )
        .limit(1);

      if (!existingMember) {
        // 7. Create organization membership with assigned role
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
          const [existingWsMem] = await tx
            .select()
            .from(workspaceMembers)
            .where(
              and(
                eq(workspaceMembers.workspaceId, primaryWs.id),
                eq(workspaceMembers.userId, user.id)
              )
            )
            .limit(1);

          if (!existingWsMem) {
            await tx.insert(workspaceMembers).values({
              workspaceId: primaryWs.id,
              userId: user.id,
              role: invite.role === "admin" || invite.role === "owner" ? "dba" : "developer",
            });
          }
        }
      }

      // 8. Mark invitation accepted
      const acceptedAt = new Date();
      await tx
        .update(invitations)
        .set({
          status: "accepted",
          acceptedAt,
        })
        .where(eq(invitations.id, invite.id));

      // 9. Insert audit event
      await tx.insert(auditLogs).values({
        organizationId: invite.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "members:accept_invite",
        resourceType: "invitation",
        resourceId: invite.id,
        outcome: "success",
        metadata: {
          role: invite.role,
          organizationName: org.name,
          acceptedAt: acceptedAt.toISOString(),
        },
      });

      return {
        success: true,
        organizationId: invite.organizationId,
        organizationName: org.name,
        organizationSlug: org.slug,
      };
    });
  }

  /**
   * Scenario A: New CHRONOS user creates account and accepts invitation atomically.
   * IMPORTANT: Does NOT create an organization or default workspace for the user.
   */
  public static async acceptInvitationWithRegistration(params: {
    token: string;
    fullName: string;
    password: string;
  }) {
    if (!params.token || !params.token.trim()) {
      throw new Error("Invitation token is required.");
    }
    if (!params.fullName || !params.fullName.trim()) {
      throw new Error("Full Name is required.");
    }
    if (!params.password || params.password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const tokenHash = hashInvitationToken(params.token);
    const cleanToken = params.token.trim();

    return await db.transaction(async (tx) => {
      // 1. Lock and safely validate the invitation record
      const [invite] = await tx
        .select()
        .from(invitations)
        .where(
          or(
            eq(invitations.token, tokenHash),
            eq(invitations.token, cleanToken)
          )
        )
        .for("update")
        .limit(1);

      if (!invite) {
        throw new Error("Invitation not found or invalid.");
      }

      if (invite.status !== "pending") {
        throw new Error(`Invitation is no longer pending (status: ${invite.status}).`);
      }

      if (new Date(invite.expiresAt) < new Date()) {
        await tx
          .update(invitations)
          .set({ status: "expired" })
          .where(eq(invitations.id, invite.id));
        throw new Error("This invitation has expired.");
      }

      // Verify organization still exists
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, invite.organizationId))
        .limit(1);

      if (!org) {
        throw new Error("The organization associated with this invitation no longer exists.");
      }

      // 2. Ensure account with invited email does NOT already exist
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, invite.email.toLowerCase()))
        .limit(1);

      if (existingUser) {
        throw new Error(
          "An account with this email address already exists. Please sign in to accept this invitation."
        );
      }

      if (isDisposableEmail(invite.email)) {
        throw new Error("Temporary and disposable email addresses are not permitted.");
      }

      // 3. Hash password and create pending unverified user with pending invitation
      const passwordHash = await bcrypt.hash(params.password, 12);
      const [newUser] = await tx
        .insert(users)
        .values({
          email: invite.email.toLowerCase(),
          fullName: params.fullName.trim(),
          passwordHash,
          isActive: true,
          isEmailVerified: false,
          pendingInvitationId: invite.id,
        })
        .returning();

      // 4. Generate verification token (30 minutes expiry)
      const rawToken = crypto.randomBytes(32).toString("hex");
      const verificationTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await tx.insert(emailVerificationTokens).values({
        userId: newUser.id,
        tokenHash: verificationTokenHash,
        email: newUser.email,
        expiresAt,
      });

      // 5. Send verification email
      try {
        await EmailService.sendVerificationEmail(newUser.email, {
          recipientName: newUser.fullName,
          verificationToken: rawToken,
          expiresInMinutes: 30,
        });
      } catch (err) {
        console.error("[InvitationService] Failed to send verification email:", err);
      }

      return {
        success: true,
        requiresVerification: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
        },
        organizationId: invite.organizationId,
        organizationName: org.name,
        organizationSlug: org.slug,
      };
    });
  }

  /**
   * Revoke an active invitation.
   */
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
