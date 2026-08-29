/**
 * Task repository. Scoped to userId. Phase 2 is CRUD only; the scheduler
 * consumes these in Phase 3.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { tasks } from "../../db/schema.js";
import type { TaskCreateInput, TaskUpdateInput } from "../validation.js";

export type TaskRow = typeof tasks.$inferSelect;

/** All tasks for the user, ordered by priority then deadline (nulls last). */
export async function listTasks(db: Db, userId: string): Promise<TaskRow[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(asc(tasks.priority), asc(tasks.deadline), asc(tasks.createdAt));
}

export async function createTask(
  db: Db,
  userId: string,
  input: TaskCreateInput,
): Promise<TaskRow> {
  const rows = await db
    .insert(tasks)
    .values({
      userId,
      title: input.title,
      notes: input.notes ?? null,
      durationMinutes: input.durationMinutes,
      deadline: input.deadline ?? null,
      earliestStart: input.earliestStart ?? null,
      priority: input.priority,
      location: input.location ?? null,
      splittable: input.splittable,
      minChunkMinutes: input.minChunkMinutes ?? null,
      energy: input.energy ?? null,
      status: input.status,
    })
    .returning();
  return rows[0]!;
}

export async function updateTask(
  db: Db,
  userId: string,
  id: string,
  input: TaskUpdateInput,
): Promise<TaskRow | null> {
  const patch: Partial<TaskRow> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.durationMinutes !== undefined) patch.durationMinutes = input.durationMinutes;
  if (input.deadline !== undefined) patch.deadline = input.deadline;
  if (input.earliestStart !== undefined) patch.earliestStart = input.earliestStart;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.location !== undefined) patch.location = input.location;
  if (input.splittable !== undefined) patch.splittable = input.splittable;
  if (input.minChunkMinutes !== undefined) patch.minChunkMinutes = input.minChunkMinutes;
  if (input.energy !== undefined) patch.energy = input.energy;
  if (input.status !== undefined) patch.status = input.status;

  const rows = await db
    .update(tasks)
    .set(patch)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteTask(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });
  return rows.length > 0;
}
