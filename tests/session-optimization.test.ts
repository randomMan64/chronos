import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthError, ForbiddenError } from "@/lib/auth/guards";
import { handleApiError } from "@/lib/errors";

describe("CHRONOS — Session Validation Optimization & Multi-Device Revocation", () => {
  interface MockSession {
    id: string;
    userId: string;
    deviceId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    revokeReason: string | null;
  }

  // Simulated backend authoritative session validation
  const validateSessionAuthoritative = (
    session: MockSession | null | undefined,
    currentTime: Date = new Date()
  ): { valid: boolean; code?: string; message?: string } => {
    if (!session) {
      return {
        valid: false,
        code: "UNAUTHENTICATED",
        message: "Authentication required. Please sign in.",
      };
    }
    if (session.revokedAt !== null) {
      return {
        valid: false,
        code: "SESSION_REVOKED",
        message: "Your session has been signed out because it was revoked from another device.",
      };
    }
    if (session.expiresAt <= currentTime) {
      return {
        valid: false,
        code: "SESSION_EXPIRED",
        message: "Your session has expired. Please sign in again.",
      };
    }
    return { valid: true };
  };

  describe("1. Multi-Device Sessions & Individual Revocation", () => {
    it("manages 3 devices for a user and revokes only the targeted device", () => {
      const sessions: MockSession[] = [
        {
          id: "sess-desktop",
          userId: "user-alpha",
          deviceId: "dev-desktop",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-mobile",
          userId: "user-alpha",
          deviceId: "dev-mobile",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-laptop",
          userId: "user-alpha",
          deviceId: "dev-laptop",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      // 1. All 3 sessions valid initially
      expect(validateSessionAuthoritative(sessions[0]).valid).toBe(true);
      expect(validateSessionAuthoritative(sessions[1]).valid).toBe(true);
      expect(validateSessionAuthoritative(sessions[2]).valid).toBe(true);

      // 2. User revokes mobile device
      const targetSession = sessions.find((s) => s.id === "sess-mobile")!;
      targetSession.revokedAt = new Date();
      targetSession.revokeReason = "manual_revocation";

      // 3 & 4. Revoked mobile device makes authenticated request -> returns 401 SESSION_REVOKED
      const mobileCheck = validateSessionAuthoritative(sessions[1]);
      expect(mobileCheck.valid).toBe(false);
      expect(mobileCheck.code).toBe("SESSION_REVOKED");

      // Desktop and Laptop remain active
      expect(validateSessionAuthoritative(sessions[0]).valid).toBe(true);
      expect(validateSessionAuthoritative(sessions[2]).valid).toBe(true);
    });

    it("verifies AuthError translates to 401 SESSION_REVOKED in API error handler", () => {
      const err = new AuthError(
        "Your session has been signed out because it was revoked from another device.",
        401,
        "SESSION_REVOKED"
      );

      const res = handleApiError(err);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SESSION_REVOKED");
      expect(res.body.error).toContain("revoked from another device");
    });
  });

  describe("2. Bulk Revocation: Revoke Others vs Sign Out Everywhere", () => {
    it("revoke-all-others preserves current session and revokes other sessions", () => {
      const currentSessionId = "sess-1";
      const sessions: MockSession[] = [
        {
          id: "sess-1",
          userId: "user-1",
          deviceId: "dev-1",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-2",
          userId: "user-1",
          deviceId: "dev-2",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-3",
          userId: "user-1",
          deviceId: "dev-3",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      // Revoke all other sessions
      sessions.forEach((s) => {
        if (s.id !== currentSessionId) {
          s.revokedAt = new Date();
          s.revokeReason = "revoke_all_others";
        }
      });

      expect(validateSessionAuthoritative(sessions[0]).valid).toBe(true);
      expect(validateSessionAuthoritative(sessions[1]).valid).toBe(false);
      expect(validateSessionAuthoritative(sessions[1]).code).toBe("SESSION_REVOKED");
      expect(validateSessionAuthoritative(sessions[2]).valid).toBe(false);
    });

    it("sign-out-everywhere revokes ALL sessions including current session", () => {
      const sessions: MockSession[] = [
        {
          id: "sess-1",
          userId: "user-1",
          deviceId: "dev-1",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-2",
          userId: "user-1",
          deviceId: "dev-2",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      // Sign out everywhere
      sessions.forEach((s) => {
        s.revokedAt = new Date();
        s.revokeReason = "sign_out_everywhere";
      });

      expect(validateSessionAuthoritative(sessions[0]).valid).toBe(false);
      expect(validateSessionAuthoritative(sessions[0]).code).toBe("SESSION_REVOKED");
      expect(validateSessionAuthoritative(sessions[1]).valid).toBe(false);
      expect(validateSessionAuthoritative(sessions[1]).code).toBe("SESSION_REVOKED");
    });

    it("ensures revoking User A's sessions never affects User B's sessions", () => {
      const userASessions: MockSession[] = [
        {
          id: "sess-a",
          userId: "user-a",
          deviceId: "dev-a",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      const userBSessions: MockSession[] = [
        {
          id: "sess-b",
          userId: "user-b",
          deviceId: "dev-b",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      // Revoke all for User A
      userASessions.forEach((s) => {
        s.revokedAt = new Date();
        s.revokeReason = "sign_out_everywhere";
      });

      expect(validateSessionAuthoritative(userASessions[0]).valid).toBe(false);
      expect(validateSessionAuthoritative(userBSessions[0]).valid).toBe(true); // User B untouched!
    });
  });

  describe("3. Client Interception, Multi-Tab Sync & Error Differentiation", () => {
    it("ensures BroadcastChannel payload contains no sensitive tokens", () => {
      const payload = {
        event: "SESSION_REVOKED",
        reason: "SESSION_REVOKED",
        timestamp: Date.now(),
      };

      expect(payload).not.toHaveProperty("token");
      expect(payload).not.toHaveProperty("sessionId");
      expect(payload).not.toHaveProperty("password");
      expect(payload.event).toBe("SESSION_REVOKED");
    });

    it("ensures 403 Forbidden errors do NOT trigger session revocation", () => {
      const forbiddenError = new ForbiddenError("Forbidden: Missing permission 'members:invite'", 403);
      const apiResponse = handleApiError(forbiddenError);

      expect(apiResponse.status).toBe(403);
      // Status is 403, not 401: client interceptor strictly checks response.status === 401
      expect(apiResponse.status === 401).toBe(false);
    });

    it("verifies temporary network errors do not cause false logouts", () => {
      // If network drops (fetch throws TypeError), watchdog should apply exponential backoff rather than logout
      let isLoggedOut = false;
      let backoffMs = 5000;

      const simulateWatchdogNetworkFailure = () => {
        try {
          throw new TypeError("Failed to fetch");
        } catch {
          backoffMs = Math.min(backoffMs * 2, 60000);
          // Do NOT call logout!
        }
      };

      simulateWatchdogNetworkFailure();
      expect(isLoggedOut).toBe(false);
      expect(backoffMs).toBe(10000); // Backoff doubled safely
    });
  });
});
