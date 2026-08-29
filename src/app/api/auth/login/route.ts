import { NextResponse } from "next/server";
import { getRequestDb, jsonError, zodBadRequest } from "../../../../lib/api.js";
import { credentialsSchema } from "../../../../lib/validation.js";
import { login } from "../../../../lib/auth/service.js";
import { setSessionCookie } from "../../../../lib/auth/current.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return zodBadRequest(parsed.error);

  const user = await login(getRequestDb(), parsed.data.email, parsed.data.password);
  if (!user) return jsonError("invalid email or password", 401);

  const res = NextResponse.json({ user });
  setSessionCookie(res, user.id);
  return res;
}
