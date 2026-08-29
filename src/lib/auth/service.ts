/**
 * Auth service — the DB-facing account logic.
 *
 * This is a single-user deployment. The flow:
 *   - "needs setup": no account has a password yet. The setup page lets the
 *     owner choose a password. If bootstrap seeded a shell owner from
 *     ADMIN_EMAIL, setup claims that row; otherwise it creates the owner.
 *   - "ready": an owner with a password exists. Only login is offered; no open
 *     registration (this is not multi-user).
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";

export type AuthState = "needs_setup" | "ready";

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}

function toPublic(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    isOwner: row.isOwner,
  };
}

/** Whether any account has a password set. */
export async function getAuthState(db: Db): Promise<AuthState> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`${users.passwordHash} is not null`);
  return (rows[0]?.count ?? 0) > 0 ? "ready" : "needs_setup";
}

/**
 * Claim/create the owner account with a password. Only valid while no account
 * has a password. Returns the created/updated public user.
 */
export async function setupOwner(
  db: Db,
  email: string,
  password: string,
): Promise<PublicUser> {
  const state = await getAuthState(db);
  if (state !== "needs_setup") {
    throw new Error("setup already completed");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing[0]) {
    const updated = await db
      .update(users)
      .set({ passwordHash, isOwner: true, isAdmin: true, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id))
      .returning();
    return toPublic(updated[0]!);
  }

  const created = await db
    .insert(users)
    .values({ email: normalizedEmail, passwordHash, isOwner: true, isAdmin: true })
    .returning();
  return toPublic(created[0]!);
}

/**
 * Verify credentials. Returns the public user on success, null otherwise.
 * Performs a dummy hash comparison on unknown emails to avoid leaking, via
 * timing, whether an email exists.
 */
export async function login(
  db: Db,
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  const row = rows[0];

  if (!row || !row.passwordHash) {
    // Constant-ish work even when the account is missing.
    await verifyPassword(password, "scrypt$16384$8$1$00$00").catch(() => false);
    return null;
  }
  const ok = await verifyPassword(password, row.passwordHash);
  return ok ? toPublic(row) : null;
}

export async function getUserById(db: Db, id: string): Promise<PublicUser | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ? toPublic(rows[0]) : null;
}
