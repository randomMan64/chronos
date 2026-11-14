import { pool } from "./connections/control-plane";

export const CONTROL_PLANE_SCHEMA_SQL = `
-- CHRONOS PostgreSQL Control Plane & Temporal Schema

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Organization Members
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_user_unique UNIQUE (organization_id, user_id)
);

-- 4. Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  environment VARCHAR(50) NOT NULL DEFAULT 'development',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_workspace_unique UNIQUE (organization_id, slug)
);

-- 6. Workspace Members
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'developer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_user_unique UNIQUE (workspace_id, user_id)
);

-- 7. Databases
CREATE TABLE IF NOT EXISTS databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  connection_string_encrypted TEXT NOT NULL,
  host VARCHAR(255),
  port INTEGER DEFAULT 5432,
  database_name VARCHAR(255),
  username VARCHAR(255),
  ssl_mode VARCHAR(50) DEFAULT 'require',
  environment VARCHAR(50) DEFAULT 'development',
  status VARCHAR(50) DEFAULT 'active',
  last_tested_at TIMESTAMPTZ,
  is_temporal_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Database Permissions
CREATE TABLE IF NOT EXISTS database_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_execute_ddl BOOLEAN NOT NULL DEFAULT false,
  can_restore BOOLEAN NOT NULL DEFAULT false,
  can_explain BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT db_user_perm_unique UNIQUE (database_id, user_id)
);

-- 9. Saved Queries
CREATE TABLE IF NOT EXISTS saved_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  query_text TEXT NOT NULL,
  description TEXT,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Audit Logs (Append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  database_id UUID REFERENCES databases(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  outcome VARCHAR(50) NOT NULL DEFAULT 'success',
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. User Preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  date_format VARCHAR(50) NOT NULL DEFAULT 'YYYY-MM-DD',
  time_format VARCHAR(50) NOT NULL DEFAULT '12h',
  language VARCHAR(50) NOT NULL DEFAULT 'en',
  theme VARCHAR(50) NOT NULL DEFAULT 'system',
  sidebar_preference VARCHAR(50) NOT NULL DEFAULT 'expanded',
  sql_font_size INTEGER NOT NULL DEFAULT 12,
  editor_word_wrap BOOLEAN NOT NULL DEFAULT true,
  editor_line_numbers BOOLEAN NOT NULL DEFAULT true,
  editor_minimap BOOLEAN NOT NULL DEFAULT false,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_preferences_user_unique UNIQUE (user_id)
);

-- 14. Temporal Tables Metadata
CREATE TABLE IF NOT EXISTS temporal_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  schema_name VARCHAR(128) NOT NULL DEFAULT 'public',
  table_name VARCHAR(128) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_name VARCHAR(128) NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 90,
  captured_operations VARCHAR(64) NOT NULL DEFAULT 'INSERT,UPDATE,DELETE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT temporal_db_table_unique UNIQUE (database_id, schema_name, table_name)
);

-- 14. Row Versions (Historical Versions)
CREATE TABLE IF NOT EXISTS row_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  schema_name VARCHAR(128) NOT NULL DEFAULT 'public',
  table_name VARCHAR(128) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  diff JSONB,
  version_number INTEGER NOT NULL DEFAULT 1,
  transaction_id VARCHAR(64),
  changed_by VARCHAR(255) NOT NULL DEFAULT 'system',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Change Events
CREATE TABLE IF NOT EXISTS change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  schema_name VARCHAR(128) NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Transaction Events
CREATE TABLE IF NOT EXISTS transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  transaction_id VARCHAR(64) NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'started',
  query_text TEXT,
  duration_ms INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 17. Query Executions
CREATE TABLE IF NOT EXISTS query_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  query_text TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  row_count INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'success',
  error_message TEXT,
  explain_plan JSONB,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Snapshots
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  snapshot_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  recovery_point TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_org_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_row_versions_lookup ON row_versions(database_id, schema_name, table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_row_versions_time ON row_versions(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_exec_db ON query_executions(database_id, executed_at DESC);
`;

export async function initializeDatabase(): Promise<{ success: boolean; message: string }> {
  try {
    const client = await pool.connect();
    try {
      await client.query(CONTROL_PLANE_SCHEMA_SQL);
      return { success: true, message: "Control plane database schema initialized successfully." };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("Database initialization failed:", error);
    return { success: false, message: error };
  }
}

