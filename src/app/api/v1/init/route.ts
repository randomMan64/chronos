import { NextResponse } from "next/server";
import { checkControlPlaneHealth, pool } from "@/db/connections/control-plane";
import { initializeDatabase } from "@/db/init";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkControlPlaneHealth();

  let tablesCount = 0;
  let userCount = 0;

  if (health.ok) {
    try {
      const client = await pool.connect();
      try {
        const tRes = await client.query(`
          SELECT COUNT(*) 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name IN ('users', 'organizations', 'workspaces', 'databases', 'row_versions', 'audit_logs');
        `);
        tablesCount = parseInt(tRes.rows[0].count, 10);

        if (tablesCount > 0) {
          const uRes = await client.query("SELECT COUNT(*) FROM users;");
          userCount = parseInt(uRes.rows[0].count, 10);
        }
      } finally {
        client.release();
      }
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    status: health.ok ? "connected" : "unreachable",
    latencyMs: health.latencyMs,
    tablesConfigured: tablesCount >= 6,
    activeUsersCount: userCount,
    message: health.ok
      ? tablesCount >= 6
        ? "Control plane database is fully initialized."
        : "Database is connected but tables need to be created. Send POST /api/v1/init to initialize."
      : health.message,
  });
}

export async function POST() {
  const initResult = await initializeDatabase();

  if (!initResult.success) {
    return NextResponse.json(
      { error: "Initialization failed", details: initResult.message },
      { status: 500 }
    );
  }

  // Seed default owner if no users exist
  const client = await pool.connect();
  let defaultCredentials = null;
  try {
    const userCheck = await client.query("SELECT COUNT(*) FROM users;");
    const count = parseInt(userCheck.rows[0].count, 10);

    if (count === 0) {
      const passwordHash = await bcrypt.hash("Admin1234!", 12);
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const wsId = crypto.randomUUID();

      await client.query(
        `INSERT INTO users (id, email, password_hash, full_name, is_active)
         VALUES ($1, $2, $3, $4, true);`,
        [userId, "admin@chronos.internal", passwordHash, "System Administrator"]
      );

      await client.query(
        `INSERT INTO organizations (id, name, slug)
         VALUES ($1, $2, $3);`,
        [orgId, "Acme Enterprise", "acme-enterprise"]
      );

      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'owner');`,
        [orgId, userId]
      );

      await client.query(
        `INSERT INTO workspaces (id, organization_id, name, slug, environment)
         VALUES ($1, $2, 'Primary Cluster', 'primary', 'production');`,
        [wsId, orgId]
      );

      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'dba');`,
        [wsId, userId]
      );

      defaultCredentials = {
        email: "admin@chronos.internal",
        password: "Admin1234!",
        organization: "Acme Enterprise",
        role: "owner",
      };
    }
  } finally {
    client.release();
  }

  return NextResponse.json({
    success: true,
    message: "CHRONOS database schema and tables initialized successfully.",
    defaultCredentials,
  });
}

