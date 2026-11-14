import fs from "fs";
import path from "path";

// Auto-load .env.local and .env
const envLocal = path.resolve(process.cwd(), ".env.local");
const envDefault = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envLocal) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envLocal);
} else if (fs.existsSync(envDefault) && typeof (process as any).loadEnvFile === "function") {
  (process as any).loadEnvFile(envDefault);
}

import { pool, checkControlPlaneHealth } from "../src/db/connections/control-plane";
import { CONTROL_PLANE_SCHEMA_SQL } from "../src/db/init";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function run() {
  console.log("=================================================");
  console.log("  CHRONOS — Database Schema Initialization & Seed ");
  console.log("=================================================");

  const dbUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("password@ep-sample")) {
    console.log("⚠️  NOTICE: DATABASE_URL is set to a placeholder or is not yet configured.");
    console.log("To connect to your live Neon PostgreSQL database:");
    console.log("1. Open .env.local in your project root.");
    console.log("2. Set DATABASE_URL to your Neon connection string:");
    console.log('   DATABASE_URL="postgres://user:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"');
    console.log("3. Re-run: npm run db:init\n");
    console.log("Note: You can still run the web application in local development mode using:");
    console.log("   npm run dev\n");
    process.exit(0);
  }

  // 1. Health check
  console.log("\n[1/3] Testing PostgreSQL connection...");
  const health = await checkControlPlaneHealth();
  if (!health.ok) {
    console.error(`❌ Connection failed: ${health.message}`);
    console.log("\nTips:");
    console.log("- Verify your Neon credentials in .env.local");
    console.log("- Ensure your IP or network can reach the Neon endpoint");
    process.exit(1);
  }
  console.log(`✓ Connected to PostgreSQL in ${health.latencyMs}ms`);

  // 2. Execute DDL Schema
  console.log("\n[2/3] Creating Control Plane & Temporal Tables...");
  const client = await pool.connect();
  try {
    await client.query(CONTROL_PLANE_SCHEMA_SQL);
    console.log("✓ All 18 control-plane & temporal tables created successfully (or already exist).");

    // 3. Seed Initial Administrator Account if users table is empty
    console.log("\n[3/3] Checking initial administrator account...");
    const userCheck = await client.query("SELECT COUNT(*) FROM users;");
    const userCount = parseInt(userCheck.rows[0].count, 10);

    if (userCount === 0) {
      console.log("Seeding default Administrator and Organization...");
      const passwordHash = await bcrypt.hash("Admin1234!", 12);
      const userId = crypto.randomUUID();
      const orgId = crypto.randomUUID();
      const wsId = crypto.randomUUID();

      // Insert User
      await client.query(
        `INSERT INTO users (id, email, password_hash, full_name, is_active)
         VALUES ($1, $2, $3, $4, true);`,
        [userId, "admin@chronos.internal", passwordHash, "System Administrator"]
      );

      // Insert Organization
      await client.query(
        `INSERT INTO organizations (id, name, slug)
         VALUES ($1, $2, $3);`,
        [orgId, "Acme Enterprise", "acme-enterprise"]
      );

      // Insert Organization Member as Owner
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role)
         VALUES ($1, $2, 'owner');`,
        [orgId, userId]
      );

      // Insert Primary Workspace
      await client.query(
        `INSERT INTO workspaces (id, organization_id, name, slug, environment)
         VALUES ($1, $2, 'Primary Cluster', 'primary', 'production');`,
        [wsId, orgId]
      );

      // Insert Workspace Member as DBA
      await client.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role)
         VALUES ($1, $2, 'dba');`,
        [wsId, userId]
      );

      console.log("✓ Initial Owner account created successfully:");
      console.log("  • Email:    admin@chronos.internal");
      console.log("  • Password: Admin1234!");
      console.log("  • Organization: Acme Enterprise (Owner)");
      console.log("  • Workspace:    Primary Cluster (DBA)");
    } else {
      console.log(`✓ Existing database contains ${userCount} user accounts. Seed skipped.`);
    }

    console.log("\n=================================================");
    console.log("  Initialization Complete! Start with:");
    console.log("  $ npm run dev");
    console.log("=================================================\n");
  } catch (err: unknown) {
    console.error("❌ Schema initialization error:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
