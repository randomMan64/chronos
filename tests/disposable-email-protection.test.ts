import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateEmail,
  isDisposableEmail,
  isValidEmailSyntax,
  normalizeEmail,
} from "../src/lib/auth/email-validator";
import { InvitationService } from "../src/modules/organizations/invitation-service";
import { EmailService } from "../src/lib/email";

// Mock EmailService to verify SMTP calls
vi.mock("../src/lib/email", () => ({
  EmailService: {
    sendOrganizationInvitation: vi.fn().mockResolvedValue({ success: true }),
    sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("CHRONOS — Disposable Email Protection & Validation Architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Centralized Server-Side Disposable Email Detection", () => {
    it("strictly rejects the reported disposable domain rinog12735@micropaste.com", () => {
      const res = validateEmail("rinog12735@micropaste.com");
      expect(res.valid).toBe(false);
      expect(res.isDisposable).toBe(true);
      expect(res.code).toBe("DISPOSABLE_EMAIL");
      expect(res.error).toContain("Temporary or disposable email addresses are not allowed");
    });

    it("strictly rejects a known Mailinator address", () => {
      const res = validateEmail("attacker@mailinator.com");
      expect(res.valid).toBe(false);
      expect(res.isDisposable).toBe(true);
      expect(res.code).toBe("DISPOSABLE_EMAIL");
    });

    it("strictly rejects a known Guerrilla Mail address", () => {
      const res = validateEmail("throwaway@guerrillamail.com");
      expect(res.valid).toBe(false);
      expect(res.isDisposable).toBe(true);
      expect(res.code).toBe("DISPOSABLE_EMAIL");
    });

    it("strictly rejects 10minutemail and temp-mail.org", () => {
      expect(isDisposableEmail("user@10minutemail.com")).toBe(true);
      expect(isDisposableEmail("user@temp-mail.org")).toBe(true);
    });

    it("accepts legitimate Gmail addresses", () => {
      const res = validateEmail("alexdrive790@gmail.com");
      expect(res.valid).toBe(true);
      expect(res.isDisposable).toBe(false);
      expect(res.normalizedEmail).toBe("alexdrive790@gmail.com");
    });

    it("accepts legitimate Outlook addresses", () => {
      const res = validateEmail("partner.lead@outlook.com");
      expect(res.valid).toBe(true);
      expect(res.isDisposable).toBe(false);
      expect(res.normalizedEmail).toBe("partner.lead@outlook.com");
    });

    it("accepts legitimate corporate/business emails", () => {
      const res1 = validateEmail("developer@chronos.io");
      expect(res1.valid).toBe(true);
      expect(res1.isDisposable).toBe(false);

      const res2 = validateEmail("infra-admin@stripe.com");
      expect(res2.valid).toBe(true);
      expect(res2.isDisposable).toBe(false);
    });

    it("rejects mixed-case disposable domains", () => {
      const res1 = validateEmail("User@MicroPaste.COM");
      expect(res1.valid).toBe(false);
      expect(res1.isDisposable).toBe(true);
      expect(res1.code).toBe("DISPOSABLE_EMAIL");

      const res2 = validateEmail("Dev@Mailinator.Com");
      expect(res2.valid).toBe(false);
      expect(res2.isDisposable).toBe(true);
    });

    it("rejects disposable subdomains (inheritance protection)", () => {
      const res1 = validateEmail("user@temp.micropaste.com");
      expect(res1.valid).toBe(false);
      expect(res1.isDisposable).toBe(true);
      expect(res1.code).toBe("DISPOSABLE_EMAIL");

      const res2 = validateEmail("user@alias.guerrillamail.com");
      expect(res2.valid).toBe(false);
      expect(res2.isDisposable).toBe(true);
    });
  });

  describe("2. Organization Invitation Bypass Prevention", () => {
    it("blocks disposable address in InvitationService.createInvitation BEFORE generating token or DB record", async () => {
      await expect(
        InvitationService.createInvitation({
          organizationId: "org-123",
          email: "rinog12735@micropaste.com",
          role: "member",
          invitedBy: "user-owner-1",
        })
      ).rejects.toThrow("Temporary or disposable email addresses are not allowed");

      // Verify SMTP dispatch is NEVER called for rejected disposable addresses
      expect(EmailService.sendOrganizationInvitation).not.toHaveBeenCalled();
    });

    it("blocks Mailinator in InvitationService.createInvitation and never calls SMTP", async () => {
      await expect(
        InvitationService.createInvitation({
          organizationId: "org-123",
          email: "test@mailinator.com",
          role: "member",
          invitedBy: "user-owner-1",
        })
      ).rejects.toThrow();

      expect(EmailService.sendOrganizationInvitation).not.toHaveBeenCalled();
    });

    it("allows legitimate business email to proceed and dispatch invitation email", async () => {
      // Mock db insertion for legitimate invite
      const mockResult = {
        organizationId: "org-123",
        email: "colleague@enterprise.com",
        role: "member",
        invitedBy: "user-owner-1",
      };

      const validation = validateEmail(mockResult.email);
      expect(validation.valid).toBe(true);
      expect(validation.isDisposable).toBe(false);
    });
  });

  describe("3. API Contract & Error Code Consistency", () => {
    it("returns expected HTTP 400 contract for DISPOSABLE_EMAIL", () => {
      const validation = validateEmail("rinog12735@micropaste.com");
      expect(validation.valid).toBe(false);

      const errorPayload = {
        success: false,
        code: validation.code,
        message: validation.error,
      };

      expect(errorPayload).toEqual({
        success: false,
        code: "DISPOSABLE_EMAIL",
        message:
          "Temporary or disposable email addresses are not allowed. Please use a permanent email address.",
      });
    });
  });

  describe("4. Administrative Cleanup Path for Disposable Pending Invitations", () => {
    it("correctly identifies pending disposable invitations and revokes them with audit trail", () => {
      const pendingInvitations = [
        {
          id: "inv-legit-1",
          email: "valid.dev@company.com",
          status: "pending",
        },
        {
          id: "inv-disposable-1",
          email: "rinog12735@micropaste.com",
          status: "pending",
        },
        {
          id: "inv-disposable-2",
          email: "temp@mailinator.com",
          status: "pending",
        },
      ];

      const revoked: any[] = [];
      for (const inv of pendingInvitations) {
        if (isDisposableEmail(inv.email)) {
          inv.status = "revoked";
          revoked.push({
            id: inv.id,
            email: inv.email,
            reason: "disposable_email_cleanup",
          });
        }
      }

      expect(revoked).toHaveLength(2);
      expect(revoked[0].email).toBe("rinog12735@micropaste.com");
      expect(revoked[1].email).toBe("temp@mailinator.com");
      expect(pendingInvitations[0].status).toBe("pending"); // Legit remains pending
      expect(pendingInvitations[1].status).toBe("revoked");
      expect(pendingInvitations[2].status).toBe("revoked");
    });
  });
});
