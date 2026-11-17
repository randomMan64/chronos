import { Pool, PoolClient } from "pg";
import { decryptCredential } from "@/lib/crypto";

export interface DatabaseConnectionConfig {
  id: string;
  connectionStringEncrypted: string;
  host?: string | null;
  port?: number | null;
  databaseName?: string | null;
  username?: string | null;
  sslMode?: string | null;
  statementTimeoutMs?: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  command: string;
}

export interface TableColumnMetadata {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignTable?: string | null;
  foreignColumn?: string | null;
}

export interface TableMetadata {
  schemaName: string;
  tableName: string;
  estimatedRowCount: number;
  columns: TableColumnMetadata[];
  indexes: {
    indexName: string;
    indexDef: string;
    isUnique: boolean;
  }[];
}

class UserDatabaseManager {
  private pools = new Map<string, Pool>();

  public getPool(config: DatabaseConnectionConfig): Pool {
    const existing = this.pools.get(config.id);
    if (existing) {
      return existing;
    }

    const decrypted = decryptCredential(config.connectionStringEncrypted);
    const pool = new Pool({
      connectionString: decrypted,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
      statement_timeout: config.statementTimeoutMs || 30000,
      ssl: decrypted.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
    });

    this.pools.set(config.id, pool);
    return pool;
  }

  public invalidatePool(databaseId: string) {
    const pool = this.pools.get(databaseId);
    if (pool) {
      pool.end().catch(() => {});
      this.pools.delete(databaseId);
    }
  }

  public async testConnection(config: DatabaseConnectionConfig): Promise<{
    ok: boolean;
    latencyMs: number;
    version?: string;
    error?: string;
  }> {
    const pool = this.getPool(config);
    const start = Date.now();
    let client: PoolClient | null = null;
    try {
      client = await pool.connect();
      const res = await client.query("SELECT version(), current_database(), current_user");
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        latencyMs,
        version: res.rows[0]?.version,
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.invalidatePool(config.id);
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error,
      };
    } finally {
      if (client) client.release();
    }
  }

  public async executeQuery(
    config: DatabaseConnectionConfig,
    sql: string,
    options: {
      params?: any[];
      isReadOnly?: boolean;
      maxRows?: number;
      timeoutMs?: number;
    } = {}
  ): Promise<QueryResult> {
    const pool = this.getPool(config);
    const start = Date.now();
    const client = await pool.connect();

    const maxRows = options.maxRows || 1000;
    const timeoutMs = options.timeoutMs || 25000;

    try {
      // Set query timeout for this session
      await client.query(`SET statement_timeout = ${timeoutMs}`);

      if (options.isReadOnly) {
        // Enforce PostgreSQL-level read-only transaction
        await client.query("BEGIN TRANSACTION READ ONLY");
      }

      // Execute the query with optional parameterization
      const res = options.params && options.params.length > 0
        ? await client.query(sql, options.params)
        : await client.query(sql);

      if (options.isReadOnly) {
        await client.query("COMMIT");
      }

      const durationMs = Date.now() - start;

      // Handle multi-statement or non-SELECT commands
      const actualResult = Array.isArray(res) ? res[res.length - 1] : res;
      const columns = actualResult.fields ? actualResult.fields.map((f: { name: string }) => f.name) : [];
      const rows = (actualResult.rows || []).slice(0, maxRows);

      return {
        columns,
        rows,
        rowCount: actualResult.rowCount ?? rows.length,
        durationMs,
        command: actualResult.command || "SELECT",
      };
    } catch (err) {
      if (options.isReadOnly) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // ignore rollback failure
        }
      }
      throw err;
    } finally {
      client.release();
    }
  }

  public async explainQuery(
    config: DatabaseConnectionConfig,
    sql: string,
    analyze = false
  ): Promise<{ plan: Record<string, unknown>[]; durationMs: number }> {
    const pool = this.getPool(config);
    const client = await pool.connect();
    const start = Date.now();

    try {
      const explainSql = analyze
        ? `EXPLAIN (ANALYZE, COSTS, VERBOSE, BUFFERS, FORMAT JSON) ${sql}`
        : `EXPLAIN (COSTS, VERBOSE, FORMAT JSON) ${sql}`;

      const res = await client.query(explainSql);
      const plan = res.rows[0]?.["QUERY PLAN"] || res.rows;
      return {
        plan,
        durationMs: Date.now() - start,
      };
    } finally {
      client.release();
    }
  }

  public async introspectSchemas(config: DatabaseConnectionConfig): Promise<string[]> {
    const pool = this.getPool(config);
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY schema_name ASC;
      `);
      return res.rows.map((r) => r.schema_name);
    } finally {
      client.release();
    }
  }

  public async introspectTables(
    config: DatabaseConnectionConfig,
    schema = "public"
  ): Promise<TableMetadata[]> {
    const pool = this.getPool(config);
    const client = await pool.connect();
    try {
      // 1. Fetch tables
      const tablesRes = await client.query(
        `
        SELECT 
          c.relname as table_name,
          n.nspname as schema_name,
          c.reltuples::bigint as estimated_row_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 
          AND c.relkind IN ('r', 'v', 'm', 'p')
        ORDER BY c.relname ASC;
      `,
        [schema]
      );

      const result: TableMetadata[] = [];

      for (const t of tablesRes.rows) {
        // Columns metadata
        const colsRes = await client.query(
          `
          SELECT 
            c.column_name,
            c.data_type,
            c.is_nullable = 'YES' as is_nullable,
            c.column_default,
            COALESCE(tc.constraint_type = 'PRIMARY KEY', false) as is_primary_key
          FROM information_schema.columns c
          LEFT JOIN information_schema.key_column_usage kcu
            ON kcu.table_schema = c.table_schema
            AND kcu.table_name = c.table_name
            AND kcu.column_name = c.column_name
          LEFT JOIN information_schema.table_constraints tc
            ON tc.table_schema = kcu.table_schema
            AND tc.table_name = kcu.table_name
            AND tc.constraint_name = kcu.constraint_name
            AND tc.constraint_type = 'PRIMARY KEY'
          WHERE c.table_schema = $1 AND c.table_name = $2
          ORDER BY c.ordinal_position ASC;
        `,
          [schema, t.table_name]
        );

        // Indexes
        const idxRes = await client.query(
          `
          SELECT 
            indexname as index_name,
            indexdef as index_def,
            indexdef LIKE 'CREATE UNIQUE INDEX%' as is_unique
          FROM pg_indexes
          WHERE schemaname = $1 AND tablename = $2
          ORDER BY indexname ASC;
        `,
          [schema, t.table_name]
        );

        result.push({
          schemaName: schema,
          tableName: t.table_name,
          estimatedRowCount: Math.max(0, parseInt(t.estimated_row_count || "0", 10)),
          columns: colsRes.rows.map((c) => ({
            columnName: c.column_name,
            dataType: c.data_type,
            isNullable: c.is_nullable,
            columnDefault: c.column_default,
            isPrimaryKey: c.is_primary_key,
            isForeignKey: false,
          })),
          indexes: idxRes.rows.map((i) => ({
            indexName: i.index_name,
            indexDef: i.index_def,
            isUnique: i.is_unique,
          })),
        });
      }

      return result;
    } finally {
      client.release();
    }
  }
}

export const userDbManager = new UserDatabaseManager();
