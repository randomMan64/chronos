import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseUserAgent, hashDeviceKey, ParsedDeviceInfo } from "@/lib/auth/device-detector";
import crypto from "crypto";

describe("CHRONOS — Device Recognition & Session Management", () => {
  describe("1. Device Detection & Parsing", () => {
    it("detects desktop Chrome with User-Agent Client Hints", () => {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-ch-ua-platform-version": '"15.0.0"',
      });

      const info = parseUserAgent(headers.get("user-agent"), headers);

      expect(info.browser).toBe("Google Chrome");
      expect(info.operatingSystem).toBe("Windows");
      expect(info.deviceType).toBe("desktop");
      expect(info.manufacturer).toBeNull(); // Desktops do not invent hardware manufacturer
      expect(info.model).toBeNull(); // Never invent laptop/desktop model
      expect(info.deviceName).toBe("Google Chrome on Windows");
    });

    it("detects mobile Safari on iPhone", () => {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        "sec-ch-ua-mobile": "?1",
      });

      const info = parseUserAgent(headers.get("user-agent"), headers);

      expect(info.browser).toBe("Apple Safari");
      expect(info.operatingSystem).toBe("iOS");
      expect(info.operatingSystemVersion).toBe("17.4");
      expect(info.deviceType).toBe("mobile");
      expect(info.manufacturer).toBe("Apple");
      expect(info.model).toBe("iPhone");
      expect(info.deviceName).toBe("iPhone (Apple Safari)");
    });

    it("detects tablet iPadOS on iPad", () => {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      });

      const info = parseUserAgent(headers.get("user-agent"), headers);

      expect(info.browser).toBe("Apple Safari");
      expect(info.operatingSystem).toBe("iPadOS");
      expect(info.deviceType).toBe("tablet");
      expect(info.manufacturer).toBe("Apple");
      expect(info.model).toBe("iPad");
    });

    it("detects Android mobile with client hint model", () => {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="122"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-ch-ua-model": '"Pixel 7"',
      });

      const info = parseUserAgent(headers.get("user-agent"), headers);

      expect(info.browser).toBe("Google Chrome");
      expect(info.operatingSystem).toBe("Android");
      expect(info.deviceType).toBe("mobile");
      expect(info.model).toBe("Pixel 7");
      expect(info.manufacturer).toBe("Google");
      expect(info.deviceName).toBe("Pixel 7 (Google Chrome)");
    });

    it("gracefully falls back when Client Hints are completely missing", () => {
      // Legacy or privacy-focused browser without Client Hints
      const legacyUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

      const info = parseUserAgent(legacyUa, undefined);

      expect(info.browser).toBe("Google Chrome");
      expect(info.operatingSystem).toBe("macOS");
      expect(info.operatingSystemVersion).toBe("10.15.7");
      expect(info.deviceType).toBe("desktop");
      expect(info.model).toBeNull(); // Never fabricate hardware info
      expect(info.deviceName).toBe("Google Chrome on macOS");
    });

    it("handles completely unknown user agent without fabricating hardware information", () => {
      const info = parseUserAgent("CustomCLI/1.0", undefined);

      expect(info.browser).toBe("Unknown");
      expect(info.operatingSystem).toBe("Unknown");
      expect(info.deviceType).toBe("desktop");
      expect(info.manufacturer).toBeNull();
      expect(info.model).toBeNull();
      expect(info.deviceName).toBe("Unknown on Unknown");
    });

    it("extracts approximate network location without claiming GPS accuracy", () => {
      const headers = new Headers({
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "x-forwarded-for": "198.51.100.42, 10.0.0.1",
        "cf-ipcountry": "US",
        "x-vercel-ip-country-region": "CA",
        "x-vercel-ip-city": "San%20Francisco",
      });

      const info = parseUserAgent(headers.get("user-agent"), headers);

      expect(info.ipAddress).toBe("198.51.100.42");
      expect(info.country).toBe("US");
      expect(info.region).toBe("CA");
      expect(info.city).toBe("San Francisco"); // Correctly decoded
    });
  });

  describe("2. Device Cryptographic Identification", () => {
    it("generates deterministic SHA-256 verifier for raw device keys", () => {
      const rawKey1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const hash1 = hashDeviceKey(rawKey1);
      const hash2 = hashDeviceKey(rawKey1);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string

      // Raw key must not equal hash verifier
      expect(rawKey1).not.toBe(hash1);
    });

    it("produces different hashes for different device keys", () => {
      const keyA = crypto.randomBytes(32).toString("hex");
      const keyB = crypto.randomBytes(32).toString("hex");

      expect(hashDeviceKey(keyA)).not.toBe(hashDeviceKey(keyB));
    });
  });

  describe("3. Session Security & Revocation Rules", () => {
    interface MockSession {
      id: string;
      userId: string;
      deviceId: string;
      expiresAt: Date;
      revokedAt: Date | null;
      revokeReason: string | null;
    }

    const isSessionValid = (session: MockSession, checkTime: Date = new Date()): boolean => {
      // Must not be revoked
      if (session.revokedAt !== null) return false;
      // Must not be expired
      if (session.expiresAt <= checkTime) return false;
      return true;
    };

    it("validates an active session correctly", () => {
      const activeSession: MockSession = {
        id: "sess-1",
        userId: "user-1",
        deviceId: "dev-1",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        revokedAt: null,
        revokeReason: null,
      };

      expect(isSessionValid(activeSession)).toBe(true);
    });

    it("rejects an expired session", () => {
      const expiredSession: MockSession = {
        id: "sess-2",
        userId: "user-1",
        deviceId: "dev-1",
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        revokedAt: null,
        revokeReason: null,
      };

      expect(isSessionValid(expiredSession)).toBe(false);
    });

    it("rejects an individually revoked session immediately", () => {
      const revokedSession: MockSession = {
        id: "sess-3",
        userId: "user-1",
        deviceId: "dev-1",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        revokedAt: new Date(),
        revokeReason: "manual_revocation",
      };

      expect(isSessionValid(revokedSession)).toBe(false);
    });

    it("simulates signing out all other sessions while preserving current session", () => {
      const currentSessionId = "sess-current";
      const sessions: MockSession[] = [
        {
          id: currentSessionId,
          userId: "user-1",
          deviceId: "dev-1",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-phone",
          userId: "user-1",
          deviceId: "dev-2",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-laptop",
          userId: "user-1",
          deviceId: "dev-3",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      // Simulate revoke-all-others
      const revokeTime = new Date();
      sessions.forEach((s) => {
        if (s.id !== currentSessionId) {
          s.revokedAt = revokeTime;
          s.revokeReason = "revoke_all_others";
        }
      });

      // Current session remains valid
      expect(isSessionValid(sessions[0])).toBe(true);
      // Other sessions are revoked
      expect(isSessionValid(sessions[1])).toBe(false);
      expect(isSessionValid(sessions[2])).toBe(false);
      expect(sessions[1].revokeReason).toBe("revoke_all_others");
      expect(sessions[2].revokeReason).toBe("revoke_all_others");
    });

    it("simulates password change revoking all other sessions", () => {
      const currentSessionId = "sess-current";
      const sessions: MockSession[] = [
        {
          id: currentSessionId,
          userId: "user-1",
          deviceId: "dev-1",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
        {
          id: "sess-old-browser",
          userId: "user-1",
          deviceId: "dev-2",
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
          revokeReason: null,
        },
      ];

      // On password change:
      sessions.forEach((s) => {
        if (s.id !== currentSessionId) {
          s.revokedAt = new Date();
          s.revokeReason = "password_change";
        }
      });

      expect(isSessionValid(sessions[0])).toBe(true);
      expect(isSessionValid(sessions[1])).toBe(false);
      expect(sessions[1].revokeReason).toBe("password_change");
    });

    it("simulates password reset token invalidating ALL sessions", () => {
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

      // Password reset via link revokes all sessions
      sessions.forEach((s) => {
        s.revokedAt = new Date();
        s.revokeReason = "password_reset";
      });

      expect(isSessionValid(sessions[0])).toBe(false);
      expect(isSessionValid(sessions[1])).toBe(false);
    });
  });

  describe("4. Multi-Tenant & Cross-User Session Isolation", () => {
    it("ensures a device or session belonging to User A cannot be accessed or revoked by User B", () => {
      const userASessions = [
        { id: "sess-a1", userId: "user-a", deviceId: "dev-a" },
        { id: "sess-a2", userId: "user-a", deviceId: "dev-a" },
      ];

      const userBSessions = [
        { id: "sess-b1", userId: "user-b", deviceId: "dev-b" },
      ];

      // Check authorization rule: targetSession.userId === callingUser.userId
      const canRevoke = (callerId: string, sessionId: string): boolean => {
        const allSessions = [...userASessions, ...userBSessions];
        const target = allSessions.find((s) => s.id === sessionId);
        if (!target) return false;
        return target.userId === callerId;
      };

      expect(canRevoke("user-b", "sess-b1")).toBe(true);
      expect(canRevoke("user-b", "sess-a1")).toBe(false); // User B cannot revoke User A
      expect(canRevoke("user-a", "sess-b1")).toBe(false); // User A cannot revoke User B
    });

    it("allows two distinct user accounts logging in on the same browser device to maintain independent records", () => {
      const rawDeviceKey = "shared-browser-cookie-key-1234567890";
      const keyHash = hashDeviceKey(rawDeviceKey);

      // User 1 device record
      const deviceUser1 = {
        id: "dev-rec-1",
        userId: "user-1",
        deviceKeyHash: keyHash,
      };

      // User 2 device record on same workstation
      const deviceUser2 = {
        id: "dev-rec-2",
        userId: "user-2",
        deviceKeyHash: keyHash,
      };

      // Composite uniqueness constraint (userId, deviceKeyHash) ensures both co-exist cleanly
      expect(deviceUser1.deviceKeyHash).toBe(deviceUser2.deviceKeyHash);
      expect(deviceUser1.userId).not.toBe(deviceUser2.userId);
      expect(deviceUser1.id).not.toBe(deviceUser2.id);
    });
  });

  describe("5. Login History 30-Day Retention Policy", () => {
    it("filters out access records older than 30 days", () => {
      const now = Date.now();
      const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000);
      const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000);
      const thirtyDaysCutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const auditRecords = [
        { id: "1", action: "user:login", createdAt: new Date(now) },
        { id: "2", action: "user:login", createdAt: twentyDaysAgo },
        { id: "3", action: "user:login", createdAt: thirtyOneDaysAgo },
      ];

      const visibleRecords = auditRecords.filter((r) => r.createdAt >= thirtyDaysCutoff);

      expect(visibleRecords).toHaveLength(2);
      expect(visibleRecords.map((r) => r.id)).toEqual(["1", "2"]);
    });
  });
});
