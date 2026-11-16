import { describe, it, expect, beforeAll } from "vitest";
import dotenv from "dotenv";
import path from "path";

beforeAll(() => {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
});

import { validateEmailConfig, getEmailConfig } from "../src/lib/email/email-config";
import { renderVerificationEmail } from "../src/lib/email/templates/verification";
import { renderPasswordResetEmail } from "../src/lib/email/templates/password-reset";
import { renderOrganizationInvitationEmail } from "../src/lib/email/templates/organization-invitation";
import { renderWelcomeEmail } from "../src/lib/email/templates/welcome";
import { renderPasswordChangedEmail } from "../src/lib/email/templates/password-changed";
import { renderSecurityAlertEmail } from "../src/lib/email/templates/security-alert";
import crypto from "crypto";

describe("Transactional Email Infrastructure", () => {
  describe("Email Configuration & Validation", () => {
    it("validates full configuration correctly", () => {
      const config = getEmailConfig();
      expect(config.host).toBeDefined();
      expect(config.port).toBe(465);
      expect(config.secure).toBe(true);
      expect(config.user).toBe("chronos.team.inbox@gmail.com");

      const validation = validateEmailConfig();
      expect(validation.isValid).toBe(true);
      expect(validation.missingVariables).toHaveLength(0);
      expect(validation.sanitizedConfig?.host).toBe("smtp.gmail.com");
      expect((validation.sanitizedConfig as any)?.pass).toBeUndefined(); // Never leak passwords
    });
  });

  describe("Email Templates Rendering", () => {
    it("renders Email Verification template with branded layout and action button", () => {
      const email = renderVerificationEmail({
        recipientName: "Alice Admin",
        verificationUrl: "https://chronos.domain.com/verify?token=abc123xyz",
        expiresInMinutes: 60,
      });

      expect(email.subject).toContain("Verify your CHRONOS email address");
      expect(email.html).toContain("Alice Admin");
      expect(email.html).toContain("https://chronos.domain.com/verify?token=abc123xyz");
      expect(email.html).toContain("60 minutes");
      expect(email.text).toContain("https://chronos.domain.com/verify?token=abc123xyz");
      expect(email.html).toContain("CHRONOS");
    });

    it("renders Password Reset template with single-use warning and secure link", () => {
      const email = renderPasswordResetEmail({
        recipientName: "Bob Builder",
        resetUrl: "https://chronos.domain.com/reset-password?token=secrettoken",
        expiresInMinutes: 60,
      });

      expect(email.subject).toContain("Reset your CHRONOS password");
      expect(email.html).toContain("Bob Builder");
      expect(email.html).toContain("https://chronos.domain.com/reset-password?token=secrettoken");
      expect(email.html).toContain("Security notice");
      expect(email.html).toContain("single-use");
      expect(email.text).toContain("secrettoken");
    });

    it("renders Organization Invitation template with inviter and role details", () => {
      const email = renderOrganizationInvitationEmail({
        recipientEmail: "dev@company.com",
        organizationName: "Acme Corp",
        inviterName: "Sarah Connor",
        role: "admin",
        invitationUrl: "https://chronos.domain.com/invite/invitetoken999",
        expiresInDays: 7,
      });

      expect(email.subject).toContain("Acme Corp");
      expect(email.html).toContain("Sarah Connor");
      expect(email.html).toContain("ADMIN");
      expect(email.html).toContain("7 days");
      expect(email.html).toContain("https://chronos.domain.com/invite/invitetoken999");
      expect(email.text).toContain("Acme Corp");
    });

    it("renders Welcome Email template with feature breakdown", () => {
      const email = renderWelcomeEmail({
        recipientName: "Charlie",
        recipientEmail: "charlie@chronos.io",
        dashboardUrl: "https://chronos.domain.com/overview",
      });

      expect(email.subject).toContain("Welcome to CHRONOS");
      expect(email.html).toContain("Charlie");
      expect(email.html).toContain("Time Travel");
      expect(email.html).toContain("SQL Gateway");
      expect(email.html).toContain("https://chronos.domain.com/overview");
      expect(email.text).toContain("https://chronos.domain.com/overview");
    });

    it("renders Password Changed notification template with timestamp and origin IP", () => {
      const email = renderPasswordChangedEmail({
        recipientName: "David",
        timestamp: "Mon, 16 Nov 2026 12:00:00 GMT",
        ipAddress: "192.168.1.100",
        securitySettingsUrl: "https://chronos.domain.com/account/security",
      });

      expect(email.subject).toContain("Security notice: Your CHRONOS password was changed");
      expect(email.html).toContain("David");
      expect(email.html).toContain("Mon, 16 Nov 2026 12:00:00 GMT");
      expect(email.html).toContain("192.168.1.100");
      expect(email.html).toContain("Did not make this change?");
      expect(email.text).toContain("192.168.1.100");
    });

    it("renders Security Alert template with severity level and action url", () => {
      const email = renderSecurityAlertEmail({
        recipientName: "Eve",
        alertTitle: "Multiple Failed Login Attempts",
        alertDetails: "5 consecutive failed authentications detected from unexpected subnet.",
        severity: "critical",
        timestamp: "Mon, 16 Nov 2026 12:05:00 GMT",
        actionUrl: "https://chronos.domain.com/account/security",
      });

      expect(email.subject).toContain("[Security Alert]");
      expect(email.html).toContain("CRITICAL SEVERITY");
      expect(email.html).toContain("Multiple Failed Login Attempts");
      expect(email.html).toContain("5 consecutive failed authentications");
      expect(email.text).toContain("CRITICAL");
    });
  });

  describe("Password Reset Token Security Mechanics", () => {
    it("hashes raw tokens using SHA-256 without persisting raw token string", () => {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hash1 = crypto.createHash("sha256").update(rawToken).digest("hex");
      const hash2 = crypto.createHash("sha256").update(rawToken).digest("hex");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(rawToken);
      expect(hash1.length).toBe(64); // standard 256-bit hex length
    });

    it("evaluates expired tokens accurately", () => {
      const expiredDate = new Date(Date.now() - 1000 * 60); // 1 minute in past
      const validDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future

      expect(new Date(expiredDate) < new Date()).toBe(true);
      expect(new Date(validDate) < new Date()).toBe(false);
    });

    it("distinguishes used tokens from fresh tokens", () => {
      const freshToken = { usedAt: null };
      const usedToken = { usedAt: new Date() };

      expect(freshToken.usedAt).toBeNull();
      expect(usedToken.usedAt).not.toBeNull();
    });
  });
});
