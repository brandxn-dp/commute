/**
 * Health endpoint (operational requirement §7.3).
 *
 * Returns 200 only when the database is reachable AND all required tables exist.
 * A live process over an empty/broken schema returns 503 so orchestrators and
 * uptime checks actually alert. This endpoint is what the Docker HEALTHCHECK and
 * Unraid use.
 */
import { NextResponse } from "next/server";
import { getPool } from "../../../db/index.js";
import { checkHealth } from "../../../lib/health.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json(
      { status: "unhealthy", error: "DATABASE_URL not set" },
      { status: 503 },
    );
  }

  const report = await checkHealth(getPool(databaseUrl));
  const httpStatus = report.status === "healthy" ? 200 : 503;
  return NextResponse.json(report, {
    status: httpStatus,
    headers: { "cache-control": "no-store" },
  });
}
