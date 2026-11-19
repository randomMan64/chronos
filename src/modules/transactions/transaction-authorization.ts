import { ChronosRole, normalizeRole } from "@/lib/permissions/roles";
import { UserContext } from "@/lib/permissions/types";

export interface TransactionRolePolicy {
  role: ChronosRole;
  label: string;
  canViewOverview: boolean;
  canViewHistory: boolean;
  canInspectDetails: boolean;
  canViewStatements: boolean;
  canViewMutations: boolean;
  canViewLiveLocks: boolean;
  canViewLiveSessions: boolean;
  canExport: boolean;
  canReadSensitiveSql: boolean;
  canTerminateSession: boolean;
  isOwnOnly: boolean;
}

/**
 * Authoritative default Policy Matrix for Transaction Inspector across the six CHRONOS roles.
 */
export const TRANSACTION_ROLE_POLICIES: Record<ChronosRole, TransactionRolePolicy> = {
  owner: {
    role: "owner",
    label: "Owner",
    canViewOverview: true,
    canViewHistory: true,
    canInspectDetails: true,
    canViewStatements: true,
    canViewMutations: true,
    canViewLiveLocks: true,
    canViewLiveSessions: true,
    canExport: true,
    canReadSensitiveSql: true,
    canTerminateSession: true,
    isOwnOnly: false,
  },
  dba: {
    role: "dba",
    label: "DBA",
    canViewOverview: true,
    canViewHistory: true,
    canInspectDetails: true,
    canViewStatements: true,
    canViewMutations: true,
    canViewLiveLocks: true,
    canViewLiveSessions: true,
    canExport: true,
    canReadSensitiveSql: true,
    canTerminateSession: true,
    isOwnOnly: false,
  },
  database_engineer: {
    role: "database_engineer",
    label: "Database Engineer",
    canViewOverview: true,
    canViewHistory: true,
    canInspectDetails: true,
    canViewStatements: true,
    canViewMutations: true,
    canViewLiveLocks: true,
    canViewLiveSessions: true,
    canExport: true,
    canReadSensitiveSql: true,
    canTerminateSession: false, // Explicit override only
    isOwnOnly: false,
  },
  developer: {
    role: "developer",
    label: "Developer",
    canViewOverview: true,
    canViewHistory: true,
    canInspectDetails: true,
    canViewStatements: true,
    canViewMutations: true,
    canViewLiveLocks: false,
    canViewLiveSessions: false,
    canExport: false,
    canReadSensitiveSql: false, // Masks other users' queries unless own
    canTerminateSession: false,
    isOwnOnly: false,
  },
  data_analyst: {
    role: "data_analyst",
    label: "Data Analyst",
    canViewOverview: true,
    canViewHistory: true,
    canInspectDetails: true,
    canViewStatements: true,
    canViewMutations: false,
    canViewLiveLocks: false,
    canViewLiveSessions: false,
    canExport: false,
    canReadSensitiveSql: false,
    canTerminateSession: false,
    isOwnOnly: true, // Restricted to own queries only
  },
  auditor: {
    role: "auditor",
    label: "Auditor",
    canViewOverview: true,
    canViewHistory: true,
    canInspectDetails: true,
    canViewStatements: true,
    canViewMutations: true,
    canViewLiveLocks: false,
    canViewLiveSessions: false,
    canExport: true,
    canReadSensitiveSql: false, // Sensitive SQL masked by default
    canTerminateSession: false,
    isOwnOnly: false,
  },
};

export class TransactionAuthorization {
  /**
   * Resolves effective transaction policy considering role and explicit permission overrides.
   */
  public static resolvePolicy(context: UserContext): TransactionRolePolicy {
    const rawRole = context.workspaceRole || context.organizationRole || "developer";
    const role = normalizeRole(rawRole);
    const basePolicy = TRANSACTION_ROLE_POLICIES[role] || TRANSACTION_ROLE_POLICIES.developer;

    const perms = context.effectivePermissions || new Set();

    // Clone base policy
    const effective: TransactionRolePolicy = { ...basePolicy };

    // Apply explicit IAM overrides
    if (perms.has("transaction:read_all")) {
      effective.isOwnOnly = false;
    }
    if (perms.has("transaction:sensitive_sql_read")) {
      effective.canReadSensitiveSql = true;
    }
    if (perms.has("transaction:lock_inspect")) {
      effective.canViewLiveLocks = true;
    }
    if (perms.has("transaction:live_monitor")) {
      effective.canViewLiveSessions = true;
    }
    if (perms.has("transaction:export")) {
      effective.canExport = true;
    }
    if (perms.has("transaction:mutation_read")) {
      effective.canViewMutations = true;
    }

    // Session termination overrides: strictly disallowed for Auditor and Data Analyst
    if (role === "auditor" || role === "data_analyst") {
      effective.canTerminateSession = false;
    } else if (perms.has("transaction:session_terminate")) {
      effective.canTerminateSession = true;
    }

    return effective;
  }

  /**
   * Masks sensitive SQL string literals and constants for roles without transaction:sensitive_sql_read.
   */
  public static maskSensitiveSql(
    sql: string | null | undefined,
    context: UserContext,
    txActorId?: string | null
  ): string {
    if (!sql) return "";

    const policy = this.resolvePolicy(context);

    // If caller has explicit permission to read sensitive SQL, return intact
    if (policy.canReadSensitiveSql) return sql;

    // Users are always authorized to inspect their own full SQL queries
    if (txActorId && context.userId === txActorId) return sql;

    // Mask single-quoted string literals: 'password123' -> '***'
    let masked = sql.replace(/'(?:[^'\\]|\\.)*'/g, "'***'");

    // Mask standalone numeric literals in comparisons or assignments
    masked = masked.replace(/([=><]\s*)\b\d+\b/g, "$1***");

    return masked;
  }
}
