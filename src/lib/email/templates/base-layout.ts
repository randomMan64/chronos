/**
 * Base layout wrapper for all CHRONOS transactional emails.
 * 
 * Strict compliance with email client HTML/CSS standards:
 * - Table-based structure with max-width 560px
 * - Clean white background with subtle border
 * - CHRONOS header branding
 * - Professional monospace and sans-serif typography
 * - Clean action buttons and footer
 */

export interface BaseLayoutOptions {
  title: string;
  preheader?: string;
  contentHtml: string;
  supportEmail?: string;
}

export function renderBaseLayout({
  title,
  preheader,
  contentHtml,
  supportEmail = "support@chronos.local",
}: BaseLayoutOptions): string {
  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table {
      border-collapse: collapse;
    }
    img {
      border: 0;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    a {
      color: #ea580c;
      text-decoration: none;
    }
    .btn {
      display: inline-block;
      background-color: #ea580c;
      color: #ffffff !important;
      padding: 10px 22px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      text-decoration: none;
      text-align: center;
    }
    .btn:hover {
      background-color: #c2410c;
    }
  </style>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ""}
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #f1f5f9;background-color:#090d16;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:16px;font-weight:800;letter-spacing:0.12em;color:#ffffff;text-transform:uppercase;">
                      CHRONOS
                    </span>
                    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;font-weight:600;letter-spacing:0.05em;color:#ea580c;margin-left:8px;padding:2px 6px;border:1px solid rgba(234,88,12,0.3);border-radius:3px;">
                      CORE
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;color:#64748b;">
                      SECURITY DISPATCH
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px 32px 28px 32px;font-size:14px;line-height:1.6;color:#334155;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f1f5f9;background-color:#fafafa;font-size:12px;color:#64748b;line-height:1.5;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;color:#94a3b8;">
                    CHRONOS Database Time Travel & Security Platform © ${currentYear}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:6px;font-size:11px;color:#94a3b8;">
                    This is an automated operational notification. If you did not initiate this request, contact your administrator or reply to this notice.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
