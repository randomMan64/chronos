import { renderBaseLayout, escapeHtml } from "./base-layout";

export interface OrganizationInvitationEmailProps {
  recipientEmail: string;
  organizationName: string;
  inviterName: string;
  role: string;
  invitationUrl: string;
  expiresInDays?: number;
}

export function renderOrganizationInvitationEmail({
  recipientEmail,
  organizationName,
  inviterName,
  role,
  invitationUrl,
  expiresInDays = 7,
}: OrganizationInvitationEmailProps): { subject: string; html: string; text: string } {
  const subject = `Invitation to join ${organizationName} on CHRONOS`;
  const preheader = `${inviterName} has invited you to collaborate on ${organizationName}.`;

  const contentHtml = `
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
      Organization Invitation
    </h1>
    <p style="margin:0 0 14px 0;">
      Hello,
    </p>
    <p style="margin:0 0 16px 0;">
      <strong>${escapeHtml(inviterName)}</strong> has invited you to join the organization <strong>${escapeHtml(organizationName)}</strong> on CHRONOS as a <strong>${escapeHtml(role.toUpperCase())}</strong>.
    </p>
    <div style="background-color:#f1f5f9;border-radius:6px;padding:14px 18px;margin:20px 0;font-size:13px;color:#334155;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="color:#64748b;font-size:12px;padding-bottom:4px;">Organization:</td>
          <td style="font-weight:600;padding-bottom:4px;color:#0f172a;">${escapeHtml(organizationName)}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:12px;padding-bottom:4px;">Invited By:</td>
          <td style="font-weight:500;padding-bottom:4px;color:#0f172a;">${escapeHtml(inviterName)}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:12px;">Assigned Role:</td>
          <td style="font-weight:600;color:#ea580c;font-family:ui-monospace,monospace;font-size:12px;">${escapeHtml(role.toUpperCase())}</td>
        </tr>
      </table>
    </div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(invitationUrl)}" class="btn" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:10px 22px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">
            Accept Invitation
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 8px 0;font-size:12px;color:#64748b;">
      This invitation was issued to <strong>${escapeHtml(recipientEmail)}</strong> and will expire in <strong>${expiresInDays} days</strong>.
    </p>
    <p style="margin:0 0 16px 0;font-size:12px;color:#64748b;">
      Direct link:
      <br>
      <a href="${escapeHtml(invitationUrl)}" style="color:#ea580c;word-break:break-all;font-size:11px;font-family:ui-monospace,monospace;">
        ${escapeHtml(invitationUrl)}
      </a>
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader,
    contentHtml,
  });

  const text = `Invitation to join ${organizationName} on CHRONOS\n\n${inviterName} has invited you to join ${organizationName} as a ${role.toUpperCase()}.\n\nAccept your invitation by visiting:\n${invitationUrl}\n\nThis invitation was sent to ${recipientEmail} and expires in ${expiresInDays} days.`;

  return { subject, html, text };
}
