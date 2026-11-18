import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// 1. Users
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").default(true).notNull(),
    isEmailVerified: boolean("is_email_verified").default(false).notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    pendingOrganizationName: varchar("pending_organization_name", { length: 255 }),
    pendingInvitationId: uuid("pending_invitation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
  ]
);

// 2. Organizations
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("org_slug_idx").on(table.slug),
  ]
);

// 3. Organization Members
export const organizationMembers = pgTable(
  "organization_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).notNull().default("member"), // 'owner' | 'admin' | 'member'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("org_user_idx").on(table.organizationId, table.userId),
    index("org_member_user_idx").on(table.userId),
  ]
);

// 4. Invitations
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("member"),
    token: varchar("token", { length: 255 }).notNull().unique(),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // 'pending' | 'accepted' | 'expired' | 'revoked'
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("invitation_token_idx").on(table.token),
    index("invitation_org_idx").on(table.organizationId),
  ]
);

// 5. Workspaces
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    environment: varchar("environment", { length: 50 }).notNull().default("development"), // 'development' | 'staging' | 'production'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("org_workspace_slug_idx").on(table.organizationId, table.slug),
    index("workspace_org_idx").on(table.organizationId),
  ]
);

// 6. Workspace Members
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).notNull().default("developer"), // 'dba' | 'developer' | 'analyst' | 'engineer' | 'auditor'
    assignedBy: uuid("assigned_by")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_user_idx").on(table.workspaceId, table.userId),
    index("workspace_member_user_idx").on(table.userId),
    index("workspace_member_org_idx").on(table.organizationId),
  ]
);

// 7. Databases
export const databases = pgTable(
  "databases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    connectionStringEncrypted: text("connection_string_encrypted").notNull(),
    host: varchar("host", { length: 255 }),
    port: integer("port").default(5432),
    databaseName: varchar("database_name", { length: 255 }),
    username: varchar("username", { length: 255 }),
    sslMode: varchar("ssl_mode", { length: 50 }).default("require"),
    environment: varchar("environment", { length: 50 }).default("development"),
    status: varchar("status", { length: 50 }).default("active"), // 'active' | 'unreachable' | 'degraded'
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    isTemporalEnabled: boolean("is_temporal_enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("db_workspace_idx").on(table.workspaceId),
    index("db_organization_idx").on(table.organizationId),
  ]
);

// 8. Database Permissions (Granular grants)
export const databasePermissions = pgTable(
  "database_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).notNull(), // 'dba' | 'developer' | 'analyst' | 'engineer' | 'auditor'
    canRead: boolean("can_read").default(true).notNull(),
    canWrite: boolean("can_write").default(false).notNull(),
    canExecuteDdl: boolean("can_execute_ddl").default(false).notNull(),
    canRestore: boolean("can_restore").default(false).notNull(),
    canExplain: boolean("can_explain").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("db_perm_user_idx").on(table.databaseId, table.userId),
  ]
);

// 9. Saved Queries
export const savedQueries = pgTable(
  "saved_queries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    queryText: text("query_text").notNull(),
    description: text("description"),
    isShared: boolean("is_shared").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("saved_queries_workspace_idx").on(table.workspaceId),
    index("saved_queries_user_idx").on(table.userId),
  ]
);

// 9.5 Devices
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    deviceKeyHash: varchar("device_key_hash", { length: 255 }).notNull(),
    deviceName: varchar("device_name", { length: 255 }).notNull(),
    deviceType: varchar("device_type", { length: 50 }).notNull().default("unknown"),
    manufacturer: varchar("manufacturer", { length: 100 }),
    model: varchar("model", { length: 100 }),
    operatingSystem: varchar("operating_system", { length: 100 }).notNull(),
    operatingSystemVersion: varchar("operating_system_version", { length: 50 }),
    browser: varchar("browser", { length: 100 }).notNull(),
    browserVersion: varchar("browser_version", { length: 50 }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("device_user_key_idx").on(table.userId, table.deviceKeyHash),
    index("devices_user_idx").on(table.userId),
  ]
);

// 10. User Sessions
export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    country: varchar("country", { length: 100 }),
    region: varchar("region", { length: 100 }),
    city: varchar("city", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: varchar("revoke_reason", { length: 100 }),
  },
  (table) => [
    uniqueIndex("session_token_idx").on(table.tokenHash),
    index("session_user_idx").on(table.userId),
    index("session_device_idx").on(table.deviceId),
  ]
);

// 11. Audit Logs (Append-only)
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "set null" }),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "set null" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 255 }),
    action: varchar("action", { length: 100 }).notNull(),
    resourceType: varchar("resource_type", { length: 100 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    outcome: varchar("outcome", { length: 50 }).notNull().default("success"), // 'success' | 'failure' | 'denied'
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_org_idx").on(table.organizationId),
    index("audit_workspace_idx").on(table.workspaceId),
    index("audit_actor_idx").on(table.actorId),
    index("audit_created_idx").on(table.createdAt),
  ]
);

// 12. Notifications
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    type: varchar("type", { length: 50 }).notNull().default("info"), // 'info' | 'warning' | 'error' | 'success'
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
  ]
);

// 13. User Preferences
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    displayName: varchar("display_name", { length: 255 }),
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    dateFormat: varchar("date_format", { length: 50 }).notNull().default("YYYY-MM-DD"),
    timeFormat: varchar("time_format", { length: 50 }).notNull().default("12h"),
    language: varchar("language", { length: 50 }).notNull().default("en"),
    theme: varchar("theme", { length: 50 }).notNull().default("system"),
    sidebarPreference: varchar("sidebar_preference", { length: 50 }).notNull().default("expanded"),
    sqlFontSize: integer("sql_font_size").notNull().default(12),
    editorWordWrap: boolean("editor_word_wrap").notNull().default(true),
    editorLineNumbers: boolean("editor_line_numbers").notNull().default(true),
    editorMinimap: boolean("editor_minimap").notNull().default(false),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_preferences_user_idx").on(table.userId),
  ]
);

// 13.5 Email Verification Tokens
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_verification_token_idx").on(table.tokenHash),
    index("email_verification_user_idx").on(table.userId),
    index("email_verification_email_idx").on(table.email),
  ]
);

// 14. Password Reset Tokens
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_token_idx").on(table.tokenHash),
    index("password_reset_user_idx").on(table.userId),
  ]
);

// Relations definitions
export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(organizationMembers),
  workspaceMemberships: many(workspaceMembers),
  sessions: many(userSessions),
  devices: many(devices),
  savedQueries: many(savedQueries),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  user: one(users, {
    fields: [devices.userId],
    references: [users.id],
  }),
  sessions: many(userSessions),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
  device: one(devices, {
    fields: [userSessions.deviceId],
    references: [devices.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  workspaces: many(workspaces),
  databases: many(databases),
  invitations: many(invitations),
  auditLogs: many(auditLogs),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  members: many(workspaceMembers),
  databases: many(databases),
}));

export const databasesRelations = relations(databases, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [databases.workspaceId],
    references: [workspaces.id],
  }),
  organization: one(organizations, {
    fields: [databases.organizationId],
    references: [organizations.id],
  }),
  permissions: many(databasePermissions),
  savedQueries: many(savedQueries),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [workspaceMembers.organizationId],
    references: [organizations.id],
  }),
  assignedByUser: one(users, {
    fields: [workspaceMembers.assignedBy],
    references: [users.id],
  }),
}));

