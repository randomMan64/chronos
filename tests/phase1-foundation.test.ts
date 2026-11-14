import { describe, it, expect } from "vitest";
import { resolvePermissions, hasPermission, hasAllPermissions } from "@/lib/permissions/resolver";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { registerSchema, loginSchema, createWorkspaceSchema, registerDatabaseSchema } from "@/lib/validation";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";

describe("Phase 1 — Permissions & RBAC Resolver", () => {
  it("resolves owner permissions with full management capabilities", () => {
    const permissions = resolvePermissions({
      orgRole: "owner",
      workspaceRole: "dba",
    });

    expect(hasPermission(permissions, "organization:manage")).toBe(true);
    expect(hasPermission(permissions, "database:manage")).toBe(true);
    expect(hasPermission(permissions, "members:invite")).toBe(true);
    expect(hasPermission(permissions, "schema:write")).toBe(true);
    expect(hasPermission(permissions, "history:restore")).toBe(true);
  });

  it("strictly enforces read-only permissions for Data Analysts", () => {
    const permissions = resolvePermissions({
      orgRole: "member",
      workspaceRole: "analyst",
    });

    expect(hasPermission(permissions, "query:read")).toBe(true);
    expect(hasPermission(permissions, "history:read")).toBe(true);
    // Disallowed:
    expect(hasPermission(permissions, "query:write")).toBe(false);
    expect(hasPermission(permissions, "schema:write")).toBe(false);
    expect(hasPermission(permissions, "history:restore")).toBe(false);
    expect(hasPermission(permissions, "database:delete")).toBe(false);
  });

  it("allows Developers to write queries and restore versions but not alter retention or delete database", () => {
    const permissions = resolvePermissions({
      orgRole: "member",
      workspaceRole: "developer",
    });

    expect(hasPermission(permissions, "query:read")).toBe(true);
    expect(hasPermission(permissions, "query:write")).toBe(true);
    expect(hasPermission(permissions, "history:restore")).toBe(true);
    expect(hasPermission(permissions, "database:delete")).toBe(false);
    expect(hasPermission(permissions, "retention:manage")).toBe(false);
  });

  it("allows Auditors to inspect logs and transactions but not execute queries", () => {
    const permissions = resolvePermissions({
      orgRole: "member",
      workspaceRole: "auditor",
    });

    expect(hasPermission(permissions, "audit:read")).toBe(true);
    expect(hasPermission(permissions, "audit:export")).toBe(true);
    expect(hasPermission(permissions, "transaction:inspect")).toBe(true);
    expect(hasPermission(permissions, "query:write")).toBe(false);
    expect(hasPermission(permissions, "schema:write")).toBe(false);
  });

  it("respects explicit database grants overriding workspace roles", () => {
    const permissions = resolvePermissions({
      orgRole: "member",
      workspaceRole: "developer",
      databaseGrants: {
        canRead: true,
        canWrite: false, // Explicit denial of write on this specific database
        canExecuteDdl: false,
        canRestore: false,
        canExplain: true,
      },
    });

    expect(hasPermission(permissions, "query:read")).toBe(true);
    expect(hasPermission(permissions, "query:write")).toBe(false);
    expect(hasPermission(permissions, "history:restore")).toBe(false);
  });
});

describe("Phase 1 — Credential Vault & Encryption", () => {
  it("encrypts and cleanly decrypts database connection strings using AES-256-GCM", () => {
    const connectionUri = "postgres://usr_prod:SuperSecretP@ss@db.internal:5432/primary_db?sslmode=require";
    const encrypted = encryptCredential(connectionUri);

    expect(encrypted).not.toEqual(connectionUri);
    expect(encrypted.split(":")).toHaveLength(3); // iv : authTag : cipherHex

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toEqual(connectionUri);
  });
});

describe("Phase 1 — Authentication Tokens", () => {
  it("signs and verifies JWT session tokens correctly", async () => {
    const token = await createSessionToken({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "engineer@chronos.internal",
      sessionId: "22222222-2222-2222-2222-222222222222",
    });

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("engineer@chronos.internal");
    expect(payload?.userId).toBe("11111111-1111-1111-1111-111111111111");
  });
});

describe("Phase 1 — Input Validation", () => {
  it("validates register schema properly", () => {
    const valid = registerSchema.safeParse({
      email: "valid@chronos.internal",
      password: "securePassword123",
      fullName: "Alex Taylor",
      organizationName: "Chronos Labs",
    });
    expect(valid.success).toBe(true);

    const invalidEmail = registerSchema.safeParse({
      email: "not-an-email",
      password: "123",
      fullName: "A",
    });
    expect(invalidEmail.success).toBe(false);
  });
});

