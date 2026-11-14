import { db } from "@/db/connections/control-plane";
import { queryExecutions, databases } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { userDbManager } from "@/db/connections/user-database";

export class AnalyticsService {
  public static async getPerformanceOverview(databaseId: string) {
    // 1. Slow queries (> 100ms)
    const slowQueries = await db
      .select()
      .from(queryExecutions)
      .where(eq(queryExecutions.databaseId, databaseId))
      .orderBy(desc(queryExecutions.durationMs))
      .limit(10);

    // 2. Aggregate stats
    const totalExecutions = await db
      .select({
        count: sql<number>`count(*)`,
        avgDuration: sql<number>`avg(duration_ms)`,
        maxDuration: sql<number>`max(duration_ms)`,
      })
      .from(queryExecutions)
      .where(eq(queryExecutions.databaseId, databaseId));

    const totalCount = Number(totalExecutions[0]?.count || 0);
    const avgMs = Math.round(Number(totalExecutions[0]?.avgDuration || 0));
    const maxMs = Number(totalExecutions[0]?.maxDuration || 0);

    return {
      totalCount,
      avgMs,
      maxMs,
      slowQueries,
    };
  }

  public static async getIndexStats(databaseId: string) {
    const [database] = await db
      .select()
      .from(databases)
      .where(eq(databases.id, databaseId))
      .limit(1);

    if (!database) throw new Error("Database not found");

    const sqlQuery = `
      SELECT 
        schemaname,
        relname as table_name,
        indexrelname as index_name,
        idx_scan as scans_count,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 50;
    `;

    try {
      const res = await userDbManager.executeQuery(
        {
          id: database.id,
          connectionStringEncrypted: database.connectionStringEncrypted,
        },
        sqlQuery,
        { isReadOnly: true }
      );
      return res.rows;
    } catch {
      return [];
    }
  }
}

