/**
 * Test helper: provision an ephemeral Postgres database.
 *
 * Tests that need a real database read TEST_DATABASE_URL (a server the runner
 * can create databases on — e.g. the CI `postgres` service). Each call creates
 * a uniquely-named database so tests are isolated and can drop it afterwards.
 *
 * When TEST_DATABASE_URL is unset (typical local dev without Postgres), callers
 * skip the suite via `hasTestDb`.
 */
import pg from "pg";
const { Pool } = pg;
import { randomUUID } from "node:crypto";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DATABASE_URL);

export interface EphemeralDb {
  url: string;
  dbName: string;
  drop: () => Promise<void>;
}

/**
 * Create a fresh database on the same server as TEST_DATABASE_URL and return a
 * connection URL for it plus a drop() cleanup.
 */
export async function createEphemeralDb(): Promise<EphemeralDb> {
  if (!TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  const dbName = `commute_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const admin = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    // Database identifiers cannot be parameterized; dbName is generated, not user input.
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const base = new URL(TEST_DATABASE_URL);
  base.pathname = `/${dbName}`;
  const url = base.toString();

  return {
    url,
    dbName,
    drop: async () => {
      const a = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
      try {
        await a.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [dbName],
        );
        await a.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      } finally {
        await a.end();
      }
    },
  };
}
