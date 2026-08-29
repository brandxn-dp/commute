import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../../lib/auth/current.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
