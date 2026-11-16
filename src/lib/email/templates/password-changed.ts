import { renderBaseLayout, escapeHtml } from "./base-layout";

export interface PasswordChangedEmailProps {
  recipientName: string;
  timestamp: string;
  ipAddress?: string;
  securitySettingsUrl: string;
}

export function renderPasswordChangedEmail({
  recipientName,
  timestamp,
  ipAddress,
  securitySettingsUrl,
}: PasswordChangedEmailProps): { subject: string; html: string; text: string } {
  const subject = "Security notice: Your CHRONOS password was changed";
  const preheader = "Your account password was recently updated. Please review if you did not initiate this change.";

  const contentHtml = `
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
      Your password has been changed
    </h1>
    <p style="margin:0 0 14px 0;">
      Hello ${escapeHtml(recipientName)},
    </p>
    <p style="margin:0 0 16px 0;">
      The password for your CHRONOS account was successfully updated.
    </p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;margin:20px 0;font-size:12px;color:#334155;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="color:#64748b;font-size:12px;padding-bottom:4px;">Event:</td>
          <td style="font-weight:600;padding-bottom:4px;color:#0f172a;">Password Changed</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:12px;padding-bottom:4px;">Time:</td>
          <td style="font-mono;font-size:11px;padding-bottom:4px;color:#0f172a;">${escapeHtml(timestamp)}</td>
        </tr>
        ${ipAddress ? `
        <tr>
          <td style="color:#64748b;font-size:12px;">Origin IP:</td>
          <td style="font-mono;font-size:11px;color:#0f172a;">${escapeHtml(ipAddress)}</td>
        </tr>
        ` : ""}
      </table>
    </div>
    <div style="background-color:#fff7ed;border-left:3px solid #ea580c;padding:12px 14px;margin:20px 0;font-size:12px;color:#9a3412;">
      <strong>Did not make this change?</strong>
      <br>
      If you did not authorize this password update, someone else may have gained access to your account.
      Please secure your account immediately or notify your organization administrator.
    </div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(securitySettingsUrl)}" class="btn" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:10px 22px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">
            Review Security Settings
          </a>
        </td>
      </tr>
    </table>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader,
    contentHtml,
  });

  const text = `Security notice: Your CHRONOS password was changed\n\nHello ${recipientName},\n\nThe password for your CHRONOS account was successfully changed at ${timestamp}${ipAddress ? ` from IP ${ipAddress}` : ""}.\n\nIf you did not make this change, please immediately review your account security at:\n${securitySettingsUrl}`;

  return { subject, html, text };
}
