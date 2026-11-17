// Disposable and temporary email domain detection
// Maintains an updateable blocklist of known throwaway / disposable domains.
const DISPOSABLE_DOMAINS = new Set([
  // Popular temporary/throwaway email providers
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "mailinator.com",
  "mailinator2.com",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "dispostable.com",
  "trashmail.com",
  "trashmail.net",
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
  "trashmail.org",
  "tempail.com",
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
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(normalized);
}

/**
 * Checks whether the domain belongs to a known temporary/disposable email provider.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;

  const domain = parts[1].toLowerCase().trim();
  return DISPOSABLE_DOMAINS.has(domain);
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
