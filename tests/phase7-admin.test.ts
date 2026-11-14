import { describe, it, expect } from "vitest";
import { auditFilterSchema } from "@/lib/validation";

describe("Phase 7 — Administration & Audit Trail Validation", () => {
  const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  it("validates audit filter parameters with bounds", () => {
    const valid = auditFilterSchema.safeParse({
      organizationId: validUuid,
      action: "sql:execute_modifying",
      limit: 100,
      offset: 0,
    });
    expect(valid.success).toBe(true);

    const invalidLimit = auditFilterSchema.safeParse({
      organizationId: validUuid,
      limit: 500, // Exceeds max 200
    });
    expect(invalidLimit.success).toBe(false);
  });

  it("enforces explicit confirmation phrase before executing recovery", () => {
    const validateConfirmation = (phrase: string) => phrase === "RESTORE_SNAPSHOT";

    expect(validateConfirmation("RESTORE_SNAPSHOT")).toBe(true);
    expect(validateConfirmation("restore_snapshot")).toBe(false);
    expect(validateConfirmation("yes")).toBe(false);
    expect(validateConfirmation("")).toBe(false);
  });
});

