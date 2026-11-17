export type ChronosRole =
  | "owner"
  | "dba"
  | "developer"
  | "data_analyst"
  | "database_engineer"
  | "auditor";

export interface RoleDefinition {
  key: ChronosRole;
  label: string;
  description: string;
  hierarchy: number;
  category: "admin" | "technical" | "compliance";
}

export const ROLE_HIERARCHY: Record<ChronosRole, number> = {
  owner: 100,
  dba: 80,
  database_engineer: 70,
  developer: 60,
  data_analyst: 50,
  auditor: 40,
};

export const CHRONOS_ROLES: Record<ChronosRole, RoleDefinition> = {
  owner: {
    key: "owner",
    label: "Owner",
    description: "Full organization administration, workspace governance, and billing authority.",
    hierarchy: 100,
    category: "admin",
  },
  dba: {
    key: "dba",
    label: "DBA",
    description: "Database administration, schema migrations, backup/restore, and retention management.",
    hierarchy: 80,
    category: "technical",
  },
  database_engineer: {
    key: "database_engineer",
    label: "Database Engineer",
    description: "Performance diagnostics, EXPLAIN ANALYZE, transaction inspection, and monitoring.",
    hierarchy: 70,
    category: "technical",
  },
  developer: {
    key: "developer",
    label: "Developer",
    description: "Application development, read/write SQL queries, and history investigation.",
    hierarchy: 60,
    category: "technical",
  },
  data_analyst: {
    key: "data_analyst",
    label: "Data Analyst",
    description: "Read-only SQL queries, analytical exports, and schema discovery. No write operations.",
    hierarchy: 50,
    category: "technical",
  },
  auditor: {
    key: "auditor",
    label: "Auditor",
    description: "Read-only security audit log inspection, compliance reporting, and export.",
    hierarchy: 40,
    category: "compliance",
  },
};

export const CHRONOS_ROLE_KEYS: ChronosRole[] = [
  "owner",
  "dba",
  "database_engineer",
  "developer",
  "data_analyst",
  "auditor",
];

export function isChronosRole(val: any): val is ChronosRole {
  return typeof val === "string" && CHRONOS_ROLE_KEYS.includes(val as ChronosRole);
}

/**
 * Normalizes any legacy or variant role string to an authoritative ChronosRole.
 */
export function normalizeRole(role: string | undefined | null): ChronosRole {
  if (!role) return "developer";
  const normalized = role.trim().toLowerCase();

  switch (normalized) {
    case "owner":
      return "owner";
    case "dba":
      return "dba";
    case "database_engineer":
    case "engineer":
    case "db_engineer":
      return "database_engineer";
    case "developer":
    case "dev":
      return "developer";
    case "data_analyst":
    case "analyst":
      return "data_analyst";
    case "auditor":
    case "audit":
      return "auditor";
    // Legacy organization roles
    case "admin":
      return "dba";
    case "member":
      return "developer";
    default:
      return "developer";
  }
}

/**
 * Checks whether an actor with actorRole is permitted to assign or invite targetRole.
 * Rules:
 * 1. Only an Owner can assign or invite an Owner.
 * 2. An inviter / manager cannot assign permissions greater than their own hierarchy level.
 */
export function canAssignRole(
  actorRoleRaw: string | undefined | null,
  targetRoleRaw: string | undefined | null
): boolean {
  if (!actorRoleRaw || !targetRoleRaw) return false;
  const actorRole = normalizeRole(actorRoleRaw);
  const targetRole = normalizeRole(targetRoleRaw);

  // Only Owner can assign or invite another Owner
  if (targetRole === "owner") {
    return actorRole === "owner";
  }

  const actorLevel = ROLE_HIERARCHY[actorRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 0;

  return actorLevel >= targetLevel;
}

/**
 * Returns the list of roles the actor is authorized to assign or select.
 * @param actorRoleRaw The role of the currently acting user.
 * @param options.allowOwner Whether to include "owner" (e.g. for invitations if actor is owner, vs member management where transfer ownership is required).
 */
export function getAssignableRoles(
  actorRoleRaw: string | undefined | null,
  options?: { allowOwner?: boolean }
): ChronosRole[] {
  if (!actorRoleRaw) return [];
  const actorRole = normalizeRole(actorRoleRaw);
  const actorLevel = ROLE_HIERARCHY[actorRole] ?? 0;
  const allowOwner = options?.allowOwner ?? false;

  return CHRONOS_ROLE_KEYS.filter((role) => {
    if (role === "owner") {
      return allowOwner && actorRole === "owner";
    }
    return actorLevel >= (ROLE_HIERARCHY[role] ?? 0);
  });
}
