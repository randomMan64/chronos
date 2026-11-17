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
