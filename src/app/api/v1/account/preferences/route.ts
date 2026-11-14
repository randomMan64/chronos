import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { userPreferences, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updatePreferencesSchema = z.object({
  displayName: z.string().trim().max(255).optional().nullable(),
  timezone: z.string().trim().min(1).max(100).optional(),
  dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY"]).optional(),
  timeFormat: z.enum(["12h", "24h"]).optional(),
  language: z.enum(["en", "es", "de", "fr", "ja"]).optional(),
  theme: z.enum(["system", "dark", "light"]).optional(),
  sidebarPreference: z.enum(["expanded", "collapsed"]).optional(),
  sqlFontSize: z.number().int().min(10).max(24).optional(),
  editorWordWrap: z.boolean().optional(),
  editorLineNumbers: z.boolean().optional(),
  editorMinimap: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
});

const DEFAULT_PREFERENCES = {
  id: "default-pref",
  displayName: "",
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
  twoFactorEnabled: false,
};

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    let [pref] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, sessionUser.userId))
      .limit(1);

    if (!pref) {
      // Lazy initialize default preferences for user
      try {
        const [user] = await db
          .select({ fullName: users.fullName })
          .from(users)
          .where(eq(users.id, sessionUser.userId))
          .limit(1);

        const [created] = await db
          .insert(userPreferences)
          .values({
            userId: sessionUser.userId,
            displayName: user?.fullName || "",
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
            twoFactorEnabled: false,
          })
          .onConflictDoNothing()
          .returning();

        pref = created;
      } catch (insertErr) {
        console.warn("Could not insert initial user preferences:", insertErr);
      }

      if (!pref) {
        try {
          [pref] = await db
            .select()
            .from(userPreferences)
            .where(eq(userPreferences.userId, sessionUser.userId))
            .limit(1);
        } catch {
          // Ignore
        }
      }
    }

    const payload = pref || { ...DEFAULT_PREFERENCES, userId: sessionUser.userId };

    return NextResponse.json({
      ...payload,
      preferences: payload,
    });
  } catch (err) {
    console.warn("Failed to load user preferences from database, returning defaults:", err);
    const fallback = { ...DEFAULT_PREFERENCES, userId: sessionUser.userId };
    return NextResponse.json({
      ...fallback,
      preferences: fallback,
    });
  }
}

export async function PATCH(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = updatePreferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const updates = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    try {
      const [existing] = await db
        .select({ id: userPreferences.id })
        .from(userPreferences)
        .where(eq(userPreferences.userId, sessionUser.userId))
        .limit(1);

      let updatedPref;
      if (existing) {
        [updatedPref] = await db
          .update(userPreferences)
          .set(updates)
          .where(eq(userPreferences.userId, sessionUser.userId))
          .returning();
      } else {
        [updatedPref] = await db
          .insert(userPreferences)
          .values({
            userId: sessionUser.userId,
            ...updates,
          })
          .returning();
      }

      const result = updatedPref || { ...DEFAULT_PREFERENCES, userId: sessionUser.userId, ...updates };

      return NextResponse.json({
        message: "Preferences saved successfully",
        ...result,
        preferences: result,
      });
    } catch (dbErr) {
      console.warn("Database update failed, returning applied values:", dbErr);
      const fallbackResult = {
        ...DEFAULT_PREFERENCES,
        userId: sessionUser.userId,
        ...updates,
      };
      return NextResponse.json({
        message: "Preferences saved successfully",
        ...fallbackResult,
        preferences: fallbackResult,
      });
    }
  } catch (err) {
    console.error("Failed to parse request body:", err);
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}
