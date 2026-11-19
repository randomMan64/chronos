import { NextResponse } from "next/server";
import {
  requireWorkspaceAccessById,
  requireOrganizationAccess,
  requireUserSession,
} from "@/lib/auth/guards";
import { resolveUserContext } from "@/lib/auth/session";
import { OverviewService, TimeRangeKey } from "@/modules/overview/overview-service";
import { handleApiError } from "@/lib/errors";
import { db } from "@/db/connections/control-plane";
import { workspaces, workspaceMembers, organizations, organizationMembers } from "@/db/schema/control-plane";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let wsId: string | null = searchParams.get("workspaceId");
    let orgId: string | null = searchParams.get("organizationId");
    const dbId = searchParams.get("databaseId") || undefined;
    const range = (searchParams.get("range") as TimeRangeKey) || "24h";
    const startDateStr = searchParams.get("startDate");
    const endDateStr = searchParams.get("endDate");

    // If workspaceId is not explicitly specified, check chronos_active_ws cookie
    if (!wsId) {
      const cookieHeader = req.headers.get("cookie") || "";
      const match = cookieHeader.match(/(?:^|; )chronos_active_ws=([^;]*)/);
      if (match) {
        wsId = decodeURIComponent(match[1]);
      }
    }

    let context;

    if (wsId) {
      const res = await requireWorkspaceAccessById(wsId);
      context = res.context;
      orgId = res.workspace.organizationId;
    } else if (orgId) {
      context = await requireOrganizationAccess(orgId);
      const [ws] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.organizationId, orgId))
        .limit(1);
      if (ws) {
        wsId = ws.id;
      }
    } else {
      // Fallback: Resolve from active session
      const { user } = await requireUserSession();
      // Look up user's active workspace membership
      const [userWs] = await db
        .select({
          workspaceId: workspaceMembers.workspaceId,
        })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.id))
        .limit(1);

      if (userWs?.workspaceId) {
        wsId = userWs.workspaceId;
        const res = await requireWorkspaceAccessById(wsId);
        context = res.context;
        orgId = res.workspace.organizationId;
      } else {
        // Fallback to first org
        const [userOrg] = await db
          .select({
            organizationId: organizationMembers.organizationId,
          })
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, user.id))
          .limit(1);

        if (userOrg?.organizationId) {
          orgId = userOrg.organizationId;
          context = await requireOrganizationAccess(orgId);
          const [ws] = await db
            .select()
            .from(workspaces)
            .where(eq(workspaces.organizationId, orgId))
            .limit(1);
          if (ws) wsId = ws.id;
        } else {
          context = await resolveUserContext({});
        }
      }
    }

    if (!context || !wsId || !orgId) {
      return NextResponse.json(
        { error: "Active workspace or organization access required." },
        { status: 400 }
      );
    }

    const data = await OverviewService.getOverviewTelemetry({
      workspaceId: wsId,
      organizationId: orgId,
      databaseId: dbId,
      range,
      startDate: startDateStr ? new Date(startDateStr) : undefined,
      endDate: endDateStr ? new Date(endDateStr) : undefined,
      context,
    });

    return NextResponse.json(data);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
