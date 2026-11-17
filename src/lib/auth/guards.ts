import { resolveUserContext, getCurrentUser, validateSessionState } from "./session";
import { UserContext, Permission, OrganizationRole, WorkspaceRole } from "@/lib/permissions/types";
import { hasPermission } from "@/lib/permissions/resolver";
import { canAssignRole } from "@/lib/permissions/roles";
import { db } from "@/db/connections/control-plane";
import { databases, workspaces, organizations, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export class AuthError extends Error {
  public statusCode: number;
  public code: string;
  constructor(message = "Authentication required. Please sign in.", statusCode = 401, code = "UNAUTHENTICATED") {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ForbiddenError extends Error {
  public statusCode: number;
  public code: string;
  constructor(message = "Access forbidden: Insufficient permissions.", statusCode = 403, code = "FORBIDDEN") {
    super(message);
    this.name = "ForbiddenError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends Error {
  public statusCode: number;
  public code: string;
  constructor(message = "Resource not found", statusCode = 404, code = "NOT_FOUND") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Validates the user's active session. Throws 401 if unauthenticated or revoked.
 */
export async function requireAuth(): Promise<{ userId: string; email: string; sessionId?: string }> {
  const validation = await validateSessionState();
  if (!validation.valid || !validation.user) {
    throw new AuthError(
      validation.message || "Authentication required. Please sign in.",
      401,
      validation.code || "UNAUTHENTICATED"
    );
  }
  return { userId: validation.user.userId, email: validation.user.email, sessionId: validation.user.sessionId };
}

/**
 * Loads the active user record from PostgreSQL for the authenticated session.
 */
export async function requireUserSession() {
  const auth = await requireAuth();
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, auth.userId), eq(users.isActive, true)))
    .limit(1);

  if (!user) {
    throw new AuthError("User account not found or deactivated.", 401);
  }

  return { auth, user };
}

/**
 * Validates that the authenticated user is an active member of the specified organization.
 */
export async function requireOrganizationAccess(organizationId: string): Promise<UserContext> {
  if (!organizationId) {
    throw new AuthError("Organization identifier is required.", 400);
  }

  const context = await resolveUserContext({ organizationId });
  if (!context) {
    throw new AuthError("Authentication required", 401);
  }
  if (!context.organizationRole) {
    throw new ForbiddenError("You are not a member of this organization", 403);
  }
  return context;
}

export const requireOrganizationMembership = requireOrganizationAccess;

/**
 * Validates that workspace belongs to organizationId and user has access to it.
 */
export async function requireWorkspaceAccess(
  organizationId: string,
  workspaceId: string
): Promise<UserContext> {
  if (!organizationId || !workspaceId) {
    throw new ForbiddenError("Organization and workspace identifiers are required.", 400);
  }

  // Cross-tenant verification: Ensure workspace actually belongs to organizationId
  const [ws] = await db
    .select({ id: workspaces.id, organizationId: workspaces.organizationId })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
    .limit(1);

  if (!ws) {
    throw new NotFoundError("Workspace not found in this organization", 404);
  }

  const context = await resolveUserContext({ organizationId, workspaceId });
  if (!context) {
    throw new AuthError("Authentication required", 401);
  }
  if (!context.organizationRole) {
    throw new ForbiddenError("You are not a member of this organization", 403);
  }
  if (context.organizationRole !== "owner" && !context.workspaceRole) {
    throw new ForbiddenError("You do not have access to this workspace", 403);
  }
  return context;
}

export const requireWorkspaceMembership = requireWorkspaceAccess;

/**
 * Resolves workspace and tenant context directly from workspaceId.
 */
export async function requireWorkspaceAccessById(
  workspaceId: string,
  requiredPermission?: Permission
): Promise<{ context: UserContext; workspace: typeof workspaces.$inferSelect }> {
  if (!workspaceId) {
    throw new NotFoundError("Workspace identifier is required.", 400);
  }

  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!ws) {
    throw new NotFoundError("Workspace not found", 404);
  }

  const context = await requireWorkspaceAccess(ws.organizationId, ws.id);

  if (requiredPermission) {
    requirePermission(context, requiredPermission);
  }

  return { context, workspace: ws };
}

/**
 * Validates database access with cross-tenant isolation and granular permission check.
 */
export async function requireDatabaseAccess(
  organizationId: string,
  workspaceId: string,
  databaseId: string,
  requiredPermission?: Permission
): Promise<UserContext> {
  if (!databaseId) {
    throw new NotFoundError("Database identifier is required.", 400);
  }

  // Cross-tenant verification: Ensure database belongs to the declared organization and workspace
  const [dbRecord] = await db
    .select({
      id: databases.id,
      organizationId: databases.organizationId,
      workspaceId: databases.workspaceId,
    })
    .from(databases)
    .where(
      and(
        eq(databases.id, databaseId),
        eq(databases.organizationId, organizationId),
        eq(databases.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (!dbRecord) {
    throw new NotFoundError("Database not found in this organization and workspace context", 404);
  }

  const context = await resolveUserContext({ organizationId, workspaceId, databaseId });
  if (!context) {
    throw new AuthError("Authentication required", 401);
  }
  if (!context.organizationRole) {
    throw new ForbiddenError("You are not a member of this organization", 403);
  }
  if (context.organizationRole !== "owner" && !context.workspaceRole) {
    throw new ForbiddenError("You do not have access to this workspace", 403);
  }

  if (requiredPermission && !hasPermission(context.effectivePermissions, requiredPermission)) {
    throw new ForbiddenError(`Permission denied: Missing '${requiredPermission}'`, 403);
  }

  return context;
}

/**
 * Resolves database and organization context directly from databaseId.
 * Guarantees cross-tenant protection even if client does not pass organizationId.
 */
export async function requireDatabaseAccessById(
  databaseId: string,
  requiredPermission?: Permission
): Promise<{ context: UserContext; database: typeof databases.$inferSelect }> {
  if (!databaseId) {
    throw new NotFoundError("Database identifier is required.", 400);
  }

  const [dbRecord] = await db
    .select()
    .from(databases)
    .where(eq(databases.id, databaseId))
    .limit(1);

  if (!dbRecord) {
    throw new NotFoundError("Database not found", 404);
  }

  const context = await requireDatabaseAccess(
    dbRecord.organizationId,
    dbRecord.workspaceId,
    dbRecord.id,
    requiredPermission
  );

  return { context, database: dbRecord };
}

/**
 * Asserts that the user possesses a specific permission.
 */
export function requirePermission(context: UserContext, permission: Permission): void {
  if (!hasPermission(context.effectivePermissions, permission)) {
    throw new ForbiddenError(`Forbidden: Missing required permission '${permission}'`, 403);
  }
}

/**
 * Asserts that the user possesses a specific organization or workspace role.
 */
export function requireRole(
  context: UserContext,
  role: OrganizationRole | WorkspaceRole
): void {
  const isOrgRole = context.organizationRole === role;
  const isWsRole = context.workspaceRole === role;

  if (!isOrgRole && !isWsRole) {
    throw new ForbiddenError(`Forbidden: Role '${role}' required`, 403);
  }
}

export { canAssignRole };

/**
 * Asserts that the actor is authorized to assign or invite the target role.
 */
export function requireCanAssignRole(
  context: UserContext,
  targetRole: string
): void {
  const actorRole = context.organizationRole;
  if (!canAssignRole(actorRole, targetRole)) {
    throw new ForbiddenError(
      `Forbidden: Your role (${actorRole || "none"}) is not authorized to assign or invite role '${targetRole}'.`,
      403
    );
  }
}

