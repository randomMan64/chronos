import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const SECRET_KEY = crypto
  .createHash("sha256")
  .update(process.env.AUTH_SECRET || "chronos_default_secure_vault_key_2026")
  .digest();

export function encryptCredential(plainText: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptCredential(cipherText: string): string {
  try {
    const parts = cipherText.split(":");
    if (parts.length !== 3) return cipherText; // Fallback if plain
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      SECRET_KEY,
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Failed to decrypt database credential:", err);
    return cipherText;
  }
}

