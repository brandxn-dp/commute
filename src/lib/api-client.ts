/**
 * Typed client-side fetch wrappers for the JSON API. Throw ApiError on non-2xx.
 */
import type { EventDTO, TaskDTO } from "./types.js";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? res.statusText, res.status, data?.details);
  }
  return data as T;
}

export const api = {
  // events
  listEvents: (fromIso: string, toIso: string) =>
    req<{ events: EventDTO[] }>(
      `/api/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
    ),
  createEvent: (body: Partial<EventDTO>) =>
    req<{ event: EventDTO }>(`/api/events`, { method: "POST", body: JSON.stringify(body) }),
  updateEvent: (id: string, body: Partial<EventDTO>) =>
    req<{ event: EventDTO }>(`/api/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEvent: (id: string) => req<{ ok: true }>(`/api/events/${id}`, { method: "DELETE" }),

  // tasks
  listTasks: () => req<{ tasks: TaskDTO[] }>(`/api/tasks`),
  createTask: (body: Partial<TaskDTO>) =>
    req<{ task: TaskDTO }>(`/api/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: Partial<TaskDTO>) =>
    req<{ task: TaskDTO }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTask: (id: string) => req<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),

  // auth
  logout: () => req<{ ok: true }>(`/api/auth/logout`, { method: "POST" }),
};
