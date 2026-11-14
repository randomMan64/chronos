import { describe, it, expect } from "vitest";
import { resolvePermissions, hasPermission } from "@/lib/permissions/resolver";
import {
  inviteMemberSchema,
  createOrganizationSchema,
  createWorkspaceSchema,
  transferOwnershipSchema,
} from "@/lib/validation";

describe("Phase 2 — Organization & Workspace Validation", () => {
  it("validates organization creation with slug auto-generation", () => {
    const valid = createOrganizationSchema.safeParse({
      name: "Acme Data Platform",
      slug: "acme-data-platform",
    });
    expect(valid.success).toBe(true);

    const invalidSlug = createOrganizationSchema.safeParse({
      name: "Acme",
      slug: "Invalid Slug With Spaces!",
    });
    expect(invalidSlug.success).toBe(false);
  });

  it("validates workspace creation across environments", () => {
    const validUuid = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const devWs = createWorkspaceSchema.safeParse({
      organizationId: validUuid,
      name: "Dev Cluster",
      environment: "development",
    });
    expect(devWs.success).toBe(true);

    const prodWs = createWorkspaceSchema.safeParse({
      organizationId: validUuid,
      name: "Production Cluster",
      environment: "production",
    });
    expect(prodWs.success).toBe(true);

    const invalidEnv = createWorkspaceSchema.safeParse({
      organizationId: validUuid,
      name: "Cluster",
      environment: "unknown-env",
    });
    expect(invalidEnv.success).toBe(false);
  });

  it("validates member invitation roles", () => {
    const inviteAdmin = inviteMemberSchema.safeParse({
      email: "teammate@company.internal",
      role: "admin",
    });
    expect(inviteAdmin.success).toBe(true);

    const invalidEmail = inviteMemberSchema.safeParse({
      email: "not-an-email",
      role: "member",
    });
    expect(invalidEmail.success).toBe(false);
  });

  it("validates organization ownership transfer authorization rules", () => {
    const validTransfer = transferOwnershipSchema.safeParse({
      newOwnerMemberId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      confirmationPhrase: "TRANSFER_OWNERSHIP",
      previousOwnerNewRole: "admin",
    });
    expect(validTransfer.success).toBe(true);

    const invalidPhrase = transferOwnershipSchema.safeParse({
      newOwnerMemberId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      confirmationPhrase: "WRONG_PHRASE",
      previousOwnerNewRole: "admin",
    });
    expect(invalidPhrase.success).toBe(false);

    const invalidMemberId = transferOwnershipSchema.safeParse({
      newOwnerMemberId: "not-a-uuid",
      confirmationPhrase: "TRANSFER_OWNERSHIP",
    });
    expect(invalidMemberId.success).toBe(false);
  });
});

describe("Phase 2 — Multi-Role IAM & Tenant Isolation Matrix", () => {
  it("Organization Owner has management and audit export permissions", () => {
    const perms = resolvePermissions({ orgRole: "owner" });
    expect(hasPermission(perms, "organization:manage")).toBe(true);
    expect(hasPermission(perms, "members:invite")).toBe(true);
    expect(hasPermission(perms, "audit:export")).toBe(true);
    expect(hasPermission(perms, "workspace:create")).toBe(true);
  });

  it("Database Administrator has schema:write and history:restore permissions", () => {
    const perms = resolvePermissions({ orgRole: "member", workspaceRole: "dba" });
    expect(hasPermission(perms, "schema:write")).toBe(true);
    expect(hasPermission(perms, "history:restore")).toBe(true);
    expect(hasPermission(perms, "backup:restore")).toBe(true);
    expect(hasPermission(perms, "retention:manage")).toBe(true);
  });

  it("Data Analyst is strictly blocked from writing queries or modifying schemas", () => {
    const perms = resolvePermissions({ orgRole: "member", workspaceRole: "analyst" });
    expect(hasPermission(perms, "query:read")).toBe(true);
    expect(hasPermission(perms, "query:write")).toBe(false);
    expect(hasPermission(perms, "schema:write")).toBe(false);
    expect(hasPermission(perms, "history:restore")).toBe(false);
    expect(hasPermission(perms, "backup:restore")).toBe(false);
  });

  it("Auditor can access audit logs and transaction history but cannot execute modifying SQL", () => {
    const perms = resolvePermissions({ orgRole: "member", workspaceRole: "auditor" });
    expect(hasPermission(perms, "audit:read")).toBe(true);
    expect(hasPermission(perms, "audit:export")).toBe(true);
    expect(hasPermission(perms, "transaction:inspect")).toBe(true);
    expect(hasPermission(perms, "query:write")).toBe(false);
    expect(hasPermission(perms, "schema:write")).toBe(false);
    expect(hasPermission(perms, "history:restore")).toBe(false);
  });
});
