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
  index,
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
 * Calendar events: concrete, time-placed entries (manual events now; fixed
 * lectures/shifts and recurrence in later phases). Immovable relative to the
 * scheduler — the scheduler works around them.
 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // Freeform location for now; becomes a Places reference in Phase 4.
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    // 'event' = ordinary entry; 'protected' = recurring commitment (Phase 3).
    kind: text("kind").notNull().default("event"),
    // Whether this event blocks time for scheduling.
    busy: boolean("busy").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_user_start_idx").on(t.userId, t.startAt),
    check("events_time_order", sql`${t.endAt} >= ${t.startAt}`),
    check("events_kind", sql`${t.kind} in ('event','protected')`),
  ],
);

/**
 * Tasks: flexible work to be scheduled. In Phase 2 these are a manually managed
 * backlog (CRUD only). The scheduler places them onto the calendar in Phase 3,
 * which is why the scheduling inputs (deadline, priority, splittable, energy…)
 * are modeled now.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    // Estimated effort in minutes.
    durationMinutes: integer("duration_minutes").notNull().default(30),
    deadline: timestamp("deadline", { withTimezone: true }),
    earliestStart: timestamp("earliest_start", { withTimezone: true }),
    // 1 = highest (urgent) … 4 = lowest. See scheduler ordering (§3).
    priority: integer("priority").notNull().default(3),
    location: text("location"),
    splittable: boolean("splittable").notNull().default(false),
    minChunkMinutes: integer("min_chunk_minutes"),
    // 'deep' | 'shallow' | null
    energy: text("energy"),
    // 'todo' | 'done'
    status: text("status").notNull().default("todo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_user_status_idx").on(t.userId, t.status),
    check("tasks_priority_range", sql`${t.priority} between 1 and 4`),
    check("tasks_duration_positive", sql`${t.durationMinutes} > 0`),
    check("tasks_energy", sql`${t.energy} is null or ${t.energy} in ('deep','shallow')`),
    check("tasks_status", sql`${t.status} in ('todo','done')`),
  ],
);

/**
 * The set of tables the health check verifies exist. Update this list when
 * adding tables that must be present for the app to be considered healthy.
 */
export const REQUIRED_TABLES = ["settings", "users", "events", "tasks"] as const;
