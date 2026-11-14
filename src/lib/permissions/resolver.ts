import { Permission, OrganizationRole, WorkspaceRole } from "./types";

export const ORG_ROLE_PERMISSIONS: Record<OrganizationRole, Permission[]> = {
  owner: [
    "organization:read",
    "organization:manage",
    "members:invite",
    "members:manage",
    "workspace:read",
    "workspace:create",
    "workspace:manage",
    "database:read",
    "database:create",
    "database:manage",
    "database:delete",
    "audit:read",
    "audit:export",
    "permissions:manage",
  ],
  admin: [
    "organization:read",
    "members:invite",
    "members:manage",
    "workspace:read",
    "workspace:create",
    "workspace:manage",
    "database:read",
    "database:create",
    "database:manage",
    "audit:read",
  ],
  member: ["organization:read", "workspace:read"],
};

export const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  dba: [
    "workspace:read",
    "database:read",
    "database:manage",
    "schema:read",
    "schema:write",
    "query:read",
    "query:execute",
    "query:write",
    "query:export",
    "history:read",
    "history:restore",
    "transaction:inspect",
    "performance:inspect",
    "backup:read",
    "backup:create",
    "backup:restore",
    "permissions:manage",
    "retention:manage",
  ],
  developer: [
    "workspace:read",
    "database:read",
    "schema:read",
    "query:read",
    "query:execute",
    "query:write",
    "query:export",
    "history:read",
    "history:restore",
    "transaction:inspect",
  ],
  analyst: [
    "workspace:read",
    "database:read",
    "schema:read",
    "query:read",
    "query:execute",
    "query:export",
    "history:read",
  ],
  engineer: [
    "workspace:read",
    "database:read",
    "schema:read",
    "query:read",
    "query:execute",
    "query:export",
    "transaction:inspect",
    "performance:inspect",
    "history:read",
  ],
  auditor: [
    "workspace:read",
    "database:read",
    "schema:read",
    "query:read",
    "history:read",
    "transaction:inspect",
    "audit:read",
    "audit:export",
  ],
};

export function resolvePermissions(params: {
  orgRole?: OrganizationRole | null;
  workspaceRole?: WorkspaceRole | null;
  databaseGrants?: {
    role?: WorkspaceRole;
    canRead: boolean;
    canWrite: boolean;
    canExecuteDdl: boolean;
    canRestore: boolean;
    canExplain: boolean;
  } | null;
}): Set<Permission> {
  const permissions = new Set<Permission>();

  if (params.orgRole && ORG_ROLE_PERMISSIONS[params.orgRole]) {
    for (const p of ORG_ROLE_PERMISSIONS[params.orgRole]) {
      permissions.add(p);
    }
  }

  if (params.workspaceRole && WORKSPACE_ROLE_PERMISSIONS[params.workspaceRole]) {
    for (const p of WORKSPACE_ROLE_PERMISSIONS[params.workspaceRole]) {
      permissions.add(p);
    }
  }

  // Database grants override or restrict
  if (params.databaseGrants) {
    if (params.databaseGrants.canRead) permissions.add("query:read");
    if (params.databaseGrants.canWrite) permissions.add("query:write");
    else permissions.delete("query:write"); // Explicit denial

    if (params.databaseGrants.canExecuteDdl) permissions.add("schema:write");
    else permissions.delete("schema:write");

    if (params.databaseGrants.canRestore) permissions.add("history:restore");
    else permissions.delete("history:restore");

    if (params.databaseGrants.canExplain) permissions.add("performance:inspect");
  }

  return permissions;
}

export function hasPermission(
  effectivePermissions: Set<Permission>,
  required: Permission
): boolean {
  return effectivePermissions.has(required);
}

export function hasAllPermissions(
  effectivePermissions: Set<Permission>,
  required: Permission[]
): boolean {
  return required.every((p) => effectivePermissions.has(p));
}
