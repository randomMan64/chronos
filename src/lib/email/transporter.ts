import nodemailer, { type Transporter } from "nodemailer";
import { getEmailConfig, validateEmailConfig } from "./email-config";

let cachedTransporter: Transporter | null = null;

/**
 * Creates or retrieves the singleton reusable Nodemailer transporter.
 */
export function getEmailTransporter(): Transporter {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const config = getEmailConfig();

  // Create transporter configured for Gmail SSL on port 465
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true for port 465
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Connection pool settings
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5,
  });

  return cachedTransporter;
}

export interface SmtpVerifyResult {
  ok: boolean;
  message: string;
  host: string;
  port: number;
  user: string;
  error?: string;
}

/**
 * Verifies SMTP connectivity without exposing passwords or sensitive details in errors.
 */
export async function verifySMTPConnection(): Promise<SmtpVerifyResult> {
  const validation = validateEmailConfig();
  if (!validation.isValid) {
    return {
      ok: false,
      message: `Incomplete SMTP configuration. Missing: ${validation.missingVariables.join(", ")}`,
      host: "",
      port: 0,
      user: "",
    };
  }

  const { host, port, user } = validation.sanitizedConfig!;

  try {
    const transporter = getEmailTransporter();
    await transporter.verify();
    return {
      ok: true,
      message: "SMTP connection established successfully.",
      host,
      port,
      user,
    };
  } catch (err: unknown) {
    const rawError = err instanceof Error ? err.message : String(err);
    // Sanitize any accidental password leaks in error strings
    const sanitizedError = rawError.replace(/pass(word)?\s*[:=]\s*\S+/gi, "password: [REDACTED]");
    return {
      ok: false,
      message: "Failed to connect to SMTP server.",
      host,
      port,
      user,
      error: sanitizedError,
    };
  }
}
