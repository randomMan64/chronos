import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { OrganizationService } from "@/modules/organizations/organization-service";
import { createOrganizationSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    const orgs = await OrganizationService.getUserOrganizations(auth.userId);
    return NextResponse.json({ organizations: orgs });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    const body = await req.json();
    const parsed = createOrganizationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await OrganizationService.createOrganization({
      userId: auth.userId,
      name: parsed.data.name,
      slug: parsed.data.slug,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

