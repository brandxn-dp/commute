/**
 * CLI: promote-admin (operational requirement §7.4 escape hatch).
 *
 * Usage:
 *   npm run promote-admin -- you@example.com
 *   node dist/cli/promote-admin.cjs you@example.com   (inside the container)
 *
 * Promotes an existing account to admin+owner. If the account does not exist it
 * is created as a shell owner (passwordHash null), to be claimed at signup.
 * This is the recovery path if the automatic first-boot bootstrap ever leaves
 * you locked out.
 */
import { eq } from "drizzle-orm";
import { loadConfigOrExit } from "../config/env.js";
import { getDb, closeSharedPool } from "../db/index.js";
import { users } from "../db/schema.js";
import { log } from "../lib/logger.js";

async function main() {
  const emailArg = process.argv[2];
  if (!emailArg || !emailArg.includes("@")) {
    process.stderr.write("Usage: promote-admin <email>\n");
    process.exit(2);
  }
  const email = emailArg.toLowerCase();

  const config = loadConfigOrExit();
  const db = getDb(config.DATABASE_URL);

  try {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      await db
        .update(users)
        .set({ isAdmin: true, isOwner: true, updatedAt: new Date() })
        .where(eq(users.email, email));
      log.info("Promoted existing account to admin/owner.", { email });
    } else {
      await db.insert(users).values({ email, isAdmin: true, isOwner: true });
      log.info("Created shell admin/owner account (claim it at signup).", { email });
    }
    process.exit(0);
  } catch (err) {
    log.error("promote-admin failed.", { reason: (err as Error).message });
    process.exit(1);
  } finally {
    await closeSharedPool().catch(() => {});
  }
}

void main();
