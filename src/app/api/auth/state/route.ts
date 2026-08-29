import { NextResponse } from "next/server";
import { getRequestDb } from "../../../../lib/api.js";
import { getAuthState } from "../../../../lib/auth/service.js";
import { getCurrentUser } from "../../../../lib/auth/current.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Reports whether the deployment still needs initial setup, plus current user. */
export async function GET() {
  const state = await getAuthState(getRequestDb());
  const user = await getCurrentUser();
  return NextResponse.json({ state, user });
}
