/**
 * Input validation schemas (zod) for the API layer. Kept separate from the DB
 * schema so request parsing is explicit and errors are structured.
 */
import { z } from "zod";

// Accept ISO strings or Date; produce Date.
const dateInput = z.coerce.date();

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1, "title is required").max(500),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    startAt: dateInput,
    endAt: dateInput,
    allDay: z.boolean().optional().default(false),
    kind: z.enum(["event", "protected"]).optional().default("event"),
    busy: z.boolean().optional().default(true),
  })
  .refine((v) => v.endAt.getTime() >= v.startAt.getTime(), {
    message: "endAt must be at or after startAt",
    path: ["endAt"],
  });

// Partial update; all fields optional but the time-order rule still holds when
// both are present.
export const eventUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(5000).optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    startAt: dateInput.optional(),
    endAt: dateInput.optional(),
    allDay: z.boolean().optional(),
    kind: z.enum(["event", "protected"]).optional(),
    busy: z.boolean().optional(),
  })
  .refine(
    (v) => v.startAt === undefined || v.endAt === undefined || v.endAt.getTime() >= v.startAt.getTime(),
    { message: "endAt must be at or after startAt", path: ["endAt"] },
  );

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(500),
  notes: z.string().max(5000).optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().max(24 * 60).default(30),
  deadline: dateInput.optional().nullable(),
  earliestStart: dateInput.optional().nullable(),
  priority: z.coerce.number().int().min(1).max(4).default(3),
  location: z.string().max(500).optional().nullable(),
  splittable: z.boolean().optional().default(false),
  minChunkMinutes: z.coerce.number().int().positive().max(24 * 60).optional().nullable(),
  energy: z.enum(["deep", "shallow"]).optional().nullable(),
  status: z.enum(["todo", "done"]).optional().default("todo"),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  notes: z.string().max(5000).optional().nullable(),
  durationMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
  deadline: dateInput.optional().nullable(),
  earliestStart: dateInput.optional().nullable(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  location: z.string().max(500).optional().nullable(),
  splittable: z.boolean().optional(),
  minChunkMinutes: z.coerce.number().int().positive().max(24 * 60).optional().nullable(),
  energy: z.enum(["deep", "shallow"]).optional().nullable(),
  status: z.enum(["todo", "done"]).optional(),
});

export const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, "password must be at least 8 characters").max(200),
});

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
