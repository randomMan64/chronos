export type Permission =
  | "organization:read"
  | "organization:manage"
  | "members:invite"
  | "members:manage"
  | "workspace:read"
  | "workspace:create"
  | "workspace:manage"
  | "database:read"
  | "database:create"
  | "database:manage"
  | "database:delete"
  | "schema:read"
  | "schema:write"
  | "query:read"
  | "query:execute"
  | "query:write"
  | "query:export"
  | "history:read"
  | "history:restore"
  | "transaction:inspect"
  | "performance:inspect"
  | "backup:read"
  | "backup:create"
  | "backup:restore"
  | "audit:read"
  | "audit:export"
  | "permissions:manage"
  | "retention:manage";

export type OrganizationRole = "owner" | "admin" | "member";

export type WorkspaceRole = "dba" | "developer" | "analyst" | "engineer" | "auditor";

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

