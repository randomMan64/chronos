import { isDisposableDomain } from "detect-disposable-email";

// Controlled allowlist for major legitimate email providers
// Ensures legitimate corporate and personal emails are never falsely classified as disposable
const ALLOWED_MAJOR_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "aol.com",
  "fastmail.com",
  "chronos.internal",
  "chronos.io",
]);

// Curated blocklist of confirmed disposable/temporary email domains
// Supplements detect-disposable-email dataset to guarantee immediate protection
const CURATED_DISPOSABLE_DOMAINS = new Set([
  "micropaste.com",
  "mailinator.com",
  "mailinator2.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "temp-mail.org",
  "tempmail.com",
  "temp-mail.io",
  "tempail.com",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "dispostable.com",
  "trashmail.com",
  "trashmail.net",
  "trashmail.org",
  "getairmail.com",
  "fakemailgenerator.com",
  "mohmal.com",
  "inboxkitten.com",
  "burnermail.io",
  "mytemp.email",
  "crazymailing.com",
  "generator.email",
  "tempmailo.com",
  "emailondeck.com",
  "dropmail.me",
  "minuteinbox.com",
  "nada.ltd",
  "getnada.com",
  "maildrop.cc",
  "fakemail.net",
  "throwawayemailaddress.com",
  "disposablemail.com",
]);

/**
 * Normalizes an email address:
 * - Trims whitespace
 * - Converts to lowercase
 */
export function normalizeEmail(email: string): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

/**
 * Validates RFC 5322 compliant email syntax.
 */
export function isValidEmailSyntax(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = normalizeEmail(email);
  if (normalized.length > 254) return false;
  if (normalized.includes("..")) return false;

  // Standard strict regex for email address
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(normalized);
}

/**
 * Extracts a domain and all its parent suffixes to reliably detect disposable subdomains.
 * e.g. "sub.micropaste.com" -> ["sub.micropaste.com", "micropaste.com"]
 */
export function getDomainSuffixes(domain: string): string[] {
  const parts = domain.toLowerCase().trim().split(".");
  const suffixes: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    suffixes.push(parts.slice(i).join("."));
  }
  return suffixes;
}

/**
 * Checks whether an email address or its domain belongs to a known temporary/disposable email provider.
 * Uses both detect-disposable-email dataset and curated blocklist with subdomain inheritance.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;

  const domain = parts[1].toLowerCase().trim();
  if (!domain) return false;

  // 1. Never block verified major providers in allowlist
  if (ALLOWED_MAJOR_DOMAINS.has(domain)) {
    return false;
  }

  // 2. Check domain and all parent subdomains against curated list and package
  const suffixes = getDomainSuffixes(domain);

  for (const suffix of suffixes) {
    // Explicit curated blocklist
    if (CURATED_DISPOSABLE_DOMAINS.has(suffix)) {
      return true;
    }

    // Maintainer dataset from detect-disposable-email
    try {
      if (isDisposableDomain(suffix)) {
        return true;
      }
    } catch {
      // In case of unexpected runtime error from external package, continue safely
    }
  }

  return false;
}

export interface EmailValidationResult {
  valid: boolean;
  normalizedEmail: string;
  domain: string;
  isDisposable: boolean;
  error?: string;
  code?: "INVALID_EMAIL" | "DISPOSABLE_EMAIL";
}

/**
 * Shared centralized server-side email validator.
 * Validates syntax, normalizes casing/whitespace, and rejects disposable/temporary domains.
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || typeof email !== "string" || !email.trim()) {
    return {
      valid: false,
      normalizedEmail: "",
      domain: "",
      isDisposable: false,
      error: "A valid email address is required.",
      code: "INVALID_EMAIL",
    };
  }

  const normalized = normalizeEmail(email);

  if (!isValidEmailSyntax(normalized)) {
    return {
      valid: false,
      normalizedEmail: normalized,
      domain: "",
      isDisposable: false,
      error: "Invalid email address format.",
      code: "INVALID_EMAIL",
    };
  }

  const parts = normalized.split("@");
  const domain = parts[1] || "";

  if (isDisposableEmail(normalized)) {
    return {
      valid: false,
      normalizedEmail: normalized,
      domain,
      isDisposable: true,
      error:
        "Temporary or disposable email addresses are not allowed. Please use a permanent email address.",
      code: "DISPOSABLE_EMAIL",
    };
  }

  return {
    valid: true,
    normalizedEmail: normalized,
    domain,
    isDisposable: false,
  };
}

/**
 * Masks an email for safe display on public/pending screens without leaking the full address:
 * e.g. "alexdrive790@gmail.com" -> "a***0@gmail.com"
 * e.g. "bob@company.com" -> "b*b@company.com"
 */
export function maskEmail(email: string): string {
  if (!email) return "";
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) return normalized;

  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`;
  }

  if (localPart.length === 3) {
    return `${localPart[0]}*${localPart[2]}@${domain}`;
  }

  const firstChar = localPart[0];
  const lastChar = localPart[localPart.length - 1];
  return `${firstChar}***${lastChar}@${domain}`;
}
