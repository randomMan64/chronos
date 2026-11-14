import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Phase 8 — Account, Profile & Security Validation", () => {
  const profileSchema = z.object({
    fullName: z.string().trim().min(2).max(100),
    avatarUrl: z.string().trim().url().or(z.literal("")).optional(),
  });

  const preferencesSchema = z.object({
    displayName: z.string().trim().max(100).optional().nullable(),
    timezone: z.string().trim().min(1).max(50),
    dateFormat: z.string().trim().min(1).max(30),
    timeFormat: z.enum(["12h", "24h"]),
    language: z.string().trim().min(2).max(10),
    theme: z.enum(["system", "dark", "light"]),
    sidebarPreference: z.enum(["expanded", "collapsed"]),
    sqlFontSize: z.number().int().min(10).max(24),
    editorWordWrap: z.boolean(),
    editorLineNumbers: z.boolean(),
    editorMinimap: z.boolean(),
  });

  const passwordChangeSchema = z
    .object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
      confirmPassword: z.string().min(1),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords do not match",
    });

  it("validates profile updates and rejects short or excessive names", () => {
    const valid = profileSchema.safeParse({
      fullName: "Jane Doe",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(valid.success).toBe(true);

    const emptyUrl = profileSchema.safeParse({
      fullName: "Jane Doe",
      avatarUrl: "",
    });
    expect(emptyUrl.success).toBe(true);

    const tooShort = profileSchema.safeParse({
      fullName: "J",
    });
    expect(tooShort.success).toBe(false);

    const invalidUrl = profileSchema.safeParse({
      fullName: "Jane Doe",
      avatarUrl: "not-a-valid-url",
    });
    expect(invalidUrl.success).toBe(false);
  });

  it("validates user preferences and prevents unauthorized configurations", () => {
    const valid = preferencesSchema.safeParse({
      displayName: "Jane",
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      language: "en",
      theme: "dark",
      sidebarPreference: "expanded",
      sqlFontSize: 13,
      editorWordWrap: true,
      editorLineNumbers: true,
      editorMinimap: false,
    });
    expect(valid.success).toBe(true);

    const invalidFontSize = preferencesSchema.safeParse({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      language: "en",
      theme: "dark",
      sidebarPreference: "expanded",
      sqlFontSize: 8, // Below minimum 10
      editorWordWrap: true,
      editorLineNumbers: true,
      editorMinimap: false,
    });
    expect(invalidFontSize.success).toBe(false);

    const invalidTheme = preferencesSchema.safeParse({
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      language: "en",
      theme: "neon-glow", // Not in enum
      sidebarPreference: "expanded",
      sqlFontSize: 14,
      editorWordWrap: true,
      editorLineNumbers: true,
      editorMinimap: false,
    });
    expect(invalidTheme.success).toBe(false);
  });

  it("validates password change requirements and enforces matching confirmation", () => {
    const valid = passwordChangeSchema.safeParse({
      currentPassword: "oldpassword123",
      newPassword: "newSecurePassword456!",
      confirmPassword: "newSecurePassword456!",
    });
    expect(valid.success).toBe(true);

    const mismatched = passwordChangeSchema.safeParse({
      currentPassword: "oldpassword123",
      newPassword: "newSecurePassword456!",
      confirmPassword: "differentPassword456!",
    });
    expect(mismatched.success).toBe(false);

    const shortPassword = passwordChangeSchema.safeParse({
      currentPassword: "oldpassword123",
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(shortPassword.success).toBe(false);
  });
});
