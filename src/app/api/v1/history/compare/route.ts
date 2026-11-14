import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { TemporalService } from "@/modules/temporal/temporal-service";
import { compareVersionsSchema } from "@/lib/validation";
import { handleApiError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = compareVersionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const result = await TemporalService.compareVersions(
      parsed.data.versionIdA,
      parsed.data.versionIdB
    );

    return NextResponse.json(result);
  } catch (err) {
    const error = handleApiError(err);
    return NextResponse.json(error.body, { status: error.status });
  }
}

