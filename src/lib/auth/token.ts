import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "chronos_session";
export const SESSION_EXPIRATION_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function getSecretKey() {
  const secret = process.env.AUTH_SECRET || "chronos_default_fallback_session_secret_2026_very_secure";
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  sessionId: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
