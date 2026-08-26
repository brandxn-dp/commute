/**
 * Schema-verifying health check (operational requirement §7.3).
 *
 * A container that is "up" but has no tables is worse than one that is down,
 * because nothing alerts. So health does NOT just prove the process is alive —
 * it verifies the database is reachable AND that every required table exists.
 * Missing tables => unhealthy, even though the Node process is fine.
 */
import type { Pool } from "pg";
import { REQUIRED_TABLES } from "../db/schema.js";

export interface HealthReport {
  status: "healthy" | "unhealthy";
  checks: {
    database: "ok" | "unreachable";
    schema: "ok" | "incomplete";
  };
  missingTables: string[];
  error?: string;
}

/**
 * Verify liveness of the database and presence of all required tables.
 * Never throws — returns a structured report the HTTP layer maps to 200/503.
 */
export async function checkHealth(pool: Pool): Promise<HealthReport> {
  try {
    // Which of the required tables actually exist in the public schema?
    const res = await pool.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
          and table_name = any($1::text[])`,
      [REQUIRED_TABLES as unknown as string[]],
    );
    const present = new Set(res.rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));

    if (missing.length > 0) {
      return {
        status: "unhealthy",
        checks: { database: "ok", schema: "incomplete" },
        missingTables: missing,
      };
    }

    return {
      status: "healthy",
      checks: { database: "ok", schema: "ok" },
      missingTables: [],
    };
  } catch (err) {
    return {
      status: "unhealthy",
      checks: { database: "unreachable", schema: "incomplete" },
      missingTables: [...REQUIRED_TABLES],
      error: (err as Error).message,
    };
  }
}
