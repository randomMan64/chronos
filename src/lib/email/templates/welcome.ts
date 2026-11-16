import { renderBaseLayout, escapeHtml } from "./base-layout";

export interface WelcomeEmailProps {
  recipientName: string;
  recipientEmail: string;
  dashboardUrl: string;
}

export function renderWelcomeEmail({
  recipientName,
  recipientEmail,
  dashboardUrl,
}: WelcomeEmailProps): { subject: string; html: string; text: string } {
  const subject = "Welcome to CHRONOS Database Platform";
  const preheader = "Your CHRONOS account is ready. Start querying and time-traveling your databases.";

  const contentHtml = `
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
      Welcome to CHRONOS
    </h1>
    <p style="margin:0 0 14px 0;">
      Hello ${escapeHtml(recipientName)},
    </p>
    <p style="margin:0 0 16px 0;">
      Welcome to <strong>CHRONOS</strong> — the developer-first PostgreSQL temporal data platform. Your account <strong>${escapeHtml(recipientEmail)}</strong> is active and ready to use.
    </p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:20px 0;font-size:12px;color:#334155;">
      <div style="font-weight:600;margin-bottom:8px;color:#0f172a;font-size:13px;">What you can do with CHRONOS:</div>
      <ul style="margin:0;padding-left:18px;line-height:1.8;">
        <li><strong>Time Travel:</strong> Query any historical database state as of any point in time.</li>
        <li><strong>Interactive SQL Gateway:</strong> Execute queries with instant execution plans & metrics.</li>
        <li><strong>Temporal Audit Center:</strong> Track row modifications, transactions, and security logs.</li>
        <li><strong>Instant Restore:</strong> Recover tables or individual rows back to previous points in time.</li>
      </ul>
    </div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(dashboardUrl)}" class="btn" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:10px 22px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">
            Launch CHRONOS Studio
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0 0;font-size:12px;color:#64748b;">
      Direct link:
      <br>
      <a href="${escapeHtml(dashboardUrl)}" style="color:#ea580c;word-break:break-all;font-size:11px;font-family:ui-monospace,monospace;">
        ${escapeHtml(dashboardUrl)}
      </a>
    </p>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader,
    contentHtml,
  });

  const text = `Welcome to CHRONOS\n\nHello ${recipientName},\n\nYour CHRONOS account (${recipientEmail}) is ready.\n\nOpen CHRONOS Studio: ${dashboardUrl}\n\nStart using Time Travel, SQL Gateway, and Temporal Audit features today.`;

  return { subject, html, text };
}
