import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireOrganizationAccess } from "@/lib/auth/guards";
import { OrganizationService } from "@/modules/organizations/organization-service";
import { deleteOrganizationSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";
import { db } from "@/db/connections/control-plane";
import { organizationMembers } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    await requireOrganizationAccess(params.id);
    const org = await OrganizationService.getOrganizationDetails(params.id);

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json({ organization: org });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    await requireOrganizationAccess(params.id);

    const body = await req.json();
    const parsed = deleteOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await OrganizationService.deleteOrganization({
      organizationId: params.id,
      actorId: sessionUser.userId,
      actorEmail: sessionUser.email,
      password: parsed.data.password,
      confirmOrgName: parsed.data.confirmOrgName,
    });

    // Check remaining organizations for this user to navigate correctly
    const remainingOrgs = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, sessionUser.userId));

    const nextUrl = remainingOrgs.length > 0 ? "/dashboard" : "/init";
    const response = NextResponse.json({
      success: true,
      message: `Organization '${result.deletedOrganizationName}' deleted successfully.`,
      remainingOrganizations: remainingOrgs.length,
      nextUrl,
    });

    if (remainingOrgs.length > 0) {
      response.cookies.set("chronos_active_org", remainingOrgs[0].organizationId, {
        path: "/",
        sameSite: "lax",
      });
      response.cookies.delete("chronos_active_ws");
    } else {
      response.cookies.delete("chronos_active_org");
      response.cookies.delete("chronos_active_ws");
    }

    return response;
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
