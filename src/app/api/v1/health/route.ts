import { NextResponse } from "next/server";
import { checkControlPlaneHealth } from "@/db/connections/control-plane";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbHealth = await checkControlPlaneHealth();

  return NextResponse.json({
    status: dbHealth.ok ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    service: "CHRONOS PostgreSQL Control Plane",
    database: {
      connected: dbHealth.ok,
      latencyMs: dbHealth.latencyMs,
      message: dbHealth.message,
    },
  });
}

