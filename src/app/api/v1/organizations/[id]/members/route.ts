import { NextResponse } from "next/server";
import { requireOrganizationAccess, requirePermission } from "@/lib/auth/guards";
import { OrganizationService } from "@/modules/organizations/organization-service";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);
    requirePermission(context, "organization:read");

    const members = await OrganizationService.getMembers(params.id);
    return NextResponse.json({ members });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

