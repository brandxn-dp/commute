/**
 * First-boot bootstrap (operational requirement §7.4).
 *
 * The reference project that inspired this brief shipped with no settings row
 * and no admin user, which hid the signup form and the settings panel — an
 * unrecoverable state without hand-writing SQL. This module makes that state
 * impossible:
 *
 *   - On an empty database, create the singleton settings row with sane defaults.
 *   - Make the first registered account the owner/admin. Before any account
 *     exists, ADMIN_EMAIL (if set) pre-seeds a shell owner row so the escape
 *     hatch works even before signup is wired up.
 *
 * Bootstrap is idempotent: running it repeatedly on an already-initialized
 * database is a no-op and reports what it found. Every action is logged.
 */
import { eq } from "drizzle-orm";
import type { Db } from "./index.js";
import { settings, users } from "./schema.js";

export interface BootstrapResult {
  settingsCreated: boolean;
  ownerSeeded: boolean;
  ownerEmail: string | null;
  usersExisted: number;
}

export interface BootstrapOptions {
  timezone: string;
  adminEmail?: string | undefined;
}

export async function bootstrap(db: Db, opts: BootstrapOptions): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    settingsCreated: false,
    ownerSeeded: false,
    ownerEmail: null,
    usersExisted: 0,
  };

  // 1. Ensure the singleton settings row exists.
  const existingSettings = await db.select().from(settings).limit(1);
  if (existingSettings.length === 0) {
    await db
      .insert(settings)
      .values({ id: 1, timezone: opts.timezone })
      .onConflictDoNothing({ target: settings.id });
    result.settingsCreated = true;
  }

  // 2. Owner/admin handling.
  const existingUsers = await db.select({ id: users.id }).from(users);
  result.usersExisted = existingUsers.length;

  if (existingUsers.length === 0 && opts.adminEmail) {
    // No users yet and an ADMIN_EMAIL was provided — pre-seed a shell owner.
    // passwordHash is left null; the account is claimed when the user sets a
    // password via the signup/claim flow (Phase 2).
    await db
      .insert(users)
      .values({
        email: opts.adminEmail.toLowerCase(),
        isAdmin: true,
        isOwner: true,
      })
      .onConflictDoNothing({ target: users.email });
    result.ownerSeeded = true;
    result.ownerEmail = opts.adminEmail.toLowerCase();
  } else if (existingUsers.length > 0) {
    // Make sure at least one owner exists; if somehow none is flagged, promote
    // the oldest account so admin UI is never orphaned.
    const owners = await db.select({ id: users.id }).from(users).where(eq(users.isOwner, true));
    if (owners.length === 0) {
      const oldest = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .orderBy(users.createdAt)
        .limit(1);
      const first = oldest[0];
      if (first) {
        await db
          .update(users)
          .set({ isOwner: true, isAdmin: true, updatedAt: new Date() })
          .where(eq(users.id, first.id));
        result.ownerSeeded = true;
        result.ownerEmail = first.email;
      }
    }
  }

  return result;
}
