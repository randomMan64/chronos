import fs from "fs";
import path from "path";

// Ensure .env.local is loaded when running standalone scripts or CLI commands
if (!process.env.DATABASE_URL) {
  const envLocal = path.resolve(process.cwd(), ".env.local");
  const envDefault = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envLocal) && typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(envLocal);
  } else if (fs.existsSync(envDefault) && typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(envDefault);
  }
}

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema";

declare global {
  // eslint-disable-next-line no-var
  var __chronos_control_pool: Pool | undefined;
}

export function getDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL_DIRECT ||
    process.env.DATABASE_URL ||
    ""
  );
}

export function createControlPool(): Pool {
  const connectionString = getDatabaseUrl();
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
  });
}

const pool = global.__chronos_control_pool || createControlPool();

if (process.env.NODE_ENV !== "production") {
  global.__chronos_control_pool = pool;
}

export const db = drizzle(pool, { schema });
export { pool };

export async function checkControlPlaneHealth(): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  const dbUrl = getDatabaseUrl();
  if (!dbUrl || dbUrl.includes("password@ep-sample")) {
    return {
      ok: false,
      message: "DATABASE_URL is not set or is using a placeholder.",
      latencyMs: 0,
    };
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      return { ok: true, message: "Control-plane database connected", latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Database connection failed: ${errorMsg}`, latencyMs: Date.now() - start };
  }
}
