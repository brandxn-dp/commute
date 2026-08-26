/**
 * Database schema (Drizzle / PostgreSQL).
 *
 * Phase 1 defines only what the skeleton needs: a singleton `settings` row and
 * a `users` table with an owner/admin concept, so first-boot bootstrap has
 * something real to create and the health check has schema to verify.
 *
 * Feature tables (events, tasks, places, travel_cache, calendars, jobs) arrive
 * in later phases. Keeping this small now avoids speculative churn.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  check,
} from "drizzle-orm/pg-core";

/**
 * Application settings. Enforced as a singleton via a CHECK constraint on a
 * fixed id, so there is always exactly one row (or none, before bootstrap).
 */
export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    // Display timezone for the schedule. Stored data is always UTC.
    timezone: text("timezone").notNull().default("America/New_York"),
    // Planning horizon in weeks (§3: 8 weeks minimum, configurable).
    planningHorizonWeeks: integer("planning_horizon_weeks").notNull().default(8),
    // Monthly ceiling on travel-provider API calls (§2 cost control).
    travelMonthlyCallCeiling: integer("travel_monthly_call_ceiling").notNull().default(5000),
    // Schema/bootstrap bookkeeping.
    bootstrappedAt: timestamp("bootstrapped_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

/**
 * User accounts. This is a single-user deployment, but we keep a real users
 * table: the first registered account becomes the owner/admin (§7.4), and this
 * leaves room for a household later without a data-model rewrite.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Nullable until an auth method is wired in Phase 2. Bootstrap can create a
  // shell owner row from ADMIN_EMAIL before any password exists.
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isOwner: boolean("is_owner").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The set of tables the health check verifies exist. Update this list when
 * adding tables that must be present for the app to be considered healthy.
 */
export const REQUIRED_TABLES = ["settings", "users"] as const;
