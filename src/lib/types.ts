/**
 * DTO shapes as returned by the JSON API (timestamps are ISO strings). Shared
 * by client components.
 */
export interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  kind: "event" | "protected";
  busy: boolean;
}

export interface TaskDTO {
  id: string;
  title: string;
  notes: string | null;
  durationMinutes: number;
  deadline: string | null;
  earliestStart: string | null;
  priority: number; // 1 highest .. 4 lowest
  location: string | null;
  splittable: boolean;
  minChunkMinutes: number | null;
  energy: "deep" | "shallow" | null;
  status: "todo" | "done";
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  isAdmin: boolean;
  isOwner: boolean;
}
