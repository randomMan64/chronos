import { cookies } from "next/headers";
import { db } from "@/db/connections/control-plane";
import { users, userSessions, organizationMembers, workspaceMembers, databasePermissions } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { UserContext, OrganizationRole, WorkspaceRole } from "@/lib/permissions/types";
import { resolvePermissions } from "@/lib/permissions/resolver";
import {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRATION_SECONDS,
  SessionPayload,
  createSessionToken,
  verifySessionToken,
} from "./token";

export {
  SESSION_COOKIE_NAME,
  SESSION_EXPIRATION_SECONDS,
  type SessionPayload,
  createSessionToken,
  verifySessionToken,
};

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload || !payload.userId) return null;

  // If a sessionId exists in the token, verify it has not been revoked or expired
  if (payload.sessionId) {
    try {
      const activeSessions = await db
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(
          and(
            eq(userSessions.id, payload.sessionId),
            gt(userSessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (activeSessions.length === 0) {
        return null;
      }
    } catch {
      // In isolated environments without database connection, fall back to verified JWT payload
    }
  }

  return payload;
}

export async function resolveUserContext(params: {
  organizationId?: string;
  workspaceId?: string;
  databaseId?: string;
}): Promise<UserContext | null> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return null;

  try {
    const userRecords = await db
      .select()
      .from(users)
      .where(and(eq(users.id, sessionUser.userId), eq(users.isActive, true)))
      .limit(1);

    if (userRecords.length === 0) return null;
    const user = userRecords[0];

    let orgRole: OrganizationRole | null = null;
    if (params.organizationId) {
      const orgMem = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, params.organizationId),
            eq(organizationMembers.userId, user.id)
          )
        )
        .limit(1);
      if (orgMem.length > 0) {
        orgRole = orgMem[0].role as OrganizationRole;
      }
    }

    let wsRole: WorkspaceRole | null = null;
    if (params.workspaceId) {
      const wsMem = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, params.workspaceId),
            eq(workspaceMembers.userId, user.id)
          )
        )
        .limit(1);
      if (wsMem.length > 0) {
        wsRole = wsMem[0].role as WorkspaceRole;
      }
    }

    let dbGrants = null;
    if (params.databaseId) {
      const dbPerm = await db
        .select()
        .from(databasePermissions)
        .where(
          and(
            eq(databasePermissions.databaseId, params.databaseId),
            eq(databasePermissions.userId, user.id)
          )
        )
        .limit(1);
      if (dbPerm.length > 0) {
        dbGrants = {
          role: dbPerm[0].role as WorkspaceRole,
          canRead: dbPerm[0].canRead,
          canWrite: dbPerm[0].canWrite,
          canExecuteDdl: dbPerm[0].canExecuteDdl,
          canRestore: dbPerm[0].canRestore,
          canExplain: dbPerm[0].canExplain,
        };
      }
    }

    const effectivePermissions = resolvePermissions({
      orgRole,
      workspaceRole: wsRole,
      databaseGrants: dbGrants,
    });

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: params.organizationId,
      organizationRole: orgRole || undefined,
      workspaceId: params.workspaceId,
      workspaceRole: wsRole || undefined,
      databaseId: params.databaseId,
      databaseGrants: dbGrants || undefined,
      effectivePermissions,
    };
  } catch (err) {
    console.error("Failed to resolve user context:", err);
    return null;
  }
}
