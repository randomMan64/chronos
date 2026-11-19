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
    "workspace:delete",
    "workspace:members:read",
    "workspace:members:assign",
    "workspace:members:revoke",
    "workspace:permissions:manage",
    "permissions:manage",
    // Org-level database governance
    "database:read",
    "database:create",
    "database:register",
    "database:manage",
    "database:delete",
    "record:insert",
    "record:update",
    "record:delete",
    // Performance & Diagnostics
    "performance:inspect",
    "performance:overview",
    "performance:query_stats",
    "performance:query_inspect",
    "performance:explain",
    "performance:explain_analyze",
    "performance:index_stats",
    "performance:table_stats",
    "performance:live_sessions",
    "performance:locks",
    "performance:recommendations",
    "performance:export",
    "performance:sensitive_query_read",
    "performance:session_terminate",
    // Transaction Inspector
    "transaction:read",
    "transaction:inspect",
    "transaction:read_all",
    "transaction:read_own",
    "transaction:statement_read",
    "transaction:mutation_read",
    "transaction:lock_inspect",
    "transaction:live_monitor",
    "transaction:export",
    "transaction:sensitive_sql_read",
    "transaction:session_terminate",
    // Audit & compliance
    "audit:read",
    "audit:export",
    "audit:view_own",
    "audit:view_workspace",
    "audit:view_organization",
    "audit:view_authentication",
    "audit:view_database",
    "audit:view_permissions",
    "audit:manage_alerts",
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
    "record:insert",
    "record:update",
    "record:delete",
    "history:read",
    "history:restore",
    "transaction:read",
    "transaction:inspect",
    "transaction:read_all",
    "transaction:read_own",
    "transaction:statement_read",
    "transaction:mutation_read",
    "transaction:lock_inspect",
    "transaction:live_monitor",
    "transaction:export",
    "transaction:sensitive_sql_read",
    "transaction:session_terminate",
    "performance:inspect",
    "performance:overview",
    "performance:query_stats",
    "performance:query_inspect",
    "performance:explain",
    "performance:explain_analyze",
    "performance:index_stats",
    "performance:table_stats",
    "performance:live_sessions",
    "performance:locks",
    "performance:recommendations",
    "performance:export",
    "performance:sensitive_query_read",
    "performance:session_terminate",
    "performance:maintenance",
    "backup:read",
    "backup:create",
    "backup:restore",
    "retention:manage",
    "permissions:manage",
    "audit:read",
    "audit:export",
    "audit:view_own",
    "audit:view_workspace",
    "audit:view_organization",
    "audit:view_authentication",
    "audit:view_database",
    "audit:view_permissions",
    "audit:manage_alerts",
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
    "record:insert",
    "record:update",
    "record:delete",
    "history:read",
    "history:restore",
    "transaction:read",
    "transaction:inspect",
    "transaction:read_own",
    "transaction:statement_read",
    "transaction:mutation_read",
    "performance:overview",
    "performance:query_stats",
    "performance:query_inspect",
    "performance:explain",
    "performance:explain_analyze",
    "performance:index_stats",
    "performance:table_stats",
    "performance:recommendations",
    "audit:read",
    "audit:view_own",
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
    "transaction:read",
    "transaction:read_own",
    "performance:overview",
    "performance:query_stats",
    "performance:index_stats",
    "performance:table_stats",
    "audit:read",
    "audit:view_own",
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
    "transaction:read",
    "transaction:inspect",
    "transaction:read_all",
    "transaction:read_own",
    "transaction:statement_read",
    "transaction:mutation_read",
    "transaction:lock_inspect",
    "transaction:live_monitor",
    "transaction:export",
    "transaction:sensitive_sql_read",
    "performance:inspect",
    "performance:overview",
    "performance:query_stats",
    "performance:query_inspect",
    "performance:explain",
    "performance:explain_analyze",
    "performance:index_stats",
    "performance:table_stats",
    "performance:live_sessions",
    "performance:locks",
    "performance:recommendations",
    "performance:export",
    "performance:sensitive_query_read",
    "history:read",
    "audit:view_own",
    "audit:view_workspace",
    "audit:view_database",
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
    "transaction:read",
    "transaction:inspect",
    "transaction:read_all",
    "transaction:statement_read",
    "transaction:mutation_read",
    "transaction:export",
    "performance:overview",
    "performance:query_stats",
    "performance:export",
    "audit:read",
    "audit:export",
    "audit:view_own",
    "audit:view_workspace",
    "audit:view_organization",
    "audit:view_authentication",
    "audit:view_database",
    "audit:view_permissions",
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
    "workspace:delete",
    "workspace:members:read",
    "workspace:members:assign",
    "workspace:members:revoke",
    "workspace:permissions:manage",
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

function getRoleWriteCapability(role: string | null | undefined): boolean {
  if (!role) return false;
  const raw = role.trim().toLowerCase();
  if (raw === "database_engineer" || raw === "engineer" || raw === "db_engineer") return false;
  if (raw === "data_analyst" || raw === "analyst") return false;
  if (raw === "auditor" || raw === "audit") return false;
  if (raw === "member") return false;
  if (raw === "owner" || raw === "dba" || raw === "developer" || raw === "admin" || raw === "dev") return true;
  return false;
}

function getRoleDdlCapability(role: string | null | undefined): boolean {
  if (!role) return false;
  const raw = role.trim().toLowerCase();
  if (raw === "owner" || raw === "dba" || raw === "admin") return true;
  return false;
}

function getRoleRestoreCapability(role: string | null | undefined, grantRole?: string): boolean {
  if (!role) return false;
  const raw = role.trim().toLowerCase();
  if (raw === "owner" || raw === "dba" || raw === "developer" || raw === "admin" || raw === "dev") return true;
  if (raw === "database_engineer" || raw === "engineer" || raw === "db_engineer") {
    // Configurable: permitted when explicitly configured for database engineer, not via stale dba registration grant
    return grantRole !== "dba" && grantRole !== "owner";
  }
  return false;
}

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

  // 3. Database Grants Override / Restrict with strict Role Ceiling
  const orgCanWrite = getRoleWriteCapability(params.orgRole);
  const wsCanWrite = getRoleWriteCapability(params.workspaceRole);
  const isWriteCapable = params.workspaceRole ? wsCanWrite : orgCanWrite;

  const orgCanDdl = getRoleDdlCapability(params.orgRole);
  const wsCanDdl = getRoleDdlCapability(params.workspaceRole);
  const isDdlCapable = params.workspaceRole ? wsCanDdl : orgCanDdl;

  const grantRole = params.databaseGrants?.role;
  const orgCanRestore = getRoleRestoreCapability(params.orgRole, grantRole);
  const wsCanRestore = getRoleRestoreCapability(params.workspaceRole, grantRole);
  const isRestoreCapable = params.workspaceRole ? wsCanRestore : orgCanRestore;

  if (params.databaseGrants) {
    if (params.databaseGrants.canRead) {
      permissions.add("query:read");
    } else {
      permissions.delete("query:read");
    }

    if (params.databaseGrants.canWrite && isWriteCapable) {
      permissions.add("query:write");
      permissions.add("record:insert");
      permissions.add("record:update");
      permissions.add("record:delete");
    } else {
      permissions.delete("query:write"); // Explicit denial or role ceiling
      permissions.delete("record:insert");
      permissions.delete("record:update");
      permissions.delete("record:delete");
    }

    if (params.databaseGrants.canExecuteDdl && isDdlCapable) {
      permissions.add("schema:write");
    } else {
      permissions.delete("schema:write");
    }

    if (params.databaseGrants.canRestore && isRestoreCapable) {
      permissions.add("history:restore");
    } else {
      permissions.delete("history:restore");
    }

    if (params.databaseGrants.canExplain) {
      permissions.add("performance:inspect");
    }
  }

  // Final role ceiling assertion: if user is not write-capable, NEVER leave write permissions in the set
  if (!isWriteCapable) {
    permissions.delete("query:write");
    permissions.delete("record:insert");
    permissions.delete("record:update");
    permissions.delete("record:delete");
  }
  if (!isDdlCapable) {
    permissions.delete("schema:write");
  }
  if (!isRestoreCapable) {
    permissions.delete("history:restore");
  }

  return permissions;
}

export function resolveTablePermissions(
  effectivePermissions: Set<Permission> | Set<string> | Permission[] | string[] | undefined | null,
  databaseGrants?: { canWrite?: boolean; canRead?: boolean } | null
): {
  canSelect: boolean;
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
} {
  const canRead = hasPermission(effectivePermissions, "query:read");
  const canWrite = hasPermission(effectivePermissions, "query:write");
  const canInsert = hasPermission(effectivePermissions, "record:insert") || canWrite;
  const canUpdate = hasPermission(effectivePermissions, "record:update") || canWrite;
  const canDelete = hasPermission(effectivePermissions, "record:delete") || canWrite;

  if (databaseGrants && databaseGrants.canWrite === false) {
    return {
      canSelect: canRead,
      canInsert: false,
      canUpdate: false,
      canDelete: false,
    };
  }

  return {
    canSelect: canRead,
    canInsert: canRead && canInsert,
    canUpdate: canRead && canUpdate,
    canDelete: canRead && canDelete,
  };
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
