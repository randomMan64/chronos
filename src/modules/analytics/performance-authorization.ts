import { ChronosRole, normalizeRole } from "@/lib/permissions/roles";
import { UserContext } from "@/lib/permissions/types";

export interface PerformanceRolePolicy {
  role: ChronosRole;
  label: string;
  canViewOverview: boolean;
  canViewQueryStats: boolean;
  canInspectQuery: boolean;
  canExplain: boolean;
  canExplainAnalyze: boolean;
  canViewIndexStats: boolean;
  canViewTableStats: boolean;
  canViewLiveSessions: boolean;
  canViewLocks: boolean;
  canViewRecommendations: boolean;
  canExport: boolean;
  canReadSensitiveQuery: boolean;
  canTerminateSession: boolean;
  canExecuteMaintenance: boolean;
  isOwnQueryOnly: boolean;
}

/**
 * Authoritative default Policy Matrix for Query Analyzer across the six CHRONOS roles.
 */
export const PERFORMANCE_ROLE_POLICIES: Record<ChronosRole, PerformanceRolePolicy> = {
  owner: {
    role: "owner",
    label: "Owner",
    canViewOverview: true,
    canViewQueryStats: true,
    canInspectQuery: true,
    canExplain: true,
    canExplainAnalyze: true,
    canViewIndexStats: true,
    canViewTableStats: true,
    canViewLiveSessions: true,
    canViewLocks: true,
    canViewRecommendations: true,
    canExport: true,
    canReadSensitiveQuery: true,
    canTerminateSession: true,
    canExecuteMaintenance: false, // PostgreSQL superuser separation
    isOwnQueryOnly: false,
  },
  dba: {
    role: "dba",
    label: "DBA",
    canViewOverview: true,
    canViewQueryStats: true,
    canInspectQuery: true,
    canExplain: true,
    canExplainAnalyze: true,
    canViewIndexStats: true,
    canViewTableStats: true,
    canViewLiveSessions: true,
    canViewLocks: true,
    canViewRecommendations: true,
    canExport: true,
    canReadSensitiveQuery: true,
    canTerminateSession: true,
    canExecuteMaintenance: true,
    isOwnQueryOnly: false,
  },
  database_engineer: {
    role: "database_engineer",
    label: "Database Engineer",
    canViewOverview: true,
    canViewQueryStats: true,
    canInspectQuery: true,
    canExplain: true,
    canExplainAnalyze: true,
    canViewIndexStats: true,
    canViewTableStats: true,
    canViewLiveSessions: true,
    canViewLocks: true,
    canViewRecommendations: true,
    canExport: true,
    canReadSensitiveQuery: true,
    canTerminateSession: false, // Requires explicit permission
    canExecuteMaintenance: false,
    isOwnQueryOnly: false,
  },
  developer: {
    role: "developer",
    label: "Developer",
    canViewOverview: true,
    canViewQueryStats: true,
    canInspectQuery: true,
    canExplain: true,
    canExplainAnalyze: true, // With safeguards and explicit action
    canViewIndexStats: true,
    canViewTableStats: true,
    canViewLiveSessions: false,
    canViewLocks: false,
    canViewRecommendations: true,
    canExport: false,
    canReadSensitiveQuery: false,
    canTerminateSession: false,
    canExecuteMaintenance: false,
    isOwnQueryOnly: false,
  },
  data_analyst: {
    role: "data_analyst",
    label: "Data Analyst",
    canViewOverview: true,
    canViewQueryStats: true, // Own query activity
    canInspectQuery: false,
    canExplain: false,
    canExplainAnalyze: false,
    canViewIndexStats: true,
    canViewTableStats: true,
    canViewLiveSessions: false,
    canViewLocks: false,
    canViewRecommendations: false,
    canExport: false,
    canReadSensitiveQuery: false,
    canTerminateSession: false,
    canExecuteMaintenance: false,
    isOwnQueryOnly: true,
  },
  auditor: {
    role: "auditor",
    label: "Auditor",
    canViewOverview: true,
    canViewQueryStats: true,
    canInspectQuery: false,
    canExplain: false,
    canExplainAnalyze: false,
    canViewIndexStats: false,
    canViewTableStats: false,
    canViewLiveSessions: false,
    canViewLocks: false,
    canViewRecommendations: false,
    canExport: true,
    canReadSensitiveQuery: false,
    canTerminateSession: false,
    canExecuteMaintenance: false,
    isOwnQueryOnly: false,
  },
};

export class PerformanceAuthorization {
  public static resolveRole(context: UserContext): ChronosRole {
    if (context.organizationRole === "owner") return "owner";
    return normalizeRole(context.workspaceRole || context.organizationRole || "developer");
  }

  public static resolvePolicy(context: UserContext): PerformanceRolePolicy {
    const role = this.resolveRole(context);
    const base = { ...PERFORMANCE_ROLE_POLICIES[role] };

    // Respect explicit IAM overrides if granted
    if (context.effectivePermissions) {
      if (context.effectivePermissions.has("performance:session_terminate")) {
        base.canTerminateSession = true;
      }
      if (context.effectivePermissions.has("performance:maintenance")) {
        base.canExecuteMaintenance = true;
      }
      if (context.effectivePermissions.has("performance:export")) {
        base.canExport = true;
      }
      if (context.effectivePermissions.has("performance:explain_analyze") && role !== "data_analyst" && role !== "auditor") {
        base.canExplainAnalyze = true;
      }
      if (context.effectivePermissions.has("performance:sensitive_query_read")) {
        base.canReadSensitiveQuery = true;
      }
    }

    // Strict security assertions: Auditor and Data Analyst can NEVER execute EXPLAIN ANALYZE or terminate sessions
    if (role === "auditor" || role === "data_analyst") {
      base.canExplainAnalyze = false;
      base.canTerminateSession = false;
      base.canExecuteMaintenance = false;
    }

    return base;
  }

  public static canViewOverview(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewOverview;
  }

  public static canViewQueryStats(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewQueryStats;
  }

  public static canInspectQuery(context: UserContext): boolean {
    return this.resolvePolicy(context).canInspectQuery;
  }

  public static canExplain(context: UserContext): boolean {
    return this.resolvePolicy(context).canExplain;
  }

  public static canExplainAnalyze(context: UserContext): boolean {
    return this.resolvePolicy(context).canExplainAnalyze;
  }

  public static canViewIndexStats(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewIndexStats;
  }

  public static canViewTableStats(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewTableStats;
  }

  public static canViewLiveSessions(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewLiveSessions;
  }

  public static canViewLocks(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewLocks;
  }

  public static canViewRecommendations(context: UserContext): boolean {
    return this.resolvePolicy(context).canViewRecommendations;
  }

  public static canExport(context: UserContext): boolean {
    return this.resolvePolicy(context).canExport;
  }

  public static canTerminateSession(context: UserContext): boolean {
    return this.resolvePolicy(context).canTerminateSession;
  }

  /**
   * Safely masks sensitive query parameters/literals for unauthorized users.
   */
  public static maskSensitiveQuery(
    queryText: string,
    context: UserContext,
    queryUserId?: string | null
  ): string {
    const policy = this.resolvePolicy(context);
    if (policy.canReadSensitiveQuery) return queryText;
    if (queryUserId && queryUserId === context.userId) return queryText;

    // Mask string literals '...' and numeric constants
    return queryText
      .replace(/'(?:[^'\\]|\\.)*'/g, "'***'")
      .replace(/\b\d+\b/g, "***");
  }
}
