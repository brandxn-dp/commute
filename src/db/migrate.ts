/**
 * Database migrator (operational requirements §7.1 and §7.2).
 *
 * - Uses a PINNED migrator (drizzle-orm, exact version in package.json). It
 *   never invokes a package manager at runtime — no `npx`, no floating version.
 * - Applies the plain-SQL migration files committed under ./drizzle.
 * - Is FATAL on failure: any error is logged loudly and the process exits with
 *   a non-zero code. The app must NOT start against a broken/empty schema.
 * - Reports counts: how many migrations were already applied, how many were
 *   applied this run, and the total known.
 *
 * At runtime in the container this is bundled to a single JS file and executed
 * with plain `node` before the server starts (see scripts/entrypoint.sh).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { log } from "../lib/logger.js";
import { parseConfig } from "../config/env.js";

export interface MigrateResult {
  total: number;
  alreadyApplied: number;
  newlyApplied: number;
}

function resolveMigrationsDir(): string {
  const fromEnv = process.env.MIGRATIONS_DIR;
  if (fromEnv && fromEnv.length > 0) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  return join(process.cwd(), "drizzle");
}

/** Count migrations recorded in Drizzle's own tracking table (schema drizzle). */
async function countAppliedMigrations(pool: Pool): Promise<number> {
  try {
    const res = await pool.query<{ count: string }>(
      `select count(*)::text as count from drizzle.__drizzle_migrations`,
    );
    return Number(res.rows[0]?.count ?? "0");
  } catch {
    // Table does not exist yet on a fresh database.
    return 0;
  }
}

/** Count migration entries declared in the journal committed alongside the SQL. */
function countKnownMigrations(migrationsDir: string): number {
  try {
    const journalRaw = readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8");
    const journal = JSON.parse(journalRaw) as { entries?: unknown[] };
    return Array.isArray(journal.entries) ? journal.entries.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Run migrations against the given database URL. Returns counts on success,
 * throws on any failure (caller decides how to react).
 */
export async function runMigrations(databaseUrl: string): Promise<MigrateResult> {
  const migrationsDir = resolveMigrationsDir();
  const known = countKnownMigrations(migrationsDir);

  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    // Fail fast if the database is unreachable, with a clear message.
    await pool.query("select 1").catch((err: unknown) => {
      throw new Error(
        `cannot connect to the database: ${(err as Error).message}. ` +
          `Check DATABASE_URL and that Postgres is reachable.`,
      );
    });

    const before = await countAppliedMigrations(pool);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: migrationsDir });
    const after = await countAppliedMigrations(pool);

    return {
      total: known || after,
      alreadyApplied: before,
      newlyApplied: Math.max(0, after - before),
    };
  } finally {
    await pool.end();
  }
}

/**
 * Script entrypoint. Loads/validates config, runs migrations, and exits
 * non-zero on any failure. This is what the container runs before the server.
 */
async function main() {
  const parsed = parseConfig();
  if (!parsed.ok) {
    log.error("Migration aborted: configuration is invalid.");
    process.stderr.write(parsed.errors.join("\n") + "\n");
    process.exit(1);
  }

  const { DATABASE_URL } = parsed.config;
  log.info("Running database migrations…", { dir: resolveMigrationsDir() });
  try {
    const result = await runMigrations(DATABASE_URL);
    log.info("Migrations complete.", {
      total: result.total,
      already_applied: result.alreadyApplied,
      newly_applied: result.newlyApplied,
    });
    process.exit(0);
  } catch (err) {
    // §7.2: log loudly and exit non-zero. Do NOT continue to start the app.
    log.error("MIGRATION FAILED — the application will not start.", {
      reason: (err as Error).message,
    });
    process.exit(1);
  }
}

// Run only when executed directly (not when imported by tests).
const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.cjs") ||
    process.argv[1].endsWith("migrate.mjs") ||
    process.argv[1].endsWith("migrate.js"));

if (isDirectRun) {
  void main();
}
