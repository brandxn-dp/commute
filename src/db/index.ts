/**
 * Database client (node-postgres + Drizzle).
 *
 * A single shared Pool per process. Callers import `getDb()` rather than a
 * module-level singleton so tests can construct isolated clients against a
 * throwaway database.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;
type PgPool = InstanceType<typeof Pool>;
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;

let sharedPool: PgPool | null = null;
let sharedDb: Db | null = null;

export function getPool(databaseUrl: string): PgPool {
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
export function createDb(databaseUrl: string): { db: Db; pool: PgPool } {
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
