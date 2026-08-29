"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import type { CurrentUser, EventDTO, TaskDTO } from "../lib/types.js";
import { api } from "../lib/api-client.js";
import { weekDays, zonedNow } from "../lib/time.js";
import WeekGrid from "./WeekGrid.js";
import EventDialog, { type EventDraft } from "./EventDialog.js";
import TaskSidebar from "./TaskSidebar.js";

interface Props {
  user: CurrentUser;
  timezone: string;
}

export default function CalendarApp({ user, timezone }: Props) {
  const router = useRouter();
  const zone = timezone;
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState<DateTime>(() => zonedNow(zone));
  const [events, setEvents] = useState<EventDTO[]>([]);
  const [tasks, setTasks] = useState<TaskDTO[]>([]);
  const [dialog, setDialog] = useState<EventDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = view === "week" ? weekDays(anchor) : [anchor.startOf("day")];
  const rangeStart = days[0]!.startOf("day");
  const rangeEnd = days[days.length - 1]!.startOf("day").plus({ days: 1 });

  const refreshEvents = useCallback(async () => {
    try {
      const { events } = await api.listEvents(rangeStart.toUTC().toISO()!, rangeEnd.toUTC().toISO()!);
      setEvents(events);
    } catch (err) {
      setError((err as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart.toMillis(), rangeEnd.toMillis()]);

  const refreshTasks = useCallback(async () => {
    try {
      const { tasks } = await api.listTasks();
      setTasks(tasks);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refreshEvents();
  }, [refreshEvents]);
  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  // ---- event handlers ----
  const onCreateDraft = (startIso: string, endIso: string) =>
    setDialog({ title: "", location: "", description: "", startAt: startIso, endAt: endIso, kind: "event" });

  const onOpenEvent = (ev: EventDTO) =>
    setDialog({
      id: ev.id,
      title: ev.title,
      location: ev.location ?? "",
      description: ev.description ?? "",
      startAt: ev.startAt,
      endAt: ev.endAt,
      kind: ev.kind,
    });

  const saveEvent = async (patch: Partial<EventDTO>, id?: string) => {
    if (id) await api.updateEvent(id, patch);
    else await api.createEvent(patch);
    await refreshEvents();
  };
  const deleteEvent = async (id: string) => {
    await api.deleteEvent(id);
    await refreshEvents();
  };

  const onMoveResize = async (id: string, patch: { startAt: string; endAt: string }) => {
    // Optimistic update, then persist.
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    try {
      await api.updateEvent(id, patch);
    } catch (err) {
      setError((err as Error).message);
      await refreshEvents();
    }
  };

  // ---- task handlers ----
  const createTask = async (body: Partial<TaskDTO>) => {
    await api.createTask(body);
    await refreshTasks();
  };
  const updateTask = async (id: string, body: Partial<TaskDTO>) => {
    await api.updateTask(id, body);
    await refreshTasks();
  };
  const deleteTask = async (id: string) => {
    await api.deleteTask(id);
    await refreshTasks();
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    router.replace("/login");
  };

  // ---- navigation ----
  const step = view === "week" ? 7 : 1;
  const label =
    view === "week"
      ? `${days[0]!.toFormat("LLL d")} – ${days[days.length - 1]!.toFormat("LLL d, yyyy")}`
      : anchor.toFormat("cccc, LLL d, yyyy");

  return (
    <div className="app">
      <header className="app-header">
        <span className="brand">Commute</span>
        <button className="btn btn-ghost" onClick={() => setAnchor(zonedNow(zone))}>
          Today
        </button>
        <button className="btn btn-ghost" onClick={() => setAnchor((a) => a.minus({ days: step }))}>
          ‹
        </button>
        <button className="btn btn-ghost" onClick={() => setAnchor((a) => a.plus({ days: step }))}>
          ›
        </button>
        <span className="week-label">{label}</span>
        <div className="spacer" />
        <button
          className={`btn${view === "week" ? " btn-primary" : ""}`}
          onClick={() => setView("week")}
        >
          Week
        </button>
        <button className={`btn${view === "day" ? " btn-primary" : ""}`} onClick={() => setView("day")}>
          Day
        </button>
        <span className="muted" style={{ marginLeft: "0.5rem" }} title={`Timezone: ${zone}`}>
          {zone}
        </span>
        <button className="btn btn-ghost" onClick={logout} title={user.email}>
          Sign out
        </button>
      </header>

      {error && (
        <div className="auth-error" style={{ margin: "0.5rem 1rem" }} onClick={() => setError(null)}>
          {error} (click to dismiss)
        </div>
      )}

      <div className="app-body">
        <div className="calendar-pane">
          <WeekGrid
            days={days}
            events={events}
            zone={zone}
            onCreateDraft={onCreateDraft}
            onMoveResize={onMoveResize}
            onOpenEvent={onOpenEvent}
          />
        </div>
        <TaskSidebar
          tasks={tasks}
          zone={zone}
          onCreate={createTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      </div>

      {dialog && (
        <EventDialog
          draft={dialog}
          zone={zone}
          onSave={saveEvent}
          onDelete={deleteEvent}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
