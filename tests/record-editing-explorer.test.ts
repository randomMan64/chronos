import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePermissions, resolveTablePermissions, hasPermission } from "../src/lib/permissions/resolver";
import { RecordService, ConcurrencyConflictError } from "../src/modules/databases/record-service";
import { TemporalService } from "../src/modules/temporal/temporal-service";
import { AuditService } from "../src/modules/audit/audit-service";
import { userDbManager, TableMetadata, QueryResult } from "../src/db/connections/user-database";

describe("Database Explorer Record-Level Editing & Permissions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockDbRecord = {
    id: "db-123",
    name: "test-neon-db",
    connectionStringEncrypted: "enc_conn",
    isTemporalEnabled: true,
  } as any;

  const mockTableMetadata: TableMetadata = {
    tableName: "users",
    schemaName: "public",
    columns: [
      { columnName: "id", dataType: "varchar", isNullable: false, columnDefault: null, isPrimaryKey: true, isForeignKey: false },
      { columnName: "name", dataType: "varchar", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
      { columnName: "email", dataType: "varchar", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
      { columnName: "status", dataType: "varchar", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
      { columnName: "score", dataType: "integer", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
      { columnName: "version", dataType: "integer", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
    ],
    indexes: [],
    estimatedRowCount: 1,
  };

  const createMockQueryResult = (rows: Record<string, unknown>[]): QueryResult => ({
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    rows,
    rowCount: rows.length,
    durationMs: 5,
    command: "SELECT",
  });

  describe("1. Granular Record Permissions Resolution", () => {
    it("ensures Owner, DBA, and Developer have full record manipulation capabilities", () => {
      const ownerPerms = resolvePermissions({ orgRole: "owner" });
      const dbaPerms = resolvePermissions({ orgRole: "dba" });
      const devPerms = resolvePermissions({ orgRole: "developer" });

      expect(hasPermission(ownerPerms, "record:insert")).toBe(true);
      expect(hasPermission(ownerPerms, "record:update")).toBe(true);
      expect(hasPermission(ownerPerms, "record:delete")).toBe(true);

      expect(hasPermission(dbaPerms, "record:insert")).toBe(true);
      expect(hasPermission(dbaPerms, "record:update")).toBe(true);
      expect(hasPermission(dbaPerms, "record:delete")).toBe(true);

      expect(hasPermission(devPerms, "record:insert")).toBe(true);
      expect(hasPermission(devPerms, "record:update")).toBe(true);
      expect(hasPermission(devPerms, "record:delete")).toBe(true);

      const tablePerms = resolveTablePermissions(devPerms);
      expect(tablePerms).toEqual({
        canSelect: true,
        canInsert: true,
        canUpdate: true,
        canDelete: true,
      });
    });

    it("ensures Data Analyst, Database Engineer, and Auditor are strictly READ-ONLY", () => {
      const analystPerms = resolvePermissions({ orgRole: "data_analyst" });
      const dbEngPerms = resolvePermissions({ orgRole: "database_engineer" });
      const auditorPerms = resolvePermissions({ orgRole: "auditor" });

      for (const perms of [analystPerms, dbEngPerms, auditorPerms]) {
        expect(hasPermission(perms, "record:insert")).toBe(false);
        expect(hasPermission(perms, "record:update")).toBe(false);
        expect(hasPermission(perms, "record:delete")).toBe(false);

        const tablePerms = resolveTablePermissions(perms);
        expect(tablePerms.canSelect).toBe(true);
        expect(tablePerms.canInsert).toBe(false);
        expect(tablePerms.canUpdate).toBe(false);
        expect(tablePerms.canDelete).toBe(false);
      }
    });

    it("respects database grants when permissions are restricted", () => {
      const analystPerms = resolvePermissions({ orgRole: "data_analyst" });
      const tablePerms = resolveTablePermissions(analystPerms, {
        canRead: true,
        canWrite: false,
      });
      expect(tablePerms.canSelect).toBe(true);
      expect(tablePerms.canUpdate).toBe(false);
      expect(tablePerms.canInsert).toBe(false);
      expect(tablePerms.canDelete).toBe(false);
    });

    it("enforces role ceiling: Database Engineer with stale canWrite database grants is strictly prevented from editing", () => {
      const dbEngWithWriteGrant = resolvePermissions({
        orgRole: "database_engineer",
        workspaceRole: "database_engineer",
        databaseGrants: {
          role: "dba",
          canRead: true,
          canWrite: true, // Stale grant from registration
          canExecuteDdl: true,
          canRestore: true,
          canExplain: true,
        },
      });

      expect(hasPermission(dbEngWithWriteGrant, "query:read")).toBe(true);
      expect(hasPermission(dbEngWithWriteGrant, "performance:inspect")).toBe(true);
      // Strictly disallowed by role ceiling:
      expect(hasPermission(dbEngWithWriteGrant, "query:write")).toBe(false);
      expect(hasPermission(dbEngWithWriteGrant, "record:insert")).toBe(false);
      expect(hasPermission(dbEngWithWriteGrant, "record:update")).toBe(false);
      expect(hasPermission(dbEngWithWriteGrant, "record:delete")).toBe(false);
      expect(hasPermission(dbEngWithWriteGrant, "schema:write")).toBe(false);
      expect(hasPermission(dbEngWithWriteGrant, "history:restore")).toBe(false);

      const tablePerms = resolveTablePermissions(dbEngWithWriteGrant);
      expect(tablePerms.canSelect).toBe(true);
      expect(tablePerms.canInsert).toBe(false);
      expect(tablePerms.canUpdate).toBe(false);
      expect(tablePerms.canDelete).toBe(false);
    });
  });

  describe("2. Safe Identifier Quoting & Primary Key Immutability", () => {
    it("safely quotes identifiers and disallows unsafe SQL characters", () => {
      expect(RecordService.quoteIdent("users")).toBe('"users"');
      expect(RecordService.quoteIdent("user_data")).toBe('"user_data"');
      expect(() => RecordService.quoteIdent('users"; DROP TABLE students; --')).toThrow(
        /Invalid SQL identifier/
      );
    });

    it("rejects modifications to primary key columns", async () => {
      vi.spyOn(RecordService, "getDatabase").mockResolvedValue(mockDbRecord);
      vi.spyOn(RecordService, "getTableMetadata").mockResolvedValue(mockTableMetadata);

      vi.spyOn(userDbManager, "executeQuery").mockResolvedValue(
        createMockQueryResult([{ id: "user-123", email: "old@example.com" }])
      );

      await expect(
        RecordService.updateRecord({
          databaseId: "db-123",
          schema: "public",
          table: "users",
          primaryKey: { id: "user-123" },
          changes: { id: "user-456", email: "new@example.com" },
          actor: { id: "actor-1", email: "admin@test.com" },
        })
      ).rejects.toThrow(/Modifying primary key column/);
    });
  });

  describe("3. Optimistic Concurrency Conflict Detection", () => {
    it("throws ConcurrencyConflictError when live row has diverged from originalRow", async () => {
      vi.spyOn(RecordService, "getDatabase").mockResolvedValue(mockDbRecord);
      vi.spyOn(RecordService, "getTableMetadata").mockResolvedValue(mockTableMetadata);

      // Mock executeQuery on userDbManager to return a modified row
      const mockQuery = vi.spyOn(userDbManager, "executeQuery").mockResolvedValue(
        createMockQueryResult([{ id: "row-1", name: "Bob (Modified by concurrent user)", version: 2 }])
      );

      await expect(
        RecordService.updateRecord({
          databaseId: "db-123",
          schema: "public",
          table: "users",
          primaryKey: { id: "row-1" },
          changes: { name: "Alice's Proposed Edit" },
          originalRow: { id: "row-1", name: "Alice Original", version: 1 },
          actor: { id: "actor-1", email: "alice@test.com" },
        })
      ).rejects.toThrow(ConcurrencyConflictError);

      mockQuery.mockRestore();
    });
  });

  describe("4. Temporal History & Audit Integration", () => {
    it("atomically records row version in TemporalService and logs audit event on update", async () => {
      vi.spyOn(RecordService, "getDatabase").mockResolvedValue(mockDbRecord);
      vi.spyOn(RecordService, "getTableMetadata").mockResolvedValue({
        ...mockTableMetadata,
        tableName: "accounts",
      });

      const mockQuery = vi.spyOn(userDbManager, "executeQuery")
        // 1st call: fetch current record
        .mockResolvedValueOnce(
          createMockQueryResult([{ id: "rec-1", status: "pending", score: 10 }])
        )
        // 2nd call: execute UPDATE statement
        .mockResolvedValueOnce(
          createMockQueryResult([{ id: "rec-1", status: "active", score: 10 }])
        );

      const temporalSpy = vi.spyOn(TemporalService, "recordRowVersion").mockResolvedValue({} as any);
      const auditSpy = vi.spyOn(AuditService, "log").mockResolvedValue({} as any);

      const result = await RecordService.updateRecord({
        databaseId: "db-123",
        schema: "public",
        table: "accounts",
        primaryKey: { id: "rec-1" },
        changes: { status: "active" },
        originalRow: { id: "rec-1", status: "pending", score: 10 },
        actor: {
          id: "usr-99",
          email: "dev@acme.com",
          organizationId: "org-1",
        },
      });

      expect(result.record).toEqual({ id: "rec-1", status: "active", score: 10 });
      expect(result.changedColumns).toEqual(["status"]);

      // Verify Temporal Snapshot
      expect(temporalSpy).toHaveBeenCalledTimes(1);
      expect(temporalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          databaseId: "db-123",
          tableName: "accounts",
          schemaName: "public",
          recordId: "rec-1",
          operation: "UPDATE",
          changedBy: "dev@acme.com",
        })
      );

      // Verify Compliance Audit
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "database:record_update",
          resourceType: "database_record",
          actorId: "usr-99",
          metadata: expect.objectContaining({
            changedColumns: ["status"],
          }),
        })
      );

      mockQuery.mockRestore();
    });

    it("atomically records row version and logs audit event on insert", async () => {
      vi.spyOn(RecordService, "getDatabase").mockResolvedValue(mockDbRecord);
      vi.spyOn(RecordService, "getTableMetadata").mockResolvedValue({
        tableName: "items",
        schemaName: "public",
        columns: [
          { columnName: "id", dataType: "varchar", isNullable: false, columnDefault: null, isPrimaryKey: true, isForeignKey: false },
          { columnName: "name", dataType: "varchar", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
        ],
        indexes: [],
        estimatedRowCount: 0,
      });

      const mockQuery = vi.spyOn(userDbManager, "executeQuery").mockResolvedValueOnce(
        createMockQueryResult([{ id: "new-row-1", name: "Sample Item" }])
      );

      const temporalSpy = vi.spyOn(TemporalService, "recordRowVersion").mockResolvedValue({} as any);
      const auditSpy = vi.spyOn(AuditService, "log").mockResolvedValue({} as any);

      const result = await RecordService.insertRecord({
        databaseId: "db-123",
        schema: "public",
        table: "items",
        data: { name: "Sample Item" },
        actor: { id: "usr-1", email: "dev@acme.com" },
      });

      expect(result.record).toEqual({ id: "new-row-1", name: "Sample Item" });
      expect(temporalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "INSERT",
          recordId: "new-row-1",
        })
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "database:record_insert",
        })
      );

      mockQuery.mockRestore();
    });

    it("atomically records row version and logs audit event on delete", async () => {
      vi.spyOn(RecordService, "getDatabase").mockResolvedValue(mockDbRecord);
      vi.spyOn(RecordService, "getTableMetadata").mockResolvedValue({
        tableName: "items",
        schemaName: "public",
        columns: [
          { columnName: "id", dataType: "varchar", isNullable: false, columnDefault: null, isPrimaryKey: true, isForeignKey: false },
          { columnName: "name", dataType: "varchar", isNullable: true, columnDefault: null, isPrimaryKey: false, isForeignKey: false },
        ],
        indexes: [],
        estimatedRowCount: 1,
      });

      const mockQuery = vi.spyOn(userDbManager, "executeQuery")
        // 1st call: fetch current record before delete
        .mockResolvedValueOnce(
          createMockQueryResult([{ id: "del-row-1", name: "Item to delete" }])
        )
        // 2nd call: execute DELETE statement
        .mockResolvedValueOnce(
          createMockQueryResult([])
        );

      const temporalSpy = vi.spyOn(TemporalService, "recordRowVersion").mockResolvedValue({} as any);
      const auditSpy = vi.spyOn(AuditService, "log").mockResolvedValue({} as any);

      const result = await RecordService.deleteRecord({
        databaseId: "db-123",
        schema: "public",
        table: "items",
        primaryKey: { id: "del-row-1" },
        actor: { id: "usr-1", email: "dba@acme.com" },
      });

      expect(result.success).toBe(true);
      expect(temporalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "DELETE",
          recordId: "del-row-1",
        })
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "database:record_delete",
        })
      );

      mockQuery.mockRestore();
    });
  });
});
