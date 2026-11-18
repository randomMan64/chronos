import { z } from "zod";

// Auth
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
  organizationName: z.string().min(2, "Organization name is required").optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z
    .enum([
      "owner",
      "dba",
      "developer",
      "data_analyst",
      "database_engineer",
      "auditor",
      "admin",
      "member",
    ])
    .default("developer"),
});

export const transferOwnershipSchema = z.object({
  newOwnerMemberId: z.string().uuid("Invalid member ID"),
  confirmationPhrase: z.string().refine((val): val is string => val === "TRANSFER_OWNERSHIP", {
    message: 'Type "TRANSFER_OWNERSHIP" to confirm',
  }),
  previousOwnerNewRole: z
    .enum([
      "dba",
      "developer",
      "data_analyst",
      "database_engineer",
      "auditor",
      "admin",
      "member",
    ])
    .default("dba"),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required for re-authentication"),
  confirmationPhrase: z.string().refine((val): val is string => val === "DELETE", {
    message: 'Type "DELETE" to confirm account deletion',
  }),
});

export const deleteOrganizationSchema = z.object({
  password: z.string().min(1, "Password is required for re-authentication"),
  confirmOrgName: z.string().min(1, "Organization name is required to confirm"),
});

// Organizations & Workspaces
export const createOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase alphanumeric characters and hyphens")
    .optional(),
});

export const createWorkspaceSchema = z.object({
  organizationId: z.string().uuid("Invalid organization ID"),
  name: z.string().min(2, "Workspace name is required"),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase alphanumeric characters and hyphens")
    .optional(),
  environment: z.enum(["development", "staging", "production"]).default("development"),
});

// Database Registry
export const registerDatabaseSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(2, "Database identifier name is required"),
  connectionString: z.string().min(10, "Valid PostgreSQL connection string required"),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  isTemporalEnabled: z.boolean().default(true),
});

export const testDatabaseSchema = z.object({
  connectionString: z.string().min(10, "Valid connection string required"),
});

// SQL Execution
export const executeSqlSchema = z.object({
  databaseId: z.string().uuid("Invalid database ID"),
  workspaceId: z.string().uuid("Invalid workspace ID").optional(),
  organizationId: z.string().uuid("Invalid organization ID").optional(),
  sql: z.string().min(1, "SQL statement is required"),
  isReadOnly: z.boolean().optional(),
  maxRows: z.number().int().min(1).max(5000).default(1000),
  timeoutMs: z.number().int().min(1000).max(60000).default(30000),
});

export const explainSqlSchema = z.object({
  databaseId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  sql: z.string().min(1),
  analyze: z.boolean().default(false),
});

// Temporal & History
export const timeTravelQuerySchema = z.object({
  databaseId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  organizationId: z.string().uuid(),
  schemaName: z.string().default("public"),
  tableName: z.string().min(1),
  asOfTimestamp: z.string().datetime(),
  recordId: z.string().optional(),
  page: z.number().int().min(1).default(1).optional(),
  pageSize: z.number().int().min(1).max(100).default(25).optional(),
});

export const compareVersionsSchema = z.object({
  databaseId: z.string().uuid(),
  versionIdA: z.string().uuid(),
  versionIdB: z.string().uuid(),
});

export const restoreRecordSchema = z.object({
  databaseId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  organizationId: z.string().uuid(),
  versionId: z.string().uuid(),
  reason: z.string().min(3, "Restoration reason is required for audit trails"),
});

// Audit
export const auditFilterSchema = z.object({
  organizationId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
  databaseId: z.string().uuid().optional(),
  category: z.string().optional(),
  action: z.string().optional(),
  outcome: z.string().optional(),
  severity: z.string().optional(),
  actorEmail: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  ipAddress: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timeRange: z.string().optional(),
  sortBy: z.enum(["createdAt", "action", "outcome", "severity"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const updateAlertStatusSchema = z.object({
  status: z.enum(["open", "investigating", "resolved"]),
});

