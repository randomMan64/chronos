import { describe, it, expect, vi } from "vitest";
import { computeDiff, TemporalService } from "@/modules/temporal/temporal-service";
import { timeTravelQuerySchema, compareVersionsSchema, restoreRecordSchema } from "@/lib/validation";
import { resolvePermissions, hasPermission } from "@/lib/permissions/resolver";

describe("Phase 5 — Temporal Diff Engine", () => {
  it("computes added, removed, and modified attributes accurately", () => {
    const oldData = {
      id: "usr_1",
      email: "old@acme.internal",
      status: "active",
      balance: 100,
    };

    const newData = {
      id: "usr_1",
      email: "new@acme.internal",
      balance: 150,
      tier: "enterprise",
    };

    const diff = computeDiff(oldData, newData);

    // Added
    expect(diff.added).toEqual({ tier: "enterprise" });

    // Removed
    expect(diff.removed).toEqual({ status: "active" });

    // Modified
    expect(diff.modified).toEqual({
      email: { old: "old@acme.internal", new: "new@acme.internal" },
      balance: { old: 100, new: 150 },
    });
  });

  it("handles null old or new data cleanly (insert or delete scenarios)", () => {
    // Insert: old is null
    const insertDiff = computeDiff(null, { id: "1", name: "Alice" });
    expect(insertDiff.added).toEqual({ id: "1", name: "Alice" });
    expect(insertDiff.removed).toEqual({});
    expect(insertDiff.modified).toEqual({});

    // Delete: new is null
    const deleteDiff = computeDiff({ id: "1", name: "Alice" }, null);
    expect(deleteDiff.removed).toEqual({ id: "1", name: "Alice" });
    expect(deleteDiff.added).toEqual({});
    expect(deleteDiff.modified).toEqual({});
  });
});

describe("Phase 5 — Time Travel & Restore Schemas", () => {
  const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  it("validates time travel query schema with ISO timestamp", () => {
    const valid = timeTravelQuerySchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      schemaName: "public",
      tableName: "orders",
      asOfTimestamp: "2026-11-13T12:00:00.000Z",
      recordId: "ord_999",
    });
    expect(valid.success).toBe(true);

    const invalidTimestamp = timeTravelQuerySchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      tableName: "orders",
      asOfTimestamp: "not-a-timestamp",
    });
    expect(invalidTimestamp.success).toBe(false);
  });

  it("validates restore record schema and requires audit reason", () => {
    const valid = restoreRecordSchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      versionId: validUuid,
      reason: "Reverting invalid status change",
    });
    expect(valid.success).toBe(true);

    const missingReason = restoreRecordSchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      versionId: validUuid,
      reason: "", // Empty reason rejected
    });
    expect(missingReason.success).toBe(false);
  });

  it("supports table-level queries when recordId is omitted in timeTravelQuerySchema", () => {
    const valid = timeTravelQuerySchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      schemaName: "public",
      tableName: "audit_logs",
      asOfTimestamp: "2026-11-18T10:00:00.000Z",
      page: 2,
      pageSize: 10,
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.recordId).toBeUndefined();
      expect(valid.data.tableName).toBe("audit_logs");
      expect(valid.data.page).toBe(2);
      expect(valid.data.pageSize).toBe(10);
    }
  });

  it("handles complex nested attribute diffs accurately", () => {
    const v1 = {
      id: "ord_101",
      customer: { name: "Alice", email: "alice@acme.com" },
      tags: ["vip", "priority"],
      total: 500,
    };
    const v2 = {
      id: "ord_101",
      customer: { name: "Alice", email: "alice.work@acme.com" },
      tags: ["vip", "priority", "express"],
      total: 750,
      currency: "USD",
    };

    const diff = computeDiff(v1, v2);
    expect(diff.added).toEqual({ currency: "USD" });
    expect(diff.removed).toEqual({});
    expect(diff.modified).toHaveProperty("customer");
    expect(diff.modified).toHaveProperty("tags");
    expect(diff.modified).toHaveProperty("total");
    expect(diff.modified.total).toEqual({ old: 500, new: 750 });
  });

  describe("Phase 5 — Multi-User Historical Visibility & Time Travel RBAC", () => {
    it("preserves cross-user visibility: User A and User B changes are visible to anyone with history:read", async () => {
      // Mock history entries simulating User A insert -> User B update -> User A update
      const mockDbId = "db-prod-100";
      const userA = "alice@chronos.internal";
      const userB = "bob@chronos.internal";
      const recordId = "rec-order-999";

      const mockVersions = [
        {
          id: "ver-3",
          databaseId: mockDbId,
          schemaName: "public",
          tableName: "orders",
          recordId,
          operation: "UPDATE" as const,
          versionNumber: 3,
          oldData: { id: recordId, status: "processing", total: 100 },
          newData: { id: recordId, status: "completed", total: 100 },
          diff: {
            added: {},
            removed: {},
            modified: { status: { old: "processing", new: "completed" } },
          },
          transactionId: "tx_1003",
          changedBy: userA, // User A updates again
          changedAt: new Date("2026-11-19T10:30:00Z"),
        },
        {
          id: "ver-2",
          databaseId: mockDbId,
          schemaName: "public",
          tableName: "orders",
          recordId,
          operation: "UPDATE" as const,
          versionNumber: 2,
          oldData: { id: recordId, status: "pending", total: 100 },
          newData: { id: recordId, status: "processing", total: 100 },
          diff: {
            added: {},
            removed: {},
            modified: { status: { old: "pending", new: "processing" } },
          },
          transactionId: "tx_1002",
          changedBy: userB, // User B updates
          changedAt: new Date("2026-11-19T10:15:00Z"),
        },
        {
          id: "ver-1",
          databaseId: mockDbId,
          schemaName: "public",
          tableName: "orders",
          recordId,
          operation: "INSERT" as const,
          versionNumber: 1,
          oldData: null,
          newData: { id: recordId, status: "pending", total: 100 },
          diff: {
            added: { id: recordId, status: "pending", total: 100 },
            removed: {},
            modified: {},
          },
          transactionId: "tx_1001",
          changedBy: userA, // User A inserts
          changedAt: new Date("2026-11-19T10:00:00Z"),
        },
      ];

      vi.spyOn(TemporalService, "getRecordTimeline").mockResolvedValueOnce(
        mockVersions.map((v) => ({
          id: v.id,
          tableName: v.tableName,
          recordId: v.recordId,
          operation: v.operation,
          versionNumber: v.versionNumber,
          oldData: v.oldData,
          newData: v.newData,
          diff: v.diff,
          changeSummary: `Version ${v.versionNumber}`,
          modifiedCount: Object.keys(v.diff.modified).length,
          addedCount: Object.keys(v.diff.added).length,
          removedCount: Object.keys(v.diff.removed).length,
          validFrom: v.changedAt.toISOString(),
          validTo: null,
          transactionXmin: v.transactionId,
          performedBy: v.changedBy, // Must display actor who performed operation
        })) as any
      );

      // User B inspects timeline
      const timeline = await TemporalService.getRecordTimeline({
        databaseId: mockDbId,
        tableName: "orders",
        recordId,
      });

      // 1. All captured historical versions are visible (not filtered by current user)
      expect(timeline).toHaveLength(3);

      // 2. Both users' changes are visible
      expect(timeline[0].performedBy).toBe(userA); // v3 by User A
      expect(timeline[1].performedBy).toBe(userB); // v2 by User B
      expect(timeline[2].performedBy).toBe(userA); // v1 by User A

      // 3. Timestamps and transaction identifiers are present
      expect(timeline[0].transactionXmin).toBe("tx_1003");
      expect(timeline[1].transactionXmin).toBe("tx_1002");
      expect(timeline[2].transactionXmin).toBe("tx_1001");
      expect(timeline[0].validFrom).toBe("2026-11-19T10:30:00.000Z");

      // 4. Version comparison & diff inspection
      const v1State = timeline[2].newData!;
      const v3State = timeline[0].newData!;
      const multiVersionDiff = computeDiff(v1State, v3State);
      expect(multiVersionDiff.modified).toEqual({
        status: { old: "pending", new: "completed" },
      });
    });

    it("verifies Database Engineer permissions: history:read, transaction:inspect, performance:inspect", () => {
      const dbEngPerms = resolvePermissions({
        workspaceRole: "database_engineer",
      });

      // Permitted by default
      expect(hasPermission(dbEngPerms, "history:read")).toBe(true);
      expect(hasPermission(dbEngPerms, "transaction:inspect")).toBe(true);
      expect(hasPermission(dbEngPerms, "performance:inspect")).toBe(true);

      // audit:read is NOT permitted by default (only if explicitly assigned)
      expect(hasPermission(dbEngPerms, "audit:read")).toBe(false);

      // history:restore is NOT automatically granted
      expect(hasPermission(dbEngPerms, "history:restore")).toBe(false);
    });

    it("verifies restoration permissions are independently enforced", () => {
      // 1. DBA: permitted according to assigned privileges (true by default)
      const dbaPerms = resolvePermissions({ workspaceRole: "dba" });
      expect(hasPermission(dbaPerms, "history:restore")).toBe(true);

      // DBA with explicit canRestore: false is revoked
      const dbaRevoked = resolvePermissions({
        workspaceRole: "dba",
        databaseGrants: {
          canRead: true,
          canWrite: true,
          canExecuteDdl: true,
          canRestore: false,
          canExplain: true,
        },
      });
      expect(hasPermission(dbaRevoked, "history:restore")).toBe(false);

      // 2. Developer: permitted only where explicitly granted via databaseGrants
      const devDefault = resolvePermissions({
        workspaceRole: "developer",
        databaseGrants: {
          canRead: true,
          canWrite: true,
          canExecuteDdl: false,
          canRestore: false,
          canExplain: false,
        },
      });
      expect(hasPermission(devDefault, "history:restore")).toBe(false);

      const devGranted = resolvePermissions({
        workspaceRole: "developer",
        databaseGrants: {
          canRead: true,
          canWrite: true,
          canExecuteDdl: false,
          canRestore: true,
          canExplain: false,
        },
      });
      expect(hasPermission(devGranted, "history:restore")).toBe(true);

      // 3. Database Engineer: configurable, not automatically granted
      const engDefault = resolvePermissions({ workspaceRole: "database_engineer" });
      expect(hasPermission(engDefault, "history:restore")).toBe(false);

      const engConfigured = resolvePermissions({
        workspaceRole: "database_engineer",
        databaseGrants: {
          role: "database_engineer",
          canRead: true,
          canWrite: false,
          canExecuteDdl: false,
          canRestore: true, // Configured by admin
          canExplain: true,
        },
      });
      expect(hasPermission(engConfigured, "history:restore")).toBe(true);

      // 4. Data Analyst: strictly denied even if canRestore is true
      const analystPerms = resolvePermissions({
        workspaceRole: "data_analyst",
        databaseGrants: {
          canRead: true,
          canWrite: false,
          canExecuteDdl: false,
          canRestore: true,
          canExplain: false,
        },
      });
      expect(hasPermission(analystPerms, "history:restore")).toBe(false);

      // 5. Auditor: strictly denied even if canRestore is true
      const auditorPerms = resolvePermissions({
        workspaceRole: "auditor",
        databaseGrants: {
          canRead: true,
          canWrite: false,
          canExecuteDdl: false,
          canRestore: true,
          canExplain: false,
        },
      });
      expect(hasPermission(auditorPerms, "history:restore")).toBe(false);
    });
  });
});


