/**
 * CHRONOS Transactional Email Configuration
 * 
 * Strict server-side configuration for Gmail SMTP and transactional messaging.
 * Never expose these variables or objects to client-side bundles.
 */

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  appUrl: string;
}

export interface EmailConfigValidationResult {
  isValid: boolean;
  missingVariables: string[];
  sanitizedConfig?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    appUrl: string;
  };
}

export function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.EMAIL_FROM || (user ? `CHRONOS <${user}>` : "CHRONOS <no-reply@chronos.local>");
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    appUrl,
  };
}

export function validateEmailConfig(): EmailConfigValidationResult {
  const config = getEmailConfig();
  const missing: string[] = [];

  if (!config.host) missing.push("SMTP_HOST");
  if (!config.port || isNaN(config.port)) missing.push("SMTP_PORT");
  if (!config.user) missing.push("SMTP_USER");
  if (!config.pass) missing.push("SMTP_PASS");

  if (missing.length > 0) {
    return {
      isValid: false,
      missingVariables: missing,
    };
  }

  return {
    isValid: true,
    missingVariables: [],
    sanitizedConfig: {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      from: config.from,
      appUrl: config.appUrl,
    },
  };
}

export function isEmailConfigured(): boolean {
  return validateEmailConfig().isValid;
}
