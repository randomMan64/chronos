import type { ChronosRole, RoleDefinition } from "./roles";

export type { ChronosRole, RoleDefinition };

export type Permission =
  // Organization Administration
  | "organization:read"
  | "organization:manage"
  | "organization:delete"
  | "organization:transfer_ownership"
  | "members:read"
  | "members:invite"
  | "members:manage"
  | "roles:read"
  | "roles:assign"
  | "workspace:read"
  | "workspace:create"
  | "workspace:manage"
  | "workspace:delete"
  | "workspace:members:read"
  | "workspace:members:assign"
  | "workspace:members:revoke"
  | "workspace:permissions:manage"
  // Database Operations & Governance
  | "database:read"
  | "database:create"
  | "database:register"
  | "database:manage"
  | "database:delete"
  | "schema:read"
  | "schema:write"
  | "query:read"
  | "query:execute"
  | "query:write"
  | "query:export"
  | "record:insert"
  | "record:update"
  | "record:delete"
  | "history:read"
  | "history:restore"
  | "transaction:inspect"
  | "performance:inspect"
  | "performance:overview"
  | "performance:query_stats"
  | "performance:query_inspect"
  | "performance:explain"
  | "performance:explain_analyze"
  | "performance:index_stats"
  | "performance:table_stats"
  | "performance:live_sessions"
  | "performance:locks"
  | "performance:recommendations"
  | "performance:export"
  | "performance:sensitive_query_read"
  | "performance:session_terminate"
  | "performance:maintenance"
  | "backup:read"
  | "backup:create"
  | "backup:restore"
  | "audit:read"
  | "audit:export"
  | "audit:view_own"
  | "audit:view_workspace"
  | "audit:view_organization"
  | "audit:view_authentication"
  | "audit:view_database"
  | "audit:view_permissions"
  | "audit:manage_alerts"
  | "audit:modify_events"
  | "audit:delete_events"
  | "permissions:manage"
  | "retention:manage";

export type OrganizationRole = ChronosRole | "admin" | "member";

export type WorkspaceRole = ChronosRole | "analyst" | "engineer";

export interface UserContext {
  userId: string;
  email: string;
  fullName: string;
  organizationId?: string;
  organizationRole?: OrganizationRole;
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
  databaseId?: string;
  databaseGrants?: {
    role: WorkspaceRole;
    canRead: boolean;
    canWrite: boolean;
    canExecuteDdl: boolean;
    canRestore: boolean;
    canExplain: boolean;
  };
  effectivePermissions: Set<Permission>;
}
