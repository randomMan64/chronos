import { renderBaseLayout, escapeHtml } from "./base-layout";

export interface PasswordResetEmailProps {
  recipientName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export function renderPasswordResetEmail({
  recipientName,
  resetUrl,
  expiresInMinutes = 60,
}: PasswordResetEmailProps): { subject: string; html: string; text: string } {
  const subject = "Reset your CHRONOS password";
  const preheader = "A password reset request was initiated for your CHRONOS account.";

  const contentHtml = `
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
      Reset your password
    </h1>
    <p style="margin:0 0 14px 0;">
      Hello ${escapeHtml(recipientName)},
    </p>
    <p style="margin:0 0 20px 0;">
      We received a request to reset the password for your CHRONOS account. Click the button below to choose a new password:
    </p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(resetUrl)}" class="btn" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:10px 22px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    <div style="background-color:#f8fafc;border-left:3px solid #ea580c;padding:12px 14px;margin:20px 0;font-size:12px;color:#475569;">
      <strong>Security notice:</strong> This link is single-use and will expire in <strong>${expiresInMinutes} minutes</strong>.
      If you did not request a password reset, you can safely disregard this email. Your existing credentials remain secure.
    </div>
    <p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">
      Direct link:
      <br>
      <a href="${escapeHtml(resetUrl)}" style="color:#ea580c;word-break:break-all;font-size:11px;font-family:ui-monospace,monospace;">
        ${escapeHtml(resetUrl)}
      </a>
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader,
    contentHtml,
  });

  const text = `Reset your CHRONOS password\n\nHello ${recipientName},\n\nWe received a request to reset your CHRONOS password. Visit the link below to set a new password:\n\n${resetUrl}\n\nThis single-use link expires in ${expiresInMinutes} minutes.\nIf you did not make this request, you can safely ignore this email.`;

  return { subject, html, text };
}
