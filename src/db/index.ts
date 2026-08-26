/**
 * Database client (node-postgres + Drizzle).
 *
 * A single shared Pool per process. Callers import `getDb()` rather than a
 * module-level singleton so tests can construct isolated clients against a
 * throwaway database.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

let sharedPool: Pool | null = null;
let sharedDb: Db | null = null;

export function getPool(databaseUrl: string): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      connectionString: databaseUrl,
      // Keep the pool modest; a self-hosted single-user app does not need many.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return sharedPool;
}

export function getDb(databaseUrl: string): Db {
  if (!sharedDb) {
    sharedDb = drizzle(getPool(databaseUrl), { schema });
  }
  return sharedDb;
}

/**
 * Construct an isolated client (own pool) — used by tests and short-lived
 * scripts that must not share the process-wide singleton.
 */
export function createDb(databaseUrl: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function closeSharedPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = null;
    sharedDb = null;
  }
}

export { schema };
