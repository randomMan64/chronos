import { renderBaseLayout, escapeHtml } from "./base-layout";

export interface SecurityAlertEmailProps {
  recipientName: string;
  alertTitle: string;
  alertDetails: string;
  severity?: "low" | "medium" | "high" | "critical";
  timestamp: string;
  actionUrl: string;
}

export function renderSecurityAlertEmail({
  recipientName,
  alertTitle,
  alertDetails,
  severity = "medium",
  timestamp,
  actionUrl,
}: SecurityAlertEmailProps): { subject: string; html: string; text: string } {
  const subject = `[Security Alert] ${alertTitle} - CHRONOS`;
  const preheader = `A security event was logged for your account: ${alertTitle}`;

  const severityColors = {
    low: { bg: "#f0fdf4", text: "#166534", border: "#22c55e" },
    medium: { bg: "#fefce8", text: "#854d0e", border: "#eab308" },
    high: { bg: "#fff7ed", text: "#9a3412", border: "#ea580c" },
    critical: { bg: "#fef2f2", text: "#991b1b", border: "#ef4444" },
  };

  const style = severityColors[severity] || severityColors.medium;

  const contentHtml = `
    <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">
      Security Notification
    </h1>
    <p style="margin:0 0 14px 0;">
      Hello ${escapeHtml(recipientName)},
    </p>
    <div style="background-color:${style.bg};border-left:3px solid ${style.border};padding:14px;margin:20px 0;border-radius:4px;">
      <div style="display:flex;align-items:center;margin-bottom:6px;">
        <span style="font-family:ui-monospace,monospace;font-size:10px;font-weight:700;text-transform:uppercase;color:${style.text};background-color:rgba(0,0,0,0.06);padding:2px 6px;border-radius:3px;">
          ${severity.toUpperCase()} SEVERITY
        </span>
      </div>
      <div style="font-size:14px;font-weight:600;color:#0f172a;margin-bottom:4px;">
        ${escapeHtml(alertTitle)}
      </div>
      <div style="font-size:12px;color:#475569;line-height:1.5;">
        ${escapeHtml(alertDetails)}
      </div>
    </div>
    <div style="font-size:11px;color:#64748b;margin-bottom:20px;font-family:ui-monospace,monospace;">
      Logged at: ${escapeHtml(timestamp)}
    </div>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td>
          <a href="${escapeHtml(actionUrl)}" class="btn" style="display:inline-block;background-color:#ea580c;color:#ffffff;padding:10px 22px;font-size:13px;font-weight:600;border-radius:6px;text-decoration:none;">
            View Audit Log &amp; Security
          </a>
        </td>
      </tr>
    </table>
  `;

  const html = renderBaseLayout({
    title: subject,
    preheader,
    contentHtml,
    badgeText: "SECURITY ALERT",
  });

  const text = `[Security Alert] ${alertTitle} - CHRONOS\n\nHello ${recipientName},\n\nA security event was detected: ${alertTitle}\nSeverity: ${severity.toUpperCase()}\nTime: ${timestamp}\nDetails: ${alertDetails}\n\nReview security details: ${actionUrl}`;

  return { subject, html, text };
}
