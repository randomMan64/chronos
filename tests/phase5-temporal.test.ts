import { describe, it, expect } from "vitest";
import { computeDiff } from "@/modules/temporal/temporal-service";
import { timeTravelQuerySchema, compareVersionsSchema, restoreRecordSchema } from "@/lib/validation";

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
});


