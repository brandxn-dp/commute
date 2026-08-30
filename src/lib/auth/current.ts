/**
 * Next.js session adapter: read the current user from the request cookie, and
 * helpers to set/clear the session cookie in route handlers.
 *
 * Server-only: it imports next/headers, which already errors in a client
 * component, so no extra guard is needed.
 */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getConfig } from "../../config/env.js";
import { getDb } from "../../db/index.js";
import { getUserById, type PublicUser } from "./service.js";
import { resolveSessionSecret } from "./secret.js";
import {
  SESSION_COOKIE,
  DEFAULT_TTL_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session.js";

/** Resolve the current authenticated user, or null. */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const config = getConfig();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const secret = await resolveSessionSecret();
  const payload = verifySessionToken(token, secret);
  if (!payload) return null;
  return getUserById(getDb(config.DATABASE_URL), payload.uid);
}

/** Set the session cookie on a response for the given user id. */
export async function setSessionCookie(res: NextResponse, uid: string): Promise<void> {
  const config = getConfig();
  const secret = await resolveSessionSecret();
  const token = createSessionToken(uid, secret);
  const secure = config.APP_URL.startsWith("https://");
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: DEFAULT_TTL_SECONDS,
  });
}

/** Clear the session cookie on a response. */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
