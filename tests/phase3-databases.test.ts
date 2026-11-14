import { describe, it, expect } from "vitest";
import { registerDatabaseSchema, testDatabaseSchema } from "@/lib/validation";
import { encryptCredential, decryptCredential } from "@/lib/crypto";

describe("Phase 3 — Database Management & Registry Validation", () => {
  const validOrgId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const validWsId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

  it("validates database registration schema with valid PostgreSQL connection URI", () => {
    const valid = registerDatabaseSchema.safeParse({
      organizationId: validOrgId,
      workspaceId: validWsId,
      name: "neon-production-pg",
      connectionString: "postgres://neondb_owner:npg_pass123@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require",
      environment: "production",
      isTemporalEnabled: true,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects database registration with missing or malformed connection string", () => {
    const invalid = registerDatabaseSchema.safeParse({
      organizationId: validOrgId,
      workspaceId: validWsId,
      name: "neon-production-pg",
      connectionString: "short",
      environment: "production",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates test connection payload schema", () => {
    const valid = testDatabaseSchema.safeParse({
      connectionString: "postgres://user:pass@localhost:5432/testdb",
    });
    expect(valid.success).toBe(true);

    const invalid = testDatabaseSchema.safeParse({
      connectionString: "",
    });
    expect(invalid.success).toBe(false);
  });

  it("ensures credentials are encrypted with authenticated AES-256-GCM", () => {
    const sensitiveUri = "postgres://superadmin:TopSecretPassword123!@ep-pooler.neon.tech/main?sslmode=require";
    const encrypted = encryptCredential(sensitiveUri);

    expect(encrypted).not.toContain("TopSecretPassword123!");
    expect(encrypted.split(":")).toHaveLength(3); // iv, authTag, cipherText

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(sensitiveUri);
  });
});

