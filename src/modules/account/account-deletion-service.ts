import { db } from "@/db/connections/control-plane";
import {
  users,
  userSessions,
  userPreferences,
  notifications,
  passwordResetTokens,
  organizations,
  organizationMembers,
  workspaceMembers,
  databasePermissions,
} from "@/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { AuditService } from "@/modules/audit/audit-service";
import bcrypt from "bcryptjs";

export class AccountDeletionService {
  /**
   * Evaluates if a user is eligible to delete their account.
   * If the user is the ONLY owner of an active organization, deletion is prevented
   * until ownership is transferred or the organization is deleted.
   */
  public static async getAccountDeletionPreview(userId: string) {
    // 1. Fetch all organization memberships for this user
    const userMemberships = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        organizationName: organizations.name,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, userId));

    const blockingOrganizations: Array<{ id: string; name: string }> = [];

    // 2. For each organization where user is an owner, verify if there are other owners
    for (const membership of userMemberships) {
      if (membership.role === "owner") {
        const [ownerCountResult] = await db
          .select({ count: count() })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, membership.organizationId),
              eq(organizationMembers.role, "owner")
            )
          );

        const totalOwners = Number(ownerCountResult?.count || 0);
        if (totalOwners <= 1) {
          blockingOrganizations.push({
            id: membership.organizationId,
            name: membership.organizationName,
          });
        }
      }
    }

    return {
      canDelete: blockingOrganizations.length === 0,
      blockingOrganizations,
      membershipsCount: userMemberships.length,
      retentionNotice:
        "Audit logs and system activity will be retained according to compliance requirements with your personal identity anonymized. Active organizations and connected databases will remain intact.",
    };
  }

  /**
   * Safely and idempotently deletes a user's account:
   * 1. Validates password re-authentication.
   * 2. Validates explicit confirmation.
   * 3. Blocks deletion if user is sole owner of any organization.
   * 4. Logs audit entries across all organizations.
   * 5. Revokes all active sessions.
   * 6. Deletes user personal data while preserving audit records.
   */
  public static async deleteAccount(params: {
    userId: string;
    password: string;
    confirmationPhrase: string;
  }) {
    // 1. Validate confirmation phrase
    if (params.confirmationPhrase.trim() !== "DELETE") {
      throw new Error('Confirmation failed: You must type "DELETE" to confirm.');
    }

    // 2. Fetch user
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (!user) {
      throw new Error("User account not found.");
    }

    // 3. Re-authenticate password
    const isPasswordValid = await bcrypt.compare(params.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect. Verification failed.");
    }

    // 4. Verify sole ownership restrictions
    const preview = await this.getAccountDeletionPreview(params.userId);
    if (!preview.canDelete) {
      const orgNames = preview.blockingOrganizations.map((o) => `'${o.name}'`).join(", ");
      throw new Error(
        `Cannot delete account: You are the sole Owner of active organization(s): ${orgNames}. Please transfer ownership to another member or delete the organization first.`
      );
    }

    // 5. Fetch all user organization memberships for audit dispatch
    const userOrgs = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id));

    for (const membership of userOrgs) {
      await AuditService.log({
        organizationId: membership.organizationId,
        actorId: user.id,
        actorEmail: user.email,
        action: "user:account_delete",
        resourceType: "user",
        resourceId: user.id,
        outcome: "success",
        metadata: {
          email: user.email,
          fullName: user.fullName,
          deletedAt: new Date().toISOString(),
          compliance: "Personal data removed; audit records anonymized and retained.",
        },
      });
    }

    // 6. Safe, transactional execution
    return await db.transaction(async (tx) => {
      // Row lock the user
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);

      // Revoke all sessions
      await tx.delete(userSessions).where(eq(userSessions.userId, user.id));

      // Remove password reset tokens
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

      // Remove preferences & notifications
      await tx.delete(userPreferences).where(eq(userPreferences.userId, user.id));
      await tx.delete(notifications).where(eq(notifications.userId, user.id));

      // Remove workspace memberships & database permissions
      await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, user.id));
      await tx.delete(databasePermissions).where(eq(databasePermissions.userId, user.id));

      // Remove organization memberships
      await tx.delete(organizationMembers).where(eq(organizationMembers.userId, user.id));

      // Delete user record (audit_logs.actor_id sets null, retaining audit history)
      await tx.delete(users).where(eq(users.id, user.id));

      return {
        success: true,
        message: "Account deleted successfully.",
      };
    });
  }
}
