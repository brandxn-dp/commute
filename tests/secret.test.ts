import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { createEphemeralDb, hasTestDb, type EphemeralDb } from "./helpers/db.js";
import { runMigrations } from "../src/db/migrate.js";
import { createDb, type Db } from "../src/db/index.js";
import { settings } from "../src/db/schema.js";
import { generateSecret } from "../src/lib/auth/secret.js";

// Verifies the atomic persistence contract resolveSessionSecret() relies on:
// the first writer's secret sticks (COALESCE) and every caller reads it back,
// so concurrent requests can never diverge on the signing key.
describe.skipIf(!hasTestDb)("session secret persistence (§Unraid field reset)", () => {
  let ephemeral: EphemeralDb;
  let db: Db;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ephemeral = await createEphemeralDb();
    await runMigrations(ephemeral.url);
    const c = createDb(ephemeral.url);
    db = c.db;
    close = () => c.pool.end();
    await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  });

  afterAll(async () => {
    await close?.();
    if (ephemeral) await ephemeral.drop();
  });

  it("first writer wins and both reads return the same secret", async () => {
    const a = generateSecret();
    const b = generateSecret();
    const upsert = (val: string) =>
      db.execute<{ session_secret: string }>(
        sql`update settings set session_secret = coalesce(session_secret, ${val}) where id = 1 returning session_secret`,
      );

    const r1 = await upsert(a);
    const r2 = await upsert(b);
    expect(r1.rows[0]?.session_secret).toBe(a);
    expect(r2.rows[0]?.session_secret).toBe(a); // b is ignored; a persisted
  });
});
