import { db } from "@/db/connections/control-plane";
import { transactionEvents, changeEvents, databases } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { userDbManager } from "@/db/connections/user-database";

export class TransactionService {
  public static async getTransactions(params: {
    databaseId: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit || 50, 1), 200);
    const offset = Math.max(params.offset || 0, 0);

    const query = db
      .select()
      .from(transactionEvents)
      .where(
        params.status
          ? and(
              eq(transactionEvents.databaseId, params.databaseId),
              eq(transactionEvents.status, params.status)
            )
          : eq(transactionEvents.databaseId, params.databaseId)
      )
      .orderBy(desc(transactionEvents.startedAt))
      .limit(limit)
      .offset(offset);

    return await query;
  }

  public static async getTransactionDetails(transactionId: string) {
    const [tx] = await db
      .select()
      .from(transactionEvents)
      .where(eq(transactionEvents.transactionId, transactionId))
      .limit(1);

    if (!tx) return null;

    // Associated change events
    const changes = await db
      .select()
      .from(changeEvents)
      .where(eq(changeEvents.databaseId, tx.databaseId))
      .orderBy(desc(changeEvents.createdAt))
      .limit(50);

    return {
      transaction: tx,
      associatedChanges: changes,
    };
  }

  public static async recordTransaction(params: {
    databaseId: string;
    transactionId: string;
    actorId?: string;
    actorEmail?: string;
    status: "started" | "committed" | "rolled_back" | "failed";
    queryText?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }) {
    const [recorded] = await db
      .insert(transactionEvents)
      .values({
        databaseId: params.databaseId,
        transactionId: params.transactionId,
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        status: params.status,
        queryText: params.queryText,
        durationMs: params.durationMs || 0,
        metadata: params.metadata || {},
      })
      .returning();

    return recorded;
  }

  /**
   * Introspects live PostgreSQL connections and locks from pg_stat_activity
   */
  public static async getLiveActivity(databaseId: string) {
    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    const sql = `
      SELECT 
        pid,
        usename,
        client_addr::text as client_ip,
        application_name,
        state,
        COALESCE(EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000, 0)::int as duration_ms,
        query,
        wait_event_type,
        wait_event
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND datname = current_database()
      ORDER BY duration_ms DESC
      LIMIT 50;
    `;

    try {
      const res = await userDbManager.executeQuery(
        {
          id: database.id,
          connectionStringEncrypted: database.connectionStringEncrypted,
        },
        sql,
        { isReadOnly: true }
      );
      return res.rows;
    } catch {
      return [];
    }
  }
}

