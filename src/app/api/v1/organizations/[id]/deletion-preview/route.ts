import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
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
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    await requireOrganizationAccess(params.id);

    const preview = await OrganizationService.getOrganizationDeletionPreview(
      params.id,
      sessionUser.userId
    );

    return NextResponse.json(preview);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}
