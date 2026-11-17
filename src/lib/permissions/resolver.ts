import { Permission, OrganizationRole, WorkspaceRole } from "./types";
import {
  ChronosRole,
  CHRONOS_ROLE_KEYS,
  normalizeRole,
} from "./roles";

/**
 * Authoritative permission definitions for all six primary CHRONOS roles.
 */
export const ROLE_PERMISSIONS: Record<ChronosRole, Permission[]> = {
  owner: [
    // Full Organization Administration
    "organization:read",
    "organization:manage",
    "organization:delete",
    "organization:transfer_ownership",
    "members:read",
    "members:invite",
    "members:manage",
    "roles:read",
    "roles:assign",
    "workspace:read",
    "workspace:create",
    "workspace:manage",
    "permissions:manage",
    // Org-level database governance
    "database:read",
    "database:create",
    "database:register",
    "database:manage",
    "database:delete",
    // Audit & compliance
    "audit:read",
    "audit:export",
  ],
  dba: [
    // Organization visibility (read-only)
    "organization:read",
    "workspace:read",
    "members:read",
    "roles:read",
    // Complete Database Administration
    "database:read",
    "database:create",
    "database:register",
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
    "retention:manage",
    "permissions:manage",
  ],
  developer: [
    // Organization visibility (read-only)
    "organization:read",
    "workspace:read",
    "members:read",
    "roles:read",
    // Development & write operations
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
  data_analyst: [
    // Organization visibility (read-only)
    "organization:read",
    "workspace:read",
    "members:read",
    "roles:read",
    // Read-only queries & analysis (Strictly NO write/restore)
    "database:read",
    "schema:read",
    "query:read",
    "query:execute",
    "query:export",
    "history:read",
  ],
  database_engineer: [
    // Organization visibility (read-only)
    "organization:read",
    "workspace:read",
    "members:read",
    "roles:read",
    // Performance, diagnostics & transaction inspection
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
    // Organization visibility (read-only)
    "organization:read",
    "workspace:read",
    "members:read",
    "roles:read",
    // Read-only audit & compliance inspection
    "database:read",
    "schema:read",
    "query:read",
    "history:read",
    "transaction:inspect",
    "audit:read",
    "audit:export",
  ],
};

/**
 * Legacy mapping retained for backward compatibility with existing tests and records.
 */
export const ORG_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ...ROLE_PERMISSIONS,
  admin: [
    "organization:read",
    "members:read",
    "members:invite",
    "members:manage",
    "roles:read",
    "roles:assign",
    "workspace:read",
    "workspace:create",
    "workspace:manage",
    "database:read",
    "database:create",
    "database:register",
    "database:manage",
    "audit:read",
  ],
  member: ["organization:read", "workspace:read", "members:read", "roles:read"],
};

export const WORKSPACE_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ...ROLE_PERMISSIONS,
  analyst: ROLE_PERMISSIONS.data_analyst,
  engineer: ROLE_PERMISSIONS.database_engineer,
};

/**
 * Resolves the effective permissions for a user given their organization role,
 * workspace role, and any explicit database grants.
 */
export function resolvePermissions(params: {
  orgRole?: OrganizationRole | string | null;
  workspaceRole?: WorkspaceRole | string | null;
  databaseGrants?: {
    role?: WorkspaceRole | string;
    canRead: boolean;
    canWrite: boolean;
    canExecuteDdl: boolean;
    canRestore: boolean;
    canExplain: boolean;
  } | null;
}): Set<Permission> {
  const permissions = new Set<Permission>();

  // 1. Resolve Organization Role
  if (params.orgRole) {
    const rawRole = params.orgRole;
    if (rawRole === "owner") {
      for (const p of ROLE_PERMISSIONS.owner) permissions.add(p);
    } else if (rawRole === "admin") {
      for (const p of ORG_ROLE_PERMISSIONS.admin) permissions.add(p);
    } else if (rawRole === "member") {
      for (const p of ORG_ROLE_PERMISSIONS.member) permissions.add(p);
    } else {
      const canonical = normalizeRole(rawRole);
      if (ROLE_PERMISSIONS[canonical]) {
        for (const p of ROLE_PERMISSIONS[canonical]) permissions.add(p);
      }
    }
  }

  // 2. Resolve Workspace Role
  if (params.workspaceRole) {
    const rawWsRole = params.workspaceRole;
    const canonicalWs = normalizeRole(rawWsRole);
    if (ROLE_PERMISSIONS[canonicalWs]) {
      for (const p of ROLE_PERMISSIONS[canonicalWs]) {
        permissions.add(p);
      }
    }
  }

  // 3. Database Grants Override / Restrict
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
  effectivePermissions: Set<Permission> | Set<string> | Permission[] | string[] | undefined | null,
  required: Permission
): boolean {
  if (!effectivePermissions) return false;
  if (effectivePermissions instanceof Set) {
    return (effectivePermissions as Set<string>).has(required);
  }
  if (Array.isArray(effectivePermissions)) {
    return (effectivePermissions as string[]).includes(required);
  }
  return false;
}

export function hasAllPermissions(
  effectivePermissions: Set<Permission> | Set<string> | Permission[] | string[] | undefined | null,
  required: Permission[]
): boolean {
  if (!effectivePermissions) return false;
  return required.every((p) => hasPermission(effectivePermissions, p));
}

export function hasAnyPermission(
  effectivePermissions: Set<Permission> | Set<string> | Permission[] | string[] | undefined | null,
  required: Permission[]
): boolean {
  if (!effectivePermissions) return false;
  return required.some((p) => hasPermission(effectivePermissions, p));
}

export type RbacPermissionState = "allowed" | "denied" | "conditional";

export interface RbacMatrixRow {
  permission: Permission | string;
  label: string;
  category:
    | "Organization Administration"
    | "Database & Schema"
    | "Query Execution"
    | "Temporal & Diagnostics"
    | "Audit & Compliance";
  description: string;
  roles: Record<
    ChronosRole,
    {
      state: RbacPermissionState;
      label: string;
      note?: string;
    }
  >;
}

/**
 * Authoritative RBAC matrix definition derived directly from permission definitions.
 * This ensures the frontend and backend are 100% synchronized with zero drift.
 */
export function getPermissionsMatrix(): RbacMatrixRow[] {
  const capabilities: Array<{
    permission: Permission | string;
    label: string;
    category: RbacMatrixRow["category"];
    description: string;
    isConditionalForOwner?: boolean;
    strictNoRoles?: ChronosRole[];
  }> = [
    {
      permission: "organization:manage",
      label: "organization:manage",
      category: "Organization Administration",
      description: "Manage organization settings, billing, and global policies.",
    },
    {
      permission: "members:manage",
      label: "members:manage",
      category: "Organization Administration",
      description: "Assign roles, remove members, and manage access.",
    },
    {
      permission: "members:invite",
      label: "members:invite",
      category: "Organization Administration",
      description: "Invite team members via tokenized email invitations.",
    },
    {
      permission: "workspace:manage",
      label: "workspace:manage",
      category: "Organization Administration",
      description: "Create, configure, and isolate workspaces and environments.",
    },
    {
      permission: "database:manage",
      label: "database:manage / register",
      category: "Database & Schema",
      description: "Register PostgreSQL clusters and manage connection credentials.",
    },
    {
      permission: "schema:read",
      label: "schema:read (Inspect)",
      category: "Database & Schema",
      description: "Discover tables, columns, indexes, and constraints.",
      isConditionalForOwner: true,
    },
    {
      permission: "schema:write",
      label: "schema:write (DDL)",
      category: "Database & Schema",
      description: "Execute DDL operations (ALTER, CREATE TABLE, DROP).",
      isConditionalForOwner: true,
      strictNoRoles: ["data_analyst", "auditor"],
    },
    {
      permission: "query:read",
      label: "query:read (SELECT)",
      category: "Query Execution",
      description: "Execute read-only SQL queries and explain plans.",
      isConditionalForOwner: true,
    },
    {
      permission: "query:write",
      label: "query:write (DML)",
      category: "Query Execution",
      description: "Execute INSERT, UPDATE, DELETE data modification statements.",
      isConditionalForOwner: true,
      strictNoRoles: ["data_analyst", "auditor"],
    },
    {
      permission: "history:read",
      label: "history:read (Time Travel)",
      category: "Temporal & Diagnostics",
      description: "Investigate historical row versions and temporal change diffs.",
      isConditionalForOwner: true,
    },
    {
      permission: "history:restore",
      label: "history:restore (Compensating)",
      category: "Temporal & Diagnostics",
      description: "Generate and execute compensating transactions to restore data.",
      isConditionalForOwner: true,
      strictNoRoles: ["data_analyst", "auditor"],
    },
    {
      permission: "performance:inspect",
      label: "performance:inspect (EXPLAIN ANALYZE)",
      category: "Temporal & Diagnostics",
      description: "Execute EXPLAIN ANALYZE and inspect statement performance telemetry.",
      isConditionalForOwner: true,
    },
    {
      permission: "transaction:inspect",
      label: "transaction:inspect (Lock Queue)",
      category: "Temporal & Diagnostics",
      description: "Inspect running transactions, lock wait queues, and blocked queries.",
      isConditionalForOwner: true,
    },
    {
      permission: "backup:create",
      label: "backup:create / restore",
      category: "Database & Schema",
      description: "Trigger snapshot backups and execute restoration workflows.",
      isConditionalForOwner: true,
    },
    {
      permission: "audit:read",
      label: "audit:read (Append-only logs)",
      category: "Audit & Compliance",
      description: "Inspect tamper-evident append-only security and operational audit logs.",
    },
    {
      permission: "audit:export",
      label: "audit:export (Compliance export)",
      category: "Audit & Compliance",
      description: "Export cryptographic audit logs for external regulatory audits.",
    },
  ];

  return capabilities.map((cap) => {
    const roles: Record<ChronosRole, { state: RbacPermissionState; label: string; note?: string }> =
      {} as any;

    for (const role of CHRONOS_ROLE_KEYS) {
      if (role === "owner" && cap.isConditionalForOwner) {
        roles[role] = {
          state: "conditional",
          label: "CONDITIONAL",
          note: "Requires explicit database grant",
        };
        continue;
      }

      const hasPerm = ROLE_PERMISSIONS[role].includes(cap.permission as Permission);

      if (hasPerm) {
        roles[role] = {
          state: "allowed",
          label: "YES",
        };
      } else if (cap.strictNoRoles?.includes(role)) {
        roles[role] = {
          state: "denied",
          label: "STRICT NO",
          note: "Enforced read-only security boundary",
        };
      } else {
        roles[role] = {
          state: "denied",
          label: "—",
        };
      }
    }

    return {
      permission: cap.permission,
      label: cap.label,
      category: cap.category,
      description: cap.description,
      roles,
    };
  });
}
