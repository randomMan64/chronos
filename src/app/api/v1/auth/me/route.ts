import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db/connections/control-plane";
import { users, organizations, organizationMembers, workspaces, workspaceMembers, databases } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, sessionUser.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's organizations
    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.userId, user.id));

    // Get workspaces for user's primary org or all orgs
    const userWorkspaces = await db
      .select({
        id: workspaces.id,
        organizationId: workspaces.organizationId,
        name: workspaces.name,
        slug: workspaces.slug,
        environment: workspaces.environment,
        role: workspaceMembers.role,
      })
      .from(workspaces)
      .leftJoin(
        workspaceMembers,
        eq(workspaceMembers.workspaceId, workspaces.id)
      );

    return NextResponse.json({
      user,
      organizations: orgs,
      workspaces: userWorkspaces,
    });
  } catch (err) {
    console.error("Failed to load user profile:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

