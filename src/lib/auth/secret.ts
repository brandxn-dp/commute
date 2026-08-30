/**
 * Resolve the effective session-signing secret.
 *
 * Precedence:
 *   1. SESSION_SECRET env var, if set (advanced users keep explicit control).
 *   2. A secret persisted in the settings row.
 *   3. Otherwise generate a strong random secret and persist it atomically.
 *
 * Persisting the generated secret means a lost env var — e.g. an Unraid field
 * reset — does not invalidate everyone's sessions or break login. The result is
 * memoized per process.
 */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getConfig } from "../../config/env.js";
import { getDb } from "../../db/index.js";

let cached: string | null = null;

export function generateSecret(): string {
  return randomBytes(48).toString("base64url");
}

export async function resolveSessionSecret(): Promise<string> {
  if (cached) return cached;

  const config = getConfig();
  if (config.SESSION_SECRET && config.SESSION_SECRET.length >= 32) {
    cached = config.SESSION_SECRET;
    return cached;
  }

  const db = getDb(config.DATABASE_URL);
  const generated = generateSecret();
  // Atomic: only the first writer's value sticks (COALESCE keeps any existing
  // secret), and everyone reads back the persisted one — race-safe across
  // concurrent requests. Assumes the singleton settings row (id=1) exists,
  // which bootstrap guarantees before the server starts.
  const res = await db.execute<{ session_secret: string }>(
    sql`update settings
           set session_secret = coalesce(session_secret, ${generated}),
               updated_at = now()
         where id = 1
     returning session_secret`,
  );
  const persisted = res.rows[0]?.session_secret ?? generated;
  cached = persisted;
  return cached;
}

/** Test/inspection helper to reset the process cache. */
export function _resetSecretCache(): void {
  cached = null;
}
