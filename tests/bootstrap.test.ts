import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createEphemeralDb, hasTestDb, type EphemeralDb } from "./helpers/db.js";
import { runMigrations } from "../src/db/migrate.js";
import { bootstrap } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/index.js";
import { settings, users } from "../src/db/schema.js";
import { eq } from "drizzle-orm";

// These require a real Postgres; skip locally when TEST_DATABASE_URL is unset.
describe.skipIf(!hasTestDb)("bootstrap on an empty database (§7.4)", () => {
  let ephemeral: EphemeralDb;

  beforeAll(async () => {
    ephemeral = await createEphemeralDb();
    await runMigrations(ephemeral.url);
  });

  afterAll(async () => {
    if (ephemeral) await ephemeral.drop();
  });

  it("creates the settings row and seeds an owner from ADMIN_EMAIL", async () => {
    const { db, pool } = createDb(ephemeral.url);
    try {
      const result = await bootstrap(db, {
        timezone: "America/New_York",
        adminEmail: "owner@example.com",
      });

      expect(result.settingsCreated).toBe(true);
      expect(result.ownerSeeded).toBe(true);
      expect(result.ownerEmail).toBe("owner@example.com");

      const s = await db.select().from(settings);
      expect(s).toHaveLength(1);
      expect(s[0]?.planningHorizonWeeks).toBe(8); // §3 default horizon

      const owner = await db.select().from(users).where(eq(users.email, "owner@example.com"));
      expect(owner[0]?.isAdmin).toBe(true);
      expect(owner[0]?.isOwner).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("is idempotent: a second run makes no changes", async () => {
    const { db, pool } = createDb(ephemeral.url);
    try {
      const result = await bootstrap(db, {
        timezone: "America/New_York",
        adminEmail: "owner@example.com",
      });
      expect(result.settingsCreated).toBe(false);
      expect(result.ownerSeeded).toBe(false);
      expect(result.usersExisted).toBeGreaterThanOrEqual(1);

      const s = await db.select().from(settings);
      expect(s).toHaveLength(1); // singleton preserved
    } finally {
      await pool.end();
    }
  });
});

describe.skipIf(!hasTestDb)("bootstrap without ADMIN_EMAIL (§7.4)", () => {
  let ephemeral: EphemeralDb;

  beforeAll(async () => {
    ephemeral = await createEphemeralDb();
    await runMigrations(ephemeral.url);
  });

  afterAll(async () => {
    if (ephemeral) await ephemeral.drop();
  });

  it("still creates settings, and leaves users empty until signup", async () => {
    const { db, pool } = createDb(ephemeral.url);
    try {
      const result = await bootstrap(db, { timezone: "UTC" });
      expect(result.settingsCreated).toBe(true);
      expect(result.ownerSeeded).toBe(false);
      expect(result.usersExisted).toBe(0);

      const s = await db.select().from(settings);
      expect(s[0]?.timezone).toBe("UTC");
    } finally {
      await pool.end();
    }
  });
});
