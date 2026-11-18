import { NextResponse } from "next/server";
import { requireWorkspaceAccessById } from "@/lib/auth/guards";
import { handleApiError } from "@/lib/errors";
import { db } from "@/db/connections/control-plane";
import { databases } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const setActiveWorkspaceSchema = z.object({
  workspaceId: z.string().uuid("Invalid workspace ID"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = setActiveWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid workspace ID", details: parsed.error.format() },
        { status: 400 }
      );
    }

    // Server-side verification: verifies workspace belongs to active org and user is authorized
    const { context, workspace } = await requireWorkspaceAccessById(parsed.data.workspaceId);

    // Fetch databases scoped to this new workspace
    const wsDatabases = await db
      .select({
        id: databases.id,
        name: databases.name,
        status: databases.status,
        environment: databases.environment,
      })
      .from(databases)
      .where(eq(databases.workspaceId, workspace.id));

    const defaultDatabase = wsDatabases[0] || null;

    const response = NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        environment: workspace.environment,
        role: context.workspaceRole || (context.organizationRole === "owner" ? "dba" : "developer"),
      },
      database: defaultDatabase,
      databaseCount: wsDatabases.length,
    });

    // Set server-validated active workspace cookie
    response.cookies.set("chronos_active_ws", workspace.id, {
      path: "/",
      sameSite: "lax",
    });

    // Synchronize or clear active database cookie for the new workspace
    if (defaultDatabase) {
      response.cookies.set("chronos_active_db", defaultDatabase.id, {
        path: "/",
        sameSite: "lax",
      });
    } else {
      response.cookies.delete("chronos_active_db");
    }

    return response;
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
