import { db } from "@/db/connections/control-plane";
import { databases, databasePermissions, workspaces } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { userDbManager, TableMetadata } from "@/db/connections/user-database";
import { AuditService } from "@/modules/audit/audit-service";

export interface RegisterDatabaseInput {
  organizationId: string;
  workspaceId: string;
  name: string;
  connectionString: string;
  environment?: "development" | "staging" | "production";
  isTemporalEnabled?: boolean;
  actorId: string;
}

export class DatabaseService {
  public static async registerDatabase(input: RegisterDatabaseInput) {
    // 1. Test connection first
    const testResult = await userDbManager.testConnection({
      id: "temp-test",
      connectionStringEncrypted: encryptCredential(input.connectionString),
    });

    if (!testResult.ok) {
      throw new Error(`Database connection failed: ${testResult.error || "Unknown error"}`);
    }

    // 2. Parse connection details if possible
    let host = "localhost";
    let port = 5432;
    let databaseName = "postgres";
    let username = "postgres";
    let sslMode = "require";

    try {
      const url = new URL(input.connectionString);
      host = url.hostname || host;
      port = url.port ? parseInt(url.port, 10) : port;
      databaseName = url.pathname.replace(/^\//, "") || databaseName;
      username = url.username || username;
      sslMode = url.searchParams.get("sslmode") || sslMode;
    } catch {
      // ignore URL parsing errors for custom connection formats
    }

    const encryptedConn = encryptCredential(input.connectionString);

    // 3. Insert into control plane
    const [newDb] = await db
      .insert(databases)
      .values({
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        name: input.name,
        connectionStringEncrypted: encryptedConn,
        host,
        port,
        databaseName,
        username,
        sslMode,
        environment: input.environment || "development",
        status: "active",
        lastTestedAt: new Date(),
        isTemporalEnabled: input.isTemporalEnabled ?? true,
      })
      .returning();

    // 4. Grant full DBA permissions on this database to creator
    await db.insert(databasePermissions).values({
      databaseId: newDb.id,
      userId: input.actorId,
      role: "dba",
      canRead: true,
      canWrite: true,
      canExecuteDdl: true,
      canRestore: true,
      canExplain: true,
    });

    // 5. Audit
    await AuditService.log({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      databaseId: newDb.id,
      actorId: input.actorId,
      action: "database:register",
      resourceType: "database",
      resourceId: newDb.id,
      metadata: { name: newDb.name, host, databaseName, latencyMs: testResult.latencyMs },
    });

    return { database: newDb, latencyMs: testResult.latencyMs };
  }

  public static async getDatabases(params: {
    organizationId: string;
    workspaceId?: string;
  }) {
    if (params.workspaceId) {
      return await db
        .select({
          id: databases.id,
          workspaceId: databases.workspaceId,
          organizationId: databases.organizationId,
          name: databases.name,
          host: databases.host,
          port: databases.port,
          databaseName: databases.databaseName,
          username: databases.username,
          environment: databases.environment,
          status: databases.status,
          isTemporalEnabled: databases.isTemporalEnabled,
          lastTestedAt: databases.lastTestedAt,
          createdAt: databases.createdAt,
        })
        .from(databases)
        .where(
          and(
            eq(databases.organizationId, params.organizationId),
            eq(databases.workspaceId, params.workspaceId)
          )
        );
    }

    return await db
      .select({
        id: databases.id,
        workspaceId: databases.workspaceId,
        organizationId: databases.organizationId,
        name: databases.name,
        host: databases.host,
        port: databases.port,
        databaseName: databases.databaseName,
        username: databases.username,
        environment: databases.environment,
        status: databases.status,
        isTemporalEnabled: databases.isTemporalEnabled,
        lastTestedAt: databases.lastTestedAt,
        createdAt: databases.createdAt,
      })
      .from(databases)
      .where(eq(databases.organizationId, params.organizationId));
  }

  public static async getDatabaseDetails(databaseId: string) {
    const [found] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);
    return found || null;
  }

  public static async testRegisteredDatabase(databaseId: string) {
    const database = await this.getDatabaseDetails(databaseId);
    if (!database) {
      throw new Error("Database not found");
    }

    const result = await userDbManager.testConnection({
      id: database.id,
      connectionStringEncrypted: database.connectionStringEncrypted,
    });

    // Update status in control plane
    await db
      .update(databases)
      .set({
        status: result.ok ? "active" : "unreachable",
        lastTestedAt: new Date(),
      })
      .where(eq(databases.id, databaseId));

    return result;
  }

  public static async introspectSchemas(databaseId: string): Promise<string[]> {
    const database = await this.getDatabaseDetails(databaseId);
    if (!database) throw new Error("Database not found");

    return await userDbManager.introspectSchemas({
      id: database.id,
      connectionStringEncrypted: database.connectionStringEncrypted,
    });
  }

  public static async introspectTables(databaseId: string, schema = "public"): Promise<TableMetadata[]> {
    const database = await this.getDatabaseDetails(databaseId);
    if (!database) throw new Error("Database not found");

    return await userDbManager.introspectTables(
      {
        id: database.id,
        connectionStringEncrypted: database.connectionStringEncrypted,
      },
      schema
    );
  }

  public static async fetchTableRows(params: {
    databaseId: string;
    schema?: string;
    table: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDir?: "ASC" | "DESC";
  }) {
    const database = await this.getDatabaseDetails(params.databaseId);
    if (!database) throw new Error("Database not found");

    const schema = params.schema || "public";
    const table = params.table.replace(/[^a-zA-Z0-9_]/g, ""); // sanitize identifier
    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    let sql = `SELECT * FROM "${schema}"."${table}"`;
    if (params.orderBy) {
      const col = params.orderBy.replace(/[^a-zA-Z0-9_]/g, "");
      const dir = params.orderDir === "DESC" ? "DESC" : "ASC";
      sql += ` ORDER BY "${col}" ${dir}`;
    }
    sql += ` LIMIT ${limit} OFFSET ${offset};`;

    return await userDbManager.executeQuery(
      {
        id: database.id,
        connectionStringEncrypted: database.connectionStringEncrypted,
      },
      sql,
      { isReadOnly: true, maxRows: limit }
    );
  }
}

