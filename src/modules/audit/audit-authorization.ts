import { ChronosRole, normalizeRole } from "@/lib/permissions/roles";
import { UserContext, Permission } from "@/lib/permissions/types";
import { AuditEventItem } from "./audit-query-service";

export type AuditPermissionKey =
  | "audit.view_own"
  | "audit.view_workspace"
  | "audit.view_organization"
  | "audit.view_authentication"
  | "audit.view_database"
  | "audit.view_permissions"
  | "audit.export"
  | "audit.manage_alerts"
  | "audit.modify_events"
  | "audit.delete_events";

export type ScopeAccess = "all" | "own" | "none";

export interface AuditRolePolicy {
  role: ChronosRole;
  label: string;
  canViewOwn: boolean;
  canViewWorkspace: boolean;
  canViewOrganization: boolean;
  viewAuthentication: ScopeAccess;
  viewDatabase: ScopeAccess;
  viewPermissions: ScopeAccess;
  canExport: boolean;
  canManageAlerts: boolean;
  canModifyEvents: false;
  canDeleteEvents: false;
}

/**
 * Predefined Audit Center Policy Matrix for the 6 primary CHRONOS roles.
 */
export const AUDIT_ROLE_POLICIES: Record<ChronosRole, AuditRolePolicy> = {
  owner: {
    role: "owner",
    label: "Owner",
    canViewOwn: true,
    canViewWorkspace: true,
    canViewOrganization: true,
    viewAuthentication: "all",
    viewDatabase: "all",
    viewPermissions: "all",
    canExport: true,
    canManageAlerts: true,
    canModifyEvents: false,
    canDeleteEvents: false,
  },
  dba: {
    role: "dba",
    label: "DBA",
    canViewOwn: true,
    canViewWorkspace: true,
    canViewOrganization: true,
    viewAuthentication: "all",
    viewDatabase: "all",
    viewPermissions: "all",
    canExport: true,
    canManageAlerts: true,
    canModifyEvents: false,
    canDeleteEvents: false,
  },
  database_engineer: {
    role: "database_engineer",
    label: "Database Engineer",
    canViewOwn: true,
    canViewWorkspace: true,
    canViewOrganization: false,
    viewAuthentication: "none",
    viewDatabase: "all",
    viewPermissions: "none",
    canExport: false,
    canManageAlerts: false,
    canModifyEvents: false,
    canDeleteEvents: false,
  },
  developer: {
    role: "developer",
    label: "Developer",
    canViewOwn: true,
    canViewWorkspace: false,
    canViewOrganization: false,
    viewAuthentication: "own",
    viewDatabase: "own",
    viewPermissions: "own",
    canExport: false,
    canManageAlerts: false,
    canModifyEvents: false,
    canDeleteEvents: false,
  },
  data_analyst: {
    role: "data_analyst",
    label: "Data Analyst",
    canViewOwn: true,
    canViewWorkspace: false,
    canViewOrganization: false,
    viewAuthentication: "own",
    viewDatabase: "own",
    viewPermissions: "own",
    canExport: false,
    canManageAlerts: false,
    canModifyEvents: false,
    canDeleteEvents: false,
  },
  auditor: {
    role: "auditor",
    label: "Auditor",
    canViewOwn: true,
    canViewWorkspace: true,
    canViewOrganization: true,
    viewAuthentication: "all",
    viewDatabase: "all",
    viewPermissions: "all",
    canExport: true,
    canManageAlerts: false,
    canModifyEvents: false,
    canDeleteEvents: false,
  },
};

export interface AuditQueryScope {
  policy: AuditRolePolicy;
  isOwnActivityOnly: boolean;
  isDatabaseScopeOnly: boolean;
  sanitizedParams: {
    organizationId: string;
    workspaceId?: string;
    databaseId?: string;
    category?: string;
    action?: string;
    outcome?: string;
    severity?: string;
    actorEmail?: string;
    resourceType?: string;
    resourceId?: string;
    ipAddress?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    timeRange?: string;
    sortBy?: "createdAt" | "action" | "outcome" | "severity";
    sortOrder?: "asc" | "desc";
    page?: number;
    pageSize?: number;
    [key: string]: any;
  };
  allowedCategories?: string[];
}

export class AuditAuthorization {
  /**
   * Resolves the authoritative role for the user context.
   */
  public static resolveRole(context: UserContext): ChronosRole {
    if (context.organizationRole === "owner") return "owner";
    return normalizeRole(context.workspaceRole || context.organizationRole || "developer");
  }

  /**
   * Resolves effective audit policy for a user, respecting IAM overrides where present.
   */
  public static resolvePolicy(context: UserContext): AuditRolePolicy {
    const role = this.resolveRole(context);
    const basePolicy = { ...AUDIT_ROLE_POLICIES[role] };

    // Respect explicit permission overrides if granted via IAM
    if (context.effectivePermissions) {
      if (context.effectivePermissions.has("audit:export")) {
        basePolicy.canExport = true;
      }
      if (context.effectivePermissions.has("audit:manage_alerts") && role !== "auditor") {
        basePolicy.canManageAlerts = true;
      }
    }

    // Strict security boundaries: modify and delete events can NEVER be granted
    basePolicy.canModifyEvents = false;
    basePolicy.canDeleteEvents = false;

    return basePolicy;
  }

  /**
   * Checks whether the user context has permission to export audit records.
   */
  public static canExportAudit(context: UserContext): boolean {
    const policy = this.resolvePolicy(context);
    return policy.canExport;
  }

  /**
   * Checks whether the user context has permission to manage/triage security alerts.
   */
  public static canManageAlerts(context: UserContext): boolean {
    const policy = this.resolvePolicy(context);
    return policy.canManageAlerts;
  }

  /**
   * Evaluates whether a user can inspect a single specific audit event.
   */
  public static canViewEvent(context: UserContext, event: AuditEventItem): boolean {
    const policy = this.resolvePolicy(context);

    // Developer & Data Analyst: Access personal activity only
    if (!policy.canViewOrganization && !policy.canViewWorkspace) {
      return (
        event.actorEmail?.toLowerCase() === context.email.toLowerCase() ||
        event.actorId === context.userId
      );
    }

    // Database Engineer: Workspace database operations only
    if (policy.role === "database_engineer") {
      if (event.eventCategory !== "database") return false;
      if (context.workspaceId && event.workspaceId && event.workspaceId !== context.workspaceId) {
        return false;
      }
      return true;
    }

    // Owner, DBA, Auditor: Full read access
    return true;
  }

  /**
   * Enforces server-side authorization boundaries and returns sanitized query parameters.
   */
  public static enforceQueryScope(
    context: UserContext,
    params: Record<string, any>
  ): AuditQueryScope {
    const policy = this.resolvePolicy(context);
    const sanitized: AuditQueryScope["sanitizedParams"] = {
      ...params,
      organizationId: context.organizationId || params.organizationId || "",
    };

    let isOwnActivityOnly = false;
    let isDatabaseScopeOnly = false;
    let allowedCategories: string[] | undefined = undefined;

    // 1. Developer & Data Analyst: My Activity only
    if (!policy.canViewOrganization && !policy.canViewWorkspace) {
      isOwnActivityOnly = true;
      sanitized.actorEmail = context.email; // Force query to user's own email
    }

    // 2. Database Engineer: Authorized workspace database activity only
    if (policy.role === "database_engineer") {
      isDatabaseScopeOnly = true;
      allowedCategories = ["database"];
      sanitized.category = "database";

      if (!sanitized.workspaceId && context.workspaceId) {
        sanitized.workspaceId = context.workspaceId;
      }
    }

    return {
      policy,
      isOwnActivityOnly,
      isDatabaseScopeOnly,
      sanitizedParams: sanitized,
      allowedCategories,
    };
  }
}
