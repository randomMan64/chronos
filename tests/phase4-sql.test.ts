import { describe, it, expect } from "vitest";
import { executeSqlSchema, explainSqlSchema } from "@/lib/validation";

describe("Phase 4 — SQL Gateway Validation & Policy", () => {
  const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  it("validates SQL execution schema with appropriate limits", () => {
    const valid = executeSqlSchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      sql: "SELECT * FROM users WHERE active = true;",
      maxRows: 500,
      timeoutMs: 15000,
    });
    expect(valid.success).toBe(true);
  });

  it("rejects execution with excessive row limits or timeouts exceeding bounds", () => {
    const invalidRows = executeSqlSchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      sql: "SELECT 1;",
      maxRows: 999999, // Exceeds max 5000
    });
    expect(invalidRows.success).toBe(false);

    const invalidTimeout = executeSqlSchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      sql: "SELECT 1;",
      timeoutMs: 9999999, // Exceeds max 60000
    });
    expect(invalidTimeout.success).toBe(false);
  });

  it("detects modifying SQL statements with regex", () => {
    const isModifying = (sql: string) =>
      /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i.test(sql.trim());

    expect(isModifying("SELECT * FROM users")).toBe(false);
    expect(isModifying("   select id from orders where amount > 100")).toBe(false);
    expect(isModifying("INSERT INTO users (email) VALUES ('test@example.com')")).toBe(true);
    expect(isModifying("update orders set status = 'paid'")).toBe(true);
    expect(isModifying("DELETE FROM tokens WHERE expired = true")).toBe(true);
    expect(isModifying("DROP TABLE audit_logs")).toBe(true);
    expect(isModifying("ALTER TABLE users ADD COLUMN phone VARCHAR(20)")).toBe(true);
  });

  it("validates EXPLAIN query schemas", () => {
    const valid = explainSqlSchema.safeParse({
      databaseId: validUuid,
      workspaceId: validUuid,
      organizationId: validUuid,
      sql: "SELECT * FROM transactions WHERE amount > 500",
      analyze: true,
    });
    expect(valid.success).toBe(true);
  });
});

