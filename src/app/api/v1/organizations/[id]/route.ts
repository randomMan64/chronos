import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/auth/guards";
import { OrganizationService } from "@/modules/organizations/organization-service";
import { handleApiError } from "@/lib/errors";

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

