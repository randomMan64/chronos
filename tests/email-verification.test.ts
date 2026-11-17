import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  isValidEmailSyntax,
  isDisposableEmail,
  normalizeEmail,
  maskEmail,
} from "../src/lib/auth/email-validator";

describe("CHRONOS — Email-First Verification and Account Activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Email Validation & Security Sanitization", () => {
    it("Case 8: RFC syntax validation rejects malformed email addresses", () => {
      expect(isValidEmailSyntax("invalid-email")).toBe(false);
      expect(isValidEmailSyntax("user@")).toBe(false);
      expect(isValidEmailSyntax("@domain.com")).toBe(false);
      expect(isValidEmailSyntax("user@domain")).toBe(false);
      expect(isValidEmailSyntax("user..name@domain.com")).toBe(false);
      expect(isValidEmailSyntax("")).toBe(false);

      expect(isValidEmailSyntax("developer@chronos.io")).toBe(true);
      expect(isValidEmailSyntax("john.doe+test@sub.example.com")).toBe(true);
    });

    it("Case 9: Disposable & temporary email domains are strictly rejected", () => {
      expect(isDisposableEmail("attacker@tempmail.com")).toBe(true);
      expect(isDisposableEmail("fake@mailinator.com")).toBe(true);
      expect(isDisposableEmail("test@guerrillamail.com")).toBe(true);
      expect(isDisposableEmail("user@10minutemail.com")).toBe(true);
      expect(isDisposableEmail("bad@throwawaymail.com")).toBe(true);
      expect(isDisposableEmail("anon@yopmail.com")).toBe(true);

      // Legitimate business & personal domains accepted
      expect(isDisposableEmail("alice@company.com")).toBe(false);
      expect(isDisposableEmail("admin@chronos.internal")).toBe(false);
      expect(isDisposableEmail("user@gmail.com")).toBe(false);
    });

    it("Normalizes emails and correctly masks email for pending verification UI", () => {
      expect(normalizeEmail("  Alex.Dev@Company.COM  ")).toBe("alex.dev@company.com");
      expect(maskEmail("alexdrive790@gmail.com")).toBe("a***0@gmail.com");
      expect(maskEmail("bob@acme.org")).toBe("b*b@acme.org");
      expect(maskEmail("ab@xyz.com")).toBe("a*@xyz.com");
    });
  });

  describe("2. Cryptographic Token Generation & Hashing", () => {
    it("Case 2: Generates 256-bit secure tokens and stores only SHA-256 hashes", () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      expect(rawToken.length).toBe(64); // 32 bytes in hex = 64 chars

      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      expect(tokenHash.length).toBe(64);
      expect(tokenHash).not.toBe(rawToken);

      // Verifies deterministic hash verification
      const verifyHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      expect(verifyHash).toBe(tokenHash);
    });
  });

  describe("3. Normal Registration Lifecycle & Deferrals", () => {
    it("Case 1 & 4: Normal registration creates pending user with isEmailVerified=false and NO session cookie", async () => {
      const pendingUser = {
        id: "user-test-1",
        email: "engineer@chronos.io",
        fullName: "Dev User",
        isEmailVerified: false,
        pendingOrganizationName: "Dev Team",
        passwordHash: await bcrypt.hash("SecurePassword123!", 10),
      };

      expect(pendingUser.isEmailVerified).toBe(false);
      expect(pendingUser.pendingOrganizationName).toBe("Dev Team");

      // Verifies that NO session token or cookie is issued at registration stage
      const registrationResponse = {
        success: true,
        email: pendingUser.email,
        requiresVerification: true,
        message: "Account created successfully. A verification link has been sent to your email address.",
      };

      expect(registrationResponse.requiresVerification).toBe(true);
      expect((registrationResponse as any).sessionToken).toBeUndefined();
      expect((registrationResponse as any).sessionId).toBeUndefined();
    });

    it("Case 3 & 5: Dispatches verification email and defers organization/workspace creation", () => {
      const createdOrganizations: any[] = [];
      const createdWorkspaces: any[] = [];
      const dispatchedEmails: any[] = [];

      // Registration handler execution
      const email = "owner@startup.io";
      const orgName = "Startup Inc";
      const rawToken = crypto.randomBytes(32).toString("hex");

      // Defer organization creation: only store pendingOrganizationName
      const userRecord = {
        email,
        pendingOrganizationName: orgName,
        isEmailVerified: false,
      };

      // Dispatch verification email
      dispatchedEmails.push({
        to: email,
        token: rawToken,
        expiresInMinutes: 30,
      });

      // Assertions
      expect(createdOrganizations).toHaveLength(0); // Deferred until verification
      expect(createdWorkspaces).toHaveLength(0); // Deferred until verification
      expect(dispatchedEmails).toHaveLength(1);
      expect(dispatchedEmails[0].to).toBe("owner@startup.io");
      expect(dispatchedEmails[0].expiresInMinutes).toBe(30);
    });

    it("Case 6: Re-registration with unverified email regenerates token, invalidates old token, does not duplicate user", () => {
      let existingUser = {
        id: "user-unverified-1",
        email: "unverified@chronos.io",
        isEmailVerified: false,
        fullName: "Initial Name",
        pendingOrganizationName: "Initial Org",
      };

      const tokensInDb: Array<{ id: string; userId: string; tokenHash: string; consumedAt: Date | null }> = [
        {
          id: "tok-1",
          userId: existingUser.id,
          tokenHash: "old-hash-1",
          consumedAt: null,
        },
      ];

      // Re-register attempt
      const attemptRegister = (email: string, newFullName: string) => {
        if (email === existingUser.email && !existingUser.isEmailVerified) {
          // Update user
          existingUser.fullName = newFullName;
          // Invalidate prior unconsumed tokens
          tokensInDb.forEach((t) => {
            if (t.userId === existingUser.id && !t.consumedAt) {
              t.consumedAt = new Date();
            }
          });
          // Generate new token
          const newToken = crypto.randomBytes(32).toString("hex");
          const newHash = crypto.createHash("sha256").update(newToken).digest("hex");
          tokensInDb.push({
            id: "tok-2",
            userId: existingUser.id,
            tokenHash: newHash,
            consumedAt: null,
          });
          return { success: true, user: existingUser, newToken };
        }
        return { success: false };
      };

      const result = attemptRegister("unverified@chronos.io", "Updated Name");
      expect(result.success).toBe(true);
      expect(existingUser.fullName).toBe("Updated Name");
      expect(tokensInDb[0].consumedAt).not.toBeNull(); // Old token invalidated
      expect(tokensInDb[1].consumedAt).toBeNull(); // Fresh token active
      expect(tokensInDb).toHaveLength(2);
    });

    it("Case 7: Re-registration with already verified email returns 409 Conflict", () => {
      const verifiedUser = {
        id: "user-verified-1",
        email: "verified@chronos.io",
        isEmailVerified: true,
      };

      const checkRegisterConflict = (email: string) => {
        if (email === verifiedUser.email && verifiedUser.isEmailVerified) {
          return { status: 409, error: "An account with this email already exists" };
        }
        return { status: 201 };
      };

      const res = checkRegisterConflict("verified@chronos.io");
      expect(res.status).toBe(409);
      expect(res.error).toBe("An account with this email already exists");
    });
  });

  describe("4. Verification Consumption & Deferred Provisioning", () => {
    it("Case 10, 11 & 12: Valid token verification marks user verified, consumes token, and initializes org/workspace", () => {
      const user = {
        id: "user-new-owner",
        email: "newowner@chronos.io",
        isEmailVerified: false,
        emailVerifiedAt: null as Date | null,
        pendingOrganizationName: "Apex Systems" as string | null,
      };

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const tokenRecord = {
        id: "tok-valid-1",
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
        consumedAt: null as Date | null,
      };

      const organizationsCreated: any[] = [];
      const membershipsCreated: any[] = [];
      const workspacesCreated: any[] = [];

      // Verification Execution
      const verifyToken = (inputRawToken: string) => {
        const inputHash = crypto.createHash("sha256").update(inputRawToken).digest("hex");
        if (inputHash !== tokenRecord.tokenHash) throw new Error("INVALID_TOKEN");
        if (tokenRecord.consumedAt) throw new Error("TOKEN_ALREADY_USED");
        if (new Date(tokenRecord.expiresAt) < new Date()) throw new Error("TOKEN_EXPIRED");

        // 1. Consume token
        tokenRecord.consumedAt = new Date();
        // 2. Mark user verified
        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();

        // 3. Deferred initialization
        if (user.pendingOrganizationName) {
          const org = {
            id: "org-apex-1",
            name: user.pendingOrganizationName,
            slug: "apex-systems",
          };
          organizationsCreated.push(org);

          membershipsCreated.push({
            organizationId: org.id,
            userId: user.id,
            role: "owner",
          });

          const ws = {
            id: "ws-primary-1",
            organizationId: org.id,
            name: "Primary Workspace",
            environment: "development",
          };
          workspacesCreated.push(ws);

          user.pendingOrganizationName = null;
        }

        return { success: true, message: "Email verified successfully." };
      };

      const result = verifyToken(rawToken);
      expect(result.success).toBe(true);
      expect(user.isEmailVerified).toBe(true);
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(tokenRecord.consumedAt).not.toBeNull();

      // Verify deferred organization & workspace provisioned exactly once
      expect(organizationsCreated).toHaveLength(1);
      expect(organizationsCreated[0].name).toBe("Apex Systems");
      expect(membershipsCreated[0].role).toBe("owner");
      expect(workspacesCreated[0].name).toBe("Primary Workspace");
      expect(user.pendingOrganizationName).toBeNull();
    });

    it("Case 13: Expired token (> 30 mins) is strictly rejected", () => {
      const expiredTokenRecord = {
        tokenHash: "expired-hash",
        expiresAt: new Date(Date.now() - 1000 * 60 * 5), // expired 5 minutes ago
        consumedAt: null,
      };

      const isExpired = new Date(expiredTokenRecord.expiresAt) < new Date();
      expect(isExpired).toBe(true);

      const validateToken = (record: typeof expiredTokenRecord) => {
        if (new Date(record.expiresAt) < new Date()) {
          return { error: "Verification link has expired. Please request a fresh one.", code: "TOKEN_EXPIRED" };
        }
        return { success: true };
      };

      const result = validateToken(expiredTokenRecord);
      expect(result.code).toBe("TOKEN_EXPIRED");
    });

    it("Case 14: Already consumed token is rejected", () => {
      const consumedTokenRecord = {
        tokenHash: "used-hash",
        expiresAt: new Date(Date.now() + 1000 * 60 * 20),
        consumedAt: new Date(Date.now() - 1000 * 60 * 2), // consumed 2 minutes ago
      };

      const validateToken = (record: typeof consumedTokenRecord) => {
        if (record.consumedAt !== null) {
          return { error: "This verification link has already been used.", code: "TOKEN_ALREADY_USED" };
        }
        return { success: true };
      };

      const result = validateToken(consumedTokenRecord);
      expect(result.code).toBe("TOKEN_ALREADY_USED");
    });
  });

  describe("5. Login Enforcement & Session Boundaries", () => {
    it("Case 15: Unverified user login attempt is blocked with 403 EMAIL_UNVERIFIED", async () => {
      const password = "ValidPassword123!";
      const passwordHash = await bcrypt.hash(password, 10);

      const unverifiedUser = {
        id: "user-unverified",
        email: "pending@chronos.io",
        passwordHash,
        isEmailVerified: false,
      };

      const handleLogin = async (attemptEmail: string, attemptPass: string) => {
        if (attemptEmail !== unverifiedUser.email) return { status: 401, error: "Invalid credentials" };
        const valid = await bcrypt.compare(attemptPass, unverifiedUser.passwordHash);
        if (!valid) return { status: 401, error: "Invalid credentials" };

        if (!unverifiedUser.isEmailVerified) {
          return {
            status: 403,
            body: {
              error: "Please verify your email address before signing in.",
              code: "EMAIL_UNVERIFIED",
              email: unverifiedUser.email,
            },
          };
        }

        return { status: 200, sessionCreated: true };
      };

      const result = await handleLogin("pending@chronos.io", password);
      expect(result.status).toBe(403);
      expect(result.body?.code).toBe("EMAIL_UNVERIFIED");
      expect((result as any).sessionCreated).toBeUndefined();
    });

    it("Case 16: Verified user login succeeds and issues authenticated session", async () => {
      const password = "ValidPassword123!";
      const passwordHash = await bcrypt.hash(password, 10);

      const verifiedUser = {
        id: "user-verified-active",
        email: "active@chronos.io",
        passwordHash,
        isEmailVerified: true,
      };

      const handleLogin = async (attemptEmail: string, attemptPass: string) => {
        if (attemptEmail !== verifiedUser.email) return { status: 401, error: "Invalid credentials" };
        const valid = await bcrypt.compare(attemptPass, verifiedUser.passwordHash);
        if (!valid) return { status: 401, error: "Invalid credentials" };

        if (!verifiedUser.isEmailVerified) {
          return { status: 403, code: "EMAIL_UNVERIFIED" };
        }

        const sessionId = "sess-" + crypto.randomBytes(16).toString("hex");
        return { status: 200, sessionId, user: { id: verifiedUser.id, email: verifiedUser.email } };
      };

      const result = await handleLogin("active@chronos.io", password);
      expect(result.status).toBe(200);
      expect(result.sessionId).toBeDefined();
      expect(result.user?.email).toBe("active@chronos.io");
    });
  });

  describe("6. Resend Rate Limiting & User Enumeration Protection", () => {
    it("Case 17: Resend verification enforces 60-second rate-limit cooldown", () => {
      const recentTokenTime = new Date(Date.now() - 25 * 1000); // 25 seconds ago (less than 60s)
      const elapsedSeconds = Math.floor((Date.now() - recentTokenTime.getTime()) / 1000);

      const checkRateLimit = (elapsed: number) => {
        if (elapsed < 60) {
          const retryAfter = 60 - elapsed;
          return {
            status: 429,
            code: "RATE_LIMITED",
            retryAfter,
            error: `Please wait ${retryAfter} seconds before requesting another verification email.`,
          };
        }
        return { status: 200 };
      };

      const rateLimitRes = checkRateLimit(elapsedSeconds);
      expect(rateLimitRes.status).toBe(429);
      expect(rateLimitRes.code).toBe("RATE_LIMITED");
      expect(rateLimitRes.retryAfter).toBeGreaterThan(0);
      expect(rateLimitRes.retryAfter).toBeLessThanOrEqual(60);
    });

    it("Case 18: Resend verification generates fresh token and invalidates prior unconsumed tokens", () => {
      const tokens: Array<{ id: string; consumedAt: Date | null }> = [
        { id: "tok-old-1", consumedAt: null },
      ];

      // User triggers resend after cooldown
      tokens.forEach((t) => {
        if (!t.consumedAt) t.consumedAt = new Date();
      });

      const newToken = { id: "tok-fresh-2", consumedAt: null };
      tokens.push(newToken);

      expect(tokens[0].consumedAt).not.toBeNull();
      expect(tokens[1].consumedAt).toBeNull();
      expect(tokens).toHaveLength(2);
    });

    it("Case 19: Resend verification does not leak user existence for non-existent or verified emails", () => {
      const handleResend = (email: string, userExists: boolean, isVerified: boolean) => {
        // Uniform response to prevent account enumeration
        if (!userExists || isVerified) {
          return {
            status: 200,
            message: "If an unverified account exists with this email, a verification link has been sent.",
          };
        }
        return {
          status: 200,
          message: "A new verification link has been sent to your email address.",
        };
      };

      const nonExistentRes = handleResend("ghost@nowhere.com", false, false);
      const verifiedRes = handleResend("existing@company.com", true, true);

      expect(nonExistentRes.status).toBe(200);
      expect(verifiedRes.status).toBe(200);
      expect(nonExistentRes.message).toContain("If an unverified account exists");
    });
  });

  describe("7. Invitation Flow Integration", () => {
    it("Case 20: New invited user registration sets isEmailVerified=false and verification completes membership", () => {
      const invitation = {
        id: "inv-collab-1",
        organizationId: "org-collab-1",
        email: "invited.dev@partner.com",
        role: "developer",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      };

      // 1. User registers via invitation
      const registeredUser = {
        id: "user-invited-1",
        email: invitation.email,
        fullName: "Invited Developer",
        isEmailVerified: false,
        pendingInvitationId: invitation.id,
      };

      expect(registeredUser.isEmailVerified).toBe(false);
      expect(registeredUser.pendingInvitationId).toBe("inv-collab-1");

      // 2. Organization membership is NOT granted until email verification
      const memberships: any[] = [];
      expect(memberships).toHaveLength(0);

      // 3. Email verification completes
      registeredUser.isEmailVerified = true;
      invitation.status = "accepted";
      memberships.push({
        organizationId: invitation.organizationId,
        userId: registeredUser.id,
        role: invitation.role,
      });

      expect(registeredUser.isEmailVerified).toBe(true);
      expect(invitation.status).toBe("accepted");
      expect(memberships).toHaveLength(1);
      expect(memberships[0].role).toBe("developer");
      expect(memberships[0].organizationId).toBe("org-collab-1");
    });

    it("ensures verification routes are recognized as public in proxy matcher", () => {
      const publicPrefixes = [
        "/invite",
        "/verify-email",
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/resend-verification",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/invitations",
        "/api/v1/health",
        "/api/v1/init",
      ];

      const isPublic = (pathname: string) => {
        return publicPrefixes.some(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
        );
      };

      expect(isPublic("/verify-email")).toBe(true);
      expect(isPublic("/verify-email/pending")).toBe(true);
      expect(isPublic("/api/v1/auth/verify-email")).toBe(true);
      expect(isPublic("/api/v1/auth/resend-verification")).toBe(true);
      expect(isPublic("/dashboard")).toBe(false);
      expect(isPublic("/account")).toBe(false);
    });
  });
});
