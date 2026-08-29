import { NextResponse } from "next/server";
import { getRequestDb, jsonError, zodBadRequest } from "../../../../lib/api.js";
import { credentialsSchema } from "../../../../lib/validation.js";
import { setupOwner } from "../../../../lib/auth/service.js";
import { setSessionCookie } from "../../../../lib/auth/current.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One-time owner setup: sets the password and signs the user in. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) return zodBadRequest(parsed.error);

  try {
    const user = await setupOwner(getRequestDb(), parsed.data.email, parsed.data.password);
    const res = NextResponse.json({ user });
    setSessionCookie(res, user.id);
    return res;
  } catch (err) {
    // e.g. "setup already completed"
    return jsonError((err as Error).message, 409);
  }
}
