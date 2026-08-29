import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
const { Pool } = pg;
import { createEphemeralDb, hasTestDb, type EphemeralDb } from "./helpers/db.js";
import { runMigrations } from "../src/db/migrate.js";
import { checkHealth } from "../src/lib/health.js";

// The whole point of §7.3: a live process over an empty schema must be UNHEALTHY.
describe.skipIf(!hasTestDb)("schema-verifying health check (§7.3)", () => {
  let ephemeral: EphemeralDb;

  beforeAll(async () => {
    ephemeral = await createEphemeralDb();
  });

  afterAll(async () => {
    if (ephemeral) await ephemeral.drop();
  });

  it("reports unhealthy when the database is reachable but tables are missing", async () => {
    const pool = new Pool({ connectionString: ephemeral.url, max: 1 });
    try {
      const report = await checkHealth(pool);
      expect(report.status).toBe("unhealthy");
      expect(report.checks.database).toBe("ok");
      expect(report.checks.schema).toBe("incomplete");
      expect(report.missingTables).toContain("settings");
      expect(report.missingTables).toContain("users");
    } finally {
      await pool.end();
    }
  });

  it("reports healthy after migrations create the schema", async () => {
    await runMigrations(ephemeral.url);
    const pool = new Pool({ connectionString: ephemeral.url, max: 1 });
    try {
      const report = await checkHealth(pool);
      expect(report.status).toBe("healthy");
      expect(report.checks.schema).toBe("ok");
      expect(report.missingTables).toHaveLength(0);
    } finally {
      await pool.end();
    }
  });

  it("reports unhealthy when the database is unreachable", async () => {
    const pool = new Pool({
      connectionString: "postgres://u:p@127.0.0.1:59999/nope",
      max: 1,
      connectionTimeoutMillis: 3000,
    });
    try {
      const report = await checkHealth(pool);
      expect(report.status).toBe("unhealthy");
      expect(report.checks.database).toBe("unreachable");
    } finally {
      await pool.end().catch(() => {});
    }
  });
});
