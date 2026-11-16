import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db/connections/control-plane";
import {
  users,
  userSessions,
  organizations,
  organizationMembers,
  workspaces,
  workspaceMembers,
  databases,
  databasePermissions,
} from "@/db/schema";
import { eq, and, gt, isNull } from "drizzle-orm";
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

export function shouldUseSecureCookie(): boolean {
  if (process.env.APP_URL && process.env.APP_URL.startsWith("https://")) {
    return true;
  }
  if (process.env.VERCEL_URL && !process.env.VERCEL_URL.includes("localhost")) {
    return true;
  }
  return false;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_EXPIRATION_SECONDS,
  };
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
}

export function attachSessionCookieToResponse(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
  return response;
}

export const DEVICE_COOKIE_NAME = "chronos_device_id";

export function getDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 365 * 24 * 60 * 60, // 1 year
  };
}

export async function setDeviceCookie(deviceKey: string) {
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_COOKIE_NAME, deviceKey, getDeviceCookieOptions());
}

export function attachDeviceCookieToResponse(response: NextResponse, deviceKey: string): NextResponse {
  response.cookies.set(DEVICE_COOKIE_NAME, deviceKey, getDeviceCookieOptions());
  return response;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete("chronos_active_org");
  cookieStore.delete("chronos_active_ws");
}

export function clearSessionCookieOnResponse(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete("chronos_active_org");
  response.cookies.delete("chronos_active_ws");
  return response;
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
            isNull(userSessions.revokedAt),
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
  } else {
    // If token lacks explicit sessionId, verify the user still has non-revoked active sessions
    try {
      const activeUserSessions = await db
        .select({ id: userSessions.id })
        .from(userSessions)
        .where(
          and(
            eq(userSessions.userId, payload.userId),
            isNull(userSessions.revokedAt),
            gt(userSessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (activeUserSessions.length === 0) {
        return null;
      }
    } catch {
      // fallback
    }
  }

  return payload;
}

export interface AuthenticatedSession {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
  };
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
  }>;
  currentOrg: {
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
  } | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    environment: string;
    role?: string;
  }>;
  currentWorkspace: {
    id: string;
    name: string;
    slug: string;
    environment: string;
  } | null;
  databases: Array<{
    id: string;
    name: string;
    status: string;
    environment: string;
  }>;
  currentDatabase: {
    id: string;
    name: string;
    status: string;
  } | null;
  permissions: string[];
}

/**
 * Authoritative server-side session loader.
 * Completely resolves the authenticated identity, organizations, workspaces,
 * databases, and effective permissions with strict tenant isolation.
 * Never returns mock or demo data.
 */
export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) return null;

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.id, sessionUser.userId), eq(users.isActive, true)))
      .limit(1);

    if (!user) return null;

    // 1. Fetch user's organizations
    const orgMemberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id));

    const userOrgs = orgMemberships.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      role: m.role as OrganizationRole,
    }));

    if (userOrgs.length === 0) {
      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
        },
        organizations: [],
        currentOrg: null,
        workspaces: [],
        currentWorkspace: null,
        databases: [],
        currentDatabase: null,
        permissions: [],
      };
    }

    // Resolve active organization
    const cookieStore = await cookies();
    const preferredOrgId = cookieStore.get("chronos_active_org")?.value;
    const currentOrg = userOrgs.find((o) => o.id === preferredOrgId) || userOrgs[0];

    // 2. Fetch authorized workspaces for the active organization
    let userWorkspaces: Array<{
      id: string;
      name: string;
      slug: string;
      environment: string;
      role?: string;
    }> = [];

    if (currentOrg.role === "owner" || currentOrg.role === "admin") {
      // Owners & admins have access to all workspaces in their organization
      const allWs = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          environment: workspaces.environment,
        })
        .from(workspaces)
        .where(eq(workspaces.organizationId, currentOrg.id));

      userWorkspaces = allWs.map((w) => ({
        ...w,
        role: currentOrg.role === "owner" ? "dba" : "developer",
      }));
    } else {
      // Regular members are strictly scoped to their workspace memberships
      const memberWs = await db
        .select({
          id: workspaces.id,
          name: workspaces.name,
          slug: workspaces.slug,
          environment: workspaces.environment,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(
          and(
            eq(workspaceMembers.userId, user.id),
            eq(workspaces.organizationId, currentOrg.id)
          )
        );

      userWorkspaces = memberWs;
    }

    const preferredWsId = cookieStore.get("chronos_active_ws")?.value;
    const currentWsCandidate =
      userWorkspaces.find((w) => w.id === preferredWsId) || userWorkspaces[0] || null;

    const currentWorkspace = currentWsCandidate
      ? {
          id: currentWsCandidate.id,
          name: currentWsCandidate.name,
          slug: currentWsCandidate.slug,
          environment: currentWsCandidate.environment,
        }
      : null;

    // 3. Fetch authorized databases for the active workspace / organization
    let wsDatabases: Array<{
      id: string;
      name: string;
      status: string;
      environment: string;
    }> = [];

    if (currentWorkspace) {
      const dbs = await db
        .select({
          id: databases.id,
          name: databases.name,
          status: databases.status,
          environment: databases.environment,
        })
        .from(databases)
        .where(
          and(
            eq(databases.workspaceId, currentWorkspace.id),
            eq(databases.organizationId, currentOrg.id)
          )
        );

      wsDatabases = dbs.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status || "active",
        environment: d.environment || "development",
      }));
    }

    const currentDatabase = wsDatabases[0]
      ? {
          id: wsDatabases[0].id,
          name: wsDatabases[0].name,
          status: wsDatabases[0].status,
        }
      : null;

    // 4. Resolve effective permissions
    const effectivePermissions = resolvePermissions({
      orgRole: currentOrg.role,
      workspaceRole: (currentWsCandidate?.role as WorkspaceRole) || undefined,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
      },
      organizations: userOrgs,
      currentOrg,
      workspaces: userWorkspaces,
      currentWorkspace,
      databases: wsDatabases,
      currentDatabase,
      permissions: Array.from(effectivePermissions),
    };
  } catch (err) {
    console.error("Failed to load authenticated session:", err);
    return null;
  }
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
