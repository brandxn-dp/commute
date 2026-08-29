/**
 * Event repository. All queries are scoped to a userId (single-user today, but
 * scoping now keeps the door open and prevents accidental cross-user reads).
 */
import { and, eq, gte, lt } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { events } from "../../db/schema.js";
import type { EventCreateInput, EventUpdateInput } from "../validation.js";

export type EventRow = typeof events.$inferSelect;

/** Events overlapping the [from, to) window, ordered by start. */
export async function listEvents(
  db: Db,
  userId: string,
  from: Date,
  to: Date,
): Promise<EventRow[]> {
  // Overlap: event starts before `to` and ends after `from`.
  return db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId), lt(events.startAt, to), gte(events.endAt, from)))
    .orderBy(events.startAt);
}

export async function createEvent(
  db: Db,
  userId: string,
  input: EventCreateInput,
): Promise<EventRow> {
  const rows = await db
    .insert(events)
    .values({
      userId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay,
      kind: input.kind,
      busy: input.busy,
    })
    .returning();
  return rows[0]!;
}

export async function updateEvent(
  db: Db,
  userId: string,
  id: string,
  input: EventUpdateInput,
): Promise<EventRow | null> {
  const patch: Partial<EventRow> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.location !== undefined) patch.location = input.location;
  if (input.startAt !== undefined) patch.startAt = input.startAt;
  if (input.endAt !== undefined) patch.endAt = input.endAt;
  if (input.allDay !== undefined) patch.allDay = input.allDay;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.busy !== undefined) patch.busy = input.busy;

  const rows = await db
    .update(events)
    .set(patch)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteEvent(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.userId, userId)))
    .returning({ id: events.id });
  return rows.length > 0;
}
