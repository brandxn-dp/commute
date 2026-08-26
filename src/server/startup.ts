/**
 * Startup pre-flight (operational requirements §7.2, §7.4, §7.5, §7.6).
 *
 * This runs once, before the HTTP server starts, and produces the legible boot
 * sequence the brief demands. In order:
 *
 *   1. Load + validate configuration (exit non-zero with a named-variable error
 *      on failure).
 *   2. Run migrations (fatal on failure — the app must not start on a broken
 *      or empty schema), reporting counts.
 *   3. Connect and run first-boot bootstrap (settings row + owner/admin),
 *      reporting what it did.
 *   4. Print a clear summary and exit 0. The entrypoint then starts the server.
 *
 * Any failure logs loudly and exits with a non-zero code. A healthy boot is a
 * short, clean sequence of INFO lines with no stack-trace spam.
 */
import { loadConfigOrExit } from "../config/env.js";
import { runMigrations } from "../db/migrate.js";
import { bootstrap } from "../db/bootstrap.js";
import { getDb, closeSharedPool } from "../db/index.js";
import { log } from "../lib/logger.js";

async function main() {
  const startedAt = Date.now();

  // 1. Config.
  const config = loadConfigOrExit();
  log.info("Config loaded and validated.", {
    node_env: config.NODE_ENV,
    app_url: config.APP_URL,
    timezone: config.DEFAULT_TIMEZONE,
    travel_provider: config.TRAVEL_PROVIDER,
  });

  // 2. Migrations (fatal on failure).
  let migrationsSummary: string;
  try {
    const m = await runMigrations(config.DATABASE_URL);
    migrationsSummary = `${m.newlyApplied} applied, ${m.alreadyApplied} already present, ${m.total} total`;
    log.info("Migrations OK.", {
      newly_applied: m.newlyApplied,
      already_applied: m.alreadyApplied,
      total: m.total,
    });
  } catch (err) {
    log.error("MIGRATION FAILED — refusing to start.", { reason: (err as Error).message });
    process.exit(1);
  }

  // 3. Bootstrap.
  try {
    const db = getDb(config.DATABASE_URL);
    const b = await bootstrap(db, {
      timezone: config.DEFAULT_TIMEZONE,
      adminEmail: config.ADMIN_EMAIL,
    });
    if (b.settingsCreated) log.info("Bootstrap: created settings row with defaults.");
    if (b.ownerSeeded) log.info("Bootstrap: seeded owner/admin account.", { email: b.ownerEmail });
    if (!b.settingsCreated && !b.ownerSeeded) {
      log.info("Bootstrap: nothing to do (already initialized).", {
        existing_users: b.usersExisted,
      });
    }
  } catch (err) {
    log.error("BOOTSTRAP FAILED — refusing to start.", { reason: (err as Error).message });
    await closeSharedPool().catch(() => {});
    process.exit(1);
  } finally {
    await closeSharedPool().catch(() => {});
  }

  log.info("Pre-flight complete.", {
    migrations: migrationsSummary,
    took_ms: Date.now() - startedAt,
  });
  process.exit(0);
}

void main();
