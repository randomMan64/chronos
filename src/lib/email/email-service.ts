import { getEmailTransporter } from "./transporter";
import { getEmailConfig, isEmailConfigured } from "./email-config";
import {
  renderVerificationEmail,
  VerificationEmailProps,
} from "./templates/verification";
import {
  renderPasswordResetEmail,
  PasswordResetEmailProps,
} from "./templates/password-reset";
import {
  renderOrganizationInvitationEmail,
  OrganizationInvitationEmailProps,
} from "./templates/organization-invitation";
import {
  renderWelcomeEmail,
  WelcomeEmailProps,
} from "./templates/welcome";
import {
  renderPasswordChangedEmail,
  PasswordChangedEmailProps,
} from "./templates/password-changed";
import {
  renderSecurityAlertEmail,
  SecurityAlertEmailProps,
} from "./templates/security-alert";

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  recipient: string;
}

interface RawSendOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends a transactional email using Nodemailer with automatic 1-step retry for transient network errors.
 */
async function sendWithRetry(
  options: RawSendOptions,
  maxAttempts = 2
): Promise<SendMailResult> {
  const config = getEmailConfig();

  if (!isEmailConfigured()) {
    console.error("[EmailService] SMTP credentials are not fully configured.");
    return {
      success: false,
      recipient: options.to,
      error: "SMTP service is not configured on this environment.",
    };
  }

  const transporter = getEmailTransporter();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: config.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      // Verify that SMTP actually accepted at least one recipient
      if (
        info.rejected &&
        Array.isArray(info.rejected) &&
        info.rejected.length > 0 &&
        (!info.accepted || info.accepted.length === 0)
      ) {
        const rejectionMsg = `SMTP rejected delivery to ${info.rejected.join(", ")}`;
        console.error(`[EmailService] Permanent rejection on attempt ${attempt}:`, rejectionMsg);
        return {
          success: false,
          recipient: options.to,
          error: rejectionMsg,
        };
      }

      console.log(`[EmailService] Delivered email to ${options.to} (MessageId: ${info.messageId})`);
      return {
        success: true,
        messageId: info.messageId,
        recipient: options.to,
      };
    } catch (err: unknown) {
      lastError = err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[EmailService] Attempt ${attempt} failed to send email to ${options.to}:`, errorMsg);

      // Check if permanent auth failure or bad address (do not retry)
      if (
        errorMsg.includes("535") || // Auth failure
        errorMsg.includes("550") || // User not found
        errorMsg.includes("Invalid recipient") ||
        errorMsg.includes("Bad recipient address syntax")
      ) {
        break;
      }

      if (attempt < maxAttempts) {
        // Brief pause before retry
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  const finalErrMsg = lastError instanceof Error ? lastError.message : "Unknown email delivery failure";
  return {
    success: false,
    recipient: options.to,
    error: finalErrMsg,
  };
}

export class EmailService {
  /**
   * Send account email verification link.
   */
  static async sendVerificationEmail(
    to: string,
    props: Omit<VerificationEmailProps, "verificationUrl"> & { verificationToken: string }
  ): Promise<SendMailResult> {
    const config = getEmailConfig();
    const verificationUrl = `${config.appUrl}/verify-email?token=${encodeURIComponent(props.verificationToken)}`;
    const template = renderVerificationEmail({
      recipientName: props.recipientName,
      verificationUrl,
      expiresInMinutes: props.expiresInMinutes,
    });

    return sendWithRetry({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send password reset email with secure token.
   */
  static async sendPasswordResetEmail(
    to: string,
    props: {
      recipientName: string;
      resetToken: string;
      expiresInMinutes?: number;
    }
  ): Promise<SendMailResult> {
    const config = getEmailConfig();
    const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(props.resetToken)}`;
    const template = renderPasswordResetEmail({
      recipientName: props.recipientName,
      resetUrl,
      expiresInMinutes: props.expiresInMinutes ?? 60,
    });

    return sendWithRetry({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send organization member invitation email.
   */
  static async sendOrganizationInvitation(
    to: string,
    props: {
      organizationName: string;
      inviterName: string;
      role: string;
      invitationToken: string;
      expiresInDays?: number;
    }
  ): Promise<SendMailResult> {
    const config = getEmailConfig();
    const invitationUrl = `${config.appUrl}/invite/${encodeURIComponent(props.invitationToken)}`;
    const template = renderOrganizationInvitationEmail({
      recipientEmail: to,
      organizationName: props.organizationName,
      inviterName: props.inviterName,
      role: props.role,
      invitationUrl,
      expiresInDays: props.expiresInDays ?? 7,
    });

    return sendWithRetry({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send welcome email on new user registration.
   */
  static async sendWelcomeEmail(
    to: string,
    props: {
      recipientName: string;
    }
  ): Promise<SendMailResult> {
    const config = getEmailConfig();
    const dashboardUrl = `${config.appUrl}/overview`;
    const template = renderWelcomeEmail({
      recipientName: props.recipientName,
      recipientEmail: to,
      dashboardUrl,
    });

    return sendWithRetry({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send security notification when user password is changed.
   */
  static async sendPasswordChangedNotification(
    to: string,
    props: {
      recipientName: string;
      ipAddress?: string;
    }
  ): Promise<SendMailResult> {
    const config = getEmailConfig();
    const securitySettingsUrl = `${config.appUrl}/account/security`;
    const timestamp = new Date().toUTCString();
    const template = renderPasswordChangedEmail({
      recipientName: props.recipientName,
      timestamp,
      ipAddress: props.ipAddress,
      securitySettingsUrl,
    });

    return sendWithRetry({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send security event alert (e.g. suspicious activity or access changes).
   */
  static async sendSecurityAlert(
    to: string,
    props: {
      recipientName: string;
      alertTitle: string;
      alertDetails: string;
      severity?: "low" | "medium" | "high" | "critical";
    }
  ): Promise<SendMailResult> {
    const config = getEmailConfig();
    const actionUrl = `${config.appUrl}/account/security`;
    const timestamp = new Date().toUTCString();
    const template = renderSecurityAlertEmail({
      recipientName: props.recipientName,
      alertTitle: props.alertTitle,
      alertDetails: props.alertDetails,
      severity: props.severity,
      timestamp,
      actionUrl,
    });

    return sendWithRetry({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }
}
