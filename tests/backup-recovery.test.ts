import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { resolvePermissions, hasPermission } from "@/lib/permissions/resolver";

const createSnapshotSchema = z.object({
  name: z.string().trim().min(2, "Snapshot identifier must be at least 2 characters"),
  snapshotType: z.enum(["manual", "daily", "pitr_point"]).default("manual"),
});

const restoreSnapshotSchema = z.object({
  confirmationPhrase: z
    .string()
    .refine((val): val is string => val === "RESTORE_SNAPSHOT", {
      message: 'Type "RESTORE_SNAPSHOT" to confirm',
    }),
});

describe("Backup & Recovery Center — Validation & Authorization", () => {
  it("validates create snapshot identifier with min length 2", () => {
    // Single character fails
    const failSingle = createSnapshotSchema.safeParse({ name: "a" });
    expect(failSingle.success).toBe(false);

    // Whitespace only fails
    const failWhitespace = createSnapshotSchema.safeParse({ name: "   " });
    expect(failWhitespace.success).toBe(false);

    // Valid name passes
    const valid = createSnapshotSchema.safeParse({
      name: "pre-deployment-snapshot",
      snapshotType: "manual",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.name).toBe("pre-deployment-snapshot");
      expect(valid.data.snapshotType).toBe("manual");
    }
  });

  it("enforces strict confirmation phrase 'RESTORE_SNAPSHOT' for recovery", () => {
    // Incorrect phrase fails
    const failWrong = restoreSnapshotSchema.safeParse({
      confirmationPhrase: "restore",
    });
    expect(failWrong.success).toBe(false);

    // Exact phrase passes
    const valid = restoreSnapshotSchema.safeParse({
      confirmationPhrase: "RESTORE_SNAPSHOT",
    });
    expect(valid.success).toBe(true);
  });

  it("authorizes DBA to create and restore database backups", () => {
    const dbaPerms = resolvePermissions({ orgRole: "dba" });
    expect(hasPermission(dbaPerms, "backup:read")).toBe(true);
    expect(hasPermission(dbaPerms, "backup:create")).toBe(true);
    expect(hasPermission(dbaPerms, "backup:restore")).toBe(true);

    const wsDbaPerms = resolvePermissions({ workspaceRole: "dba" });
    expect(hasPermission(wsDbaPerms, "backup:read")).toBe(true);
    expect(hasPermission(wsDbaPerms, "backup:create")).toBe(true);
    expect(hasPermission(wsDbaPerms, "backup:restore")).toBe(true);
  });

  it("prohibits Developer, Analyst, and Auditor from performing backup create and restore", () => {
    const devPerms = resolvePermissions({ workspaceRole: "developer" });
    expect(hasPermission(devPerms, "backup:create")).toBe(false);
    expect(hasPermission(devPerms, "backup:restore")).toBe(false);

    const analystPerms = resolvePermissions({ workspaceRole: "data_analyst" });
    expect(hasPermission(analystPerms, "backup:create")).toBe(false);
    expect(hasPermission(analystPerms, "backup:restore")).toBe(false);

    const auditorPerms = resolvePermissions({ workspaceRole: "auditor" });
    expect(hasPermission(auditorPerms, "backup:create")).toBe(false);
    expect(hasPermission(auditorPerms, "backup:restore")).toBe(false);
  });
});
