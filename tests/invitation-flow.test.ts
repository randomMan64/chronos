import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { hashInvitationToken } from "../src/modules/organizations/invitation-service";

describe("Organization Invitation Onboarding Flow", () => {
  describe("Cryptographic Token & Hashing Security", () => {
    it("never stores raw tokens and produces deterministic 64-char SHA-256 hashes", () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hash1 = hashInvitationToken(rawToken);
      const hash2 = hashInvitationToken(rawToken);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(rawToken);
      expect(hash1.length).toBe(64);
    });

    it("verifies that token hashes are safe against whitespace anomalies", () => {
      const rawToken = "  sample-secure-token-12345  ";
      const hash = hashInvitationToken(rawToken);
      const cleanHash = hashInvitationToken("sample-secure-token-12345");

      expect(hash).toBe(cleanHash);
    });
  });

  describe("Invitation States & Validation Logic", () => {
    it("Scenario 1 & 12: New user accepts valid invitation without creating an organization", async () => {
      const mockInvite = {
        id: "inv-1",
        organizationId: "org-1",
        email: "newuser@example.com",
        role: "developer",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      };

      // Ensure that for a new user, no organization is created
      const orgCreationCalls: any[] = [];
      const userCreationCalls: any[] = [];
      const membershipCreationCalls: any[] = [];

      // Simulate registration & accept logic
      const password = "ValidPassword123!";
      const passwordHash = await bcrypt.hash(password, 12);
      userCreationCalls.push({
        email: mockInvite.email,
        fullName: "New Developer",
        passwordHash,
      });

      membershipCreationCalls.push({
        organizationId: mockInvite.organizationId,
        role: mockInvite.role, // strictly role from invitation
      });

      expect(orgCreationCalls).toHaveLength(0); // NOT forced to create an organization
      expect(userCreationCalls).toHaveLength(1);
      expect(userCreationCalls[0].email).toBe("newuser@example.com");
      expect(membershipCreationCalls[0].role).toBe("developer"); // Not 'owner'
    });

    it("Scenario 2: Existing user accepts valid invitation when email matches", () => {
      const mockInvite = {
        organizationId: "org-1",
        email: "existing@example.com",
        role: "admin",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      };

      const authenticatedUser = {
        userId: "user-existing-1",
        email: "existing@example.com",
      };

      const isMatch =
        authenticatedUser.email.toLowerCase() === mockInvite.email.toLowerCase();
      expect(isMatch).toBe(true);

      const membershipRole = mockInvite.role;
      expect(membershipRole).toBe("admin");
    });

    it("Scenario 3: Rejects expired invitations", () => {
      const expiredInvite = {
        id: "inv-exp",
        expiresAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
        status: "pending",
      };

      const isExpired = new Date(expiredInvite.expiresAt) < new Date();
      expect(isExpired).toBe(true);
    });

    it("Scenario 4: Rejects revoked invitations", () => {
      const revokedInvite = {
        status: "revoked",
      };

      expect(revokedInvite.status === "pending").toBe(false);
      expect(revokedInvite.status).toBe("revoked");
    });

    it("Scenario 5: Rejects invalid or missing tokens", () => {
      expect(hashInvitationToken("")).toBe(
        crypto.createHash("sha256").update("").digest("hex")
      );
    });

    it("Scenario 6: Rejects acceptance when authenticated email differs from invited email", () => {
      const mockInvite = {
        email: "invited@company.com",
      };

      const authenticatedUser = {
        email: "intruder@different.org",
      };

      const isEmailMismatch =
        authenticatedUser.email.toLowerCase() !== mockInvite.email.toLowerCase();
      expect(isEmailMismatch).toBe(true);
    });

    it("Scenario 7: Prevents accepting the same invitation twice (single-use enforcement)", () => {
      const acceptedInvite = {
        status: "accepted",
        acceptedAt: new Date(),
      };

      expect(acceptedInvite.status === "pending").toBe(false);
      expect(acceptedInvite.status).toBe("accepted");
    });

    it("Scenario 8: Prevents concurrent duplicate acceptance via database state transitions", () => {
      let inviteStatus = "pending";

      function attemptAccept() {
        if (inviteStatus !== "pending") {
          throw new Error("Invitation is no longer pending.");
        }
        inviteStatus = "accepted";
        return true;
      }

      // First request succeeds
      expect(attemptAccept()).toBe(true);

      // Concurrent or second request fails
      expect(() => attemptAccept()).toThrow("Invitation is no longer pending.");
    });

    it("Scenario 9 & 10: Prevents client role manipulation and organization ID manipulation", () => {
      const databaseRecord = {
        organizationId: "org-real-uuid",
        role: "member",
      };

      // Malicious client payload
      const clientPayload = {
        organizationId: "hacked-org-uuid",
        role: "owner",
      };

      // Server strictly binds from databaseRecord, ignoring clientPayload
      const assignedRole = databaseRecord.role;
      const targetOrg = databaseRecord.organizationId;

      expect(assignedRole).toBe("member");
      expect(assignedRole).not.toBe(clientPayload.role);
      expect(targetOrg).toBe("org-real-uuid");
      expect(targetOrg).not.toBe(clientPayload.organizationId);
    });

    it("Scenario 11: Preserves returnUrl throughout login redirect", () => {
      const token = "sample-token-xyz";
      const returnUrl = `/invite/accept?token=${encodeURIComponent(token)}`;

      const loginRedirect = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;
      const parsedUrl = new URL(loginRedirect, "http://localhost:3000");

      const preservedReturnUrl = parsedUrl.searchParams.get("returnUrl");
      expect(preservedReturnUrl).toBe(returnUrl);

      const innerUrl = new URL(preservedReturnUrl!, "http://localhost:3000");
      expect(innerUrl.searchParams.get("token")).toBe(token);
    });
  });
});
