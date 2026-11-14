import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/auth/guards";
import { OrganizationService } from "@/modules/organizations/organization-service";
import { handleApiError } from "@/lib/errors";
import { transferOwnershipSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const context = await requireOrganizationAccess(params.id);

    const body = await req.json();
    const parsed = transferOwnershipSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid transfer parameters" },
        { status: 400 }
      );
    }

    const result = await OrganizationService.transferOwnership({
      organizationId: params.id,
      actorId: context.userId,
      newOwnerMemberId: parsed.data.newOwnerMemberId,
      confirmationPhrase: parsed.data.confirmationPhrase,
      previousOwnerNewRole: parsed.data.previousOwnerNewRole,
    });

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

