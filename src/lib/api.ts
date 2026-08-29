/**
 * Shared helpers for route handlers: consistent JSON errors, DB access, and
 * an auth guard.
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { getConfig } from "../config/env.js";
import { getDb, type Db } from "../db/index.js";
import { getCurrentUser } from "./auth/current.js";
import type { PublicUser } from "./auth/service.js";

export function getRequestDb(): Db {
  return getDb(getConfig().DATABASE_URL);
}

export function jsonError(message: string, status: number, extra?: unknown): NextResponse {
  return NextResponse.json({ error: message, ...(extra ? { details: extra } : {}) }, { status });
}

export function unauthorized(): NextResponse {
  return jsonError("authentication required", 401);
}

export function notFound(what = "resource"): NextResponse {
  return jsonError(`${what} not found`, 404);
}

export function zodBadRequest(err: ZodError): NextResponse {
  const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return jsonError("invalid request", 400, details);
}

/** Resolve the current user or return a 401 response. */
export async function requireUser(): Promise<
  { ok: true; user: PublicUser; db: Db } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: unauthorized() };
  return { ok: true, user, db: getRequestDb() };
}
