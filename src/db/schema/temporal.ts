import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  bigint,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { databases, workspaces, users } from "./control-plane";

// 1. Temporal Tables Config (which tables in a registered DB have temporal triggers installed)
export const temporalTables = pgTable(
  "temporal_tables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    schemaName: varchar("schema_name", { length: 128 }).notNull().default("public"),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    triggerName: varchar("trigger_name", { length: 128 }).notNull(),
    retentionDays: integer("retention_days").default(90).notNull(),
    capturedOperations: varchar("captured_operations", { length: 64 }).default("INSERT,UPDATE,DELETE").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("temporal_db_table_idx").on(table.databaseId, table.schemaName, table.tableName),
    index("temporal_db_idx").on(table.databaseId),
  ]
);

// 2. Row Versions (Historical snapshots of individual rows)
export const rowVersions = pgTable(
  "row_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    schemaName: varchar("schema_name", { length: 128 }).notNull().default("public"),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    recordId: varchar("record_id", { length: 255 }).notNull(),
    operation: varchar("operation", { length: 20 }).notNull(), // 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE'
    oldData: jsonb("old_data").$type<Record<string, unknown> | null>(),
    newData: jsonb("new_data").$type<Record<string, unknown> | null>(),
    diff: jsonb("diff").$type<{
      added?: Record<string, unknown>;
      removed?: Record<string, unknown>;
      modified?: Record<string, { old: unknown; new: unknown }>;
    }>(),
    versionNumber: integer("version_number").notNull().default(1),
    transactionId: varchar("transaction_id", { length: 64 }),
    changedBy: varchar("changed_by", { length: 255 }).notNull().default("system"),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("row_version_lookup_idx").on(table.databaseId, table.schemaName, table.tableName, table.recordId),
    index("row_version_time_idx").on(table.changedAt),
    index("row_version_tx_idx").on(table.transactionId),
  ]
);

// 3. Change Events (Raw stream for audits and event sourcing)
export const changeEvents = pgTable(
  "change_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    schemaName: varchar("schema_name", { length: 128 }).notNull(),
    tableName: varchar("table_name", { length: 128 }).notNull(),
    recordId: varchar("record_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("change_event_db_table_idx").on(table.databaseId, table.tableName),
    index("change_event_created_idx").on(table.createdAt),
  ]
);

// 4. Transaction Events (Transaction Inspector tracking)
export const transactionEvents = pgTable(
  "transaction_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    transactionId: varchar("transaction_id", { length: 64 }).notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorEmail: varchar("actor_email", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("started"), // 'started' | 'committed' | 'rolled_back' | 'failed' | 'unknown'
    queryText: text("query_text"),
    durationMs: integer("duration_ms").default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  },
  (table) => [
    index("tx_event_db_idx").on(table.databaseId),
    index("tx_event_tx_id_idx").on(table.transactionId),
    index("tx_event_time_idx").on(table.startedAt),
  ]
);

// 5. Query Executions (Query Analyzer & Performance metrics)
export const queryExecutions = pgTable(
  "query_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "set null" }),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "set null" }),
    queryText: text("query_text").notNull(),
    durationMs: integer("duration_ms").notNull(),
    rowCount: integer("row_count").default(0),
    status: varchar("status", { length: 50 }).notNull().default("success"), // 'success' | 'error'
    errorMessage: text("error_message"),
    explainPlan: jsonb("explain_plan").$type<Record<string, unknown> | null>(),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("query_exec_db_idx").on(table.databaseId),
    index("query_exec_user_idx").on(table.userId),
    index("query_exec_time_idx").on(table.executedAt),
  ]
);

// 6. Snapshots / Backups metadata (Backup Center & Recovery)
export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    databaseId: uuid("database_id")
      .references(() => databases.id, { onDelete: "cascade" })
      .notNull(),
    snapshotType: varchar("snapshot_type", { length: 50 }).notNull().default("manual"), // 'manual' | 'daily' | 'pitr_point'
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("completed"), // 'pending' | 'in_progress' | 'completed' | 'failed'
    recoveryPoint: timestamp("recovery_point", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("snapshots_db_idx").on(table.databaseId),
    index("snapshots_created_idx").on(table.createdAt),
  ]
);

// Relations
export const temporalTablesRelations = relations(temporalTables, ({ one }) => ({
  database: one(databases, {
    fields: [temporalTables.databaseId],
    references: [databases.id],
  }),
}));

export const rowVersionsRelations = relations(rowVersions, ({ one }) => ({
  database: one(databases, {
    fields: [rowVersions.databaseId],
    references: [databases.id],
  }),
}));

