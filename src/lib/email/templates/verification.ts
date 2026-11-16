import { renderBaseLayout, escapeHtml } from "./base-layout";

export interface VerificationEmailProps {
  recipientName: string;
  verificationUrl: string;
  expiresInMinutes?: number;
}

export function renderVerificationEmail({
  recipientName,
  verificationUrl,
  expiresInMinutes = 60,
}: VerificationEmailProps): { subject: string; html: string; text: string } {
  const subject = "Verify your CHRONOS email address";
  const preheader = "Please confirm your email address to complete your registration.";

  const contentHtml = `
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
      Verify your email address
    </h1>
    <p style="margin:0 0 14px 0;">
      Hello ${escapeHtml(recipientName)},
    </p>
    <p style="margin:0 0 20px 0;">
      Thank you for setting up your CHRONOS account. Please verify your email address by clicking the confirmation button below:
    </p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(verificationUrl)}" class="btn" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:10px 22px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">
            Verify Email Address
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 8px 0;font-size:12px;color:#64748b;">
      This verification link will expire in <strong>${expiresInMinutes} minutes</strong>.
    </p>
    <p style="margin:0 0 16px 0;font-size:12px;color:#64748b;">
      If the button above does not work, copy and paste this link into your browser:
      <br>
      <a href="${escapeHtml(verificationUrl)}" style="color:#ea580c;word-break:break-all;font-size:11px;font-family:ui-monospace,monospace;">
        ${escapeHtml(verificationUrl)}
      </a>
    </p>
    <p style="margin:20px 0 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:14px;">
      If you did not create a CHRONOS account, no further action is required and you can safely ignore this email.
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader,
    contentHtml,
  });

  const text = `Verify your CHRONOS email address\n\nHello ${recipientName},\n\nPlease verify your email address by visiting this link:\n${verificationUrl}\n\nThis link will expire in ${expiresInMinutes} minutes.\n\nIf you did not request this, you can safely ignore this email.`;

  return { subject, html, text };
}
