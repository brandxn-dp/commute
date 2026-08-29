"use client";

import { useState, type FormEvent } from "react";
import type { TaskDTO } from "../lib/types.js";
import { toLocalInputValue, fromLocalInputValue, toZoned } from "../lib/time.js";

const PRIORITY_LABELS: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low" };

interface Props {
  tasks: TaskDTO[];
  zone: string;
  onCreate: (body: Partial<TaskDTO>) => Promise<void>;
  onUpdate: (id: string, body: Partial<TaskDTO>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export default function TaskSidebar({ tasks, zone, onCreate, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<TaskDTO | null>(null);
  const [creating, setCreating] = useState(false);

  const todo = tasks.filter((t) => t.status === "todo");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <aside className="sidebar">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2>Tasks</h2>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Add
        </button>
      </div>

      {todo.length === 0 && <p className="muted">No tasks yet. These get auto-scheduled in a later phase.</p>}

      {todo.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          zone={zone}
          onToggle={() => onUpdate(t.id, { status: "done" })}
          onEdit={() => setEditing(t)}
          onDelete={() => onDelete(t.id)}
        />
      ))}

      {done.length > 0 && (
        <>
          <h2 style={{ marginTop: "1rem" }}>Done</h2>
          {done.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              zone={zone}
              onToggle={() => onUpdate(t.id, { status: "todo" })}
              onEdit={() => setEditing(t)}
              onDelete={() => onDelete(t.id)}
            />
          ))}
        </>
      )}

      {(creating || editing) && (
        <TaskDialog
          task={editing}
          zone={zone}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={async (body, id) => {
            if (id) await onUpdate(id, body);
            else await onCreate(body);
          }}
        />
      )}
    </aside>
  );
}

function TaskCard({
  task,
  zone,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: TaskDTO;
  zone: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`task p${task.priority}${task.status === "done" ? " done" : ""}`}>
      <div className="task-title">{task.title}</div>
      <div className="task-meta">
        <span>{PRIORITY_LABELS[task.priority]}</span>
        <span>{task.durationMinutes}m</span>
        {task.deadline && <span>due {toZoned(task.deadline, zone).toFormat("LLL d")}</span>}
        {task.energy && <span>{task.energy}</span>}
        {task.location && <span>📍 {task.location}</span>}
      </div>
      <div className="task-actions">
        <button className="btn btn-ghost" onClick={onToggle}>
          {task.status === "done" ? "Reopen" : "Done"}
        </button>
        <button className="btn btn-ghost" onClick={onEdit}>
          Edit
        </button>
        <button className="btn btn-ghost" onClick={onDelete} style={{ marginLeft: "auto" }}>
          ✕
        </button>
      </div>
    </div>
  );
}

function TaskDialog({
  task,
  zone,
  onSave,
  onClose,
}: {
  task: TaskDTO | null;
  zone: string;
  onSave: (body: Partial<TaskDTO>, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [priority, setPriority] = useState(task?.priority ?? 3);
  const [duration, setDuration] = useState(task?.durationMinutes ?? 30);
  const [deadline, setDeadline] = useState(task?.deadline ? toLocalInputValue(task.deadline, zone) : "");
  const [energy, setEnergy] = useState<"" | "deep" | "shallow">(task?.energy ?? "");
  const [splittable, setSplittable] = useState(task?.splittable ?? false);
  const [minChunk, setMinChunk] = useState(task?.minChunkMinutes ?? 30);
  const [location, setLocation] = useState(task?.location ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSave(
        {
          title: title.trim(),
          priority,
          durationMinutes: duration,
          deadline: deadline ? fromLocalInputValue(deadline, zone) : null,
          energy: energy || null,
          splittable,
          minChunkMinutes: splittable ? minChunk : null,
          location: location.trim() || null,
          notes: notes.trim() || null,
        },
        task?.id,
      );
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h3>{task ? "Edit task" : "New task"}</h3>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                <option value={1}>Urgent</option>
                <option value={2}>High</option>
                <option value={3}>Medium</option>
                <option value={4}>Low</option>
              </select>
            </div>
            <div className="field">
              <label>Estimate (min)</label>
              <input
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Deadline</label>
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <div className="field">
              <label>Energy</label>
              <select value={energy} onChange={(e) => setEnergy(e.target.value as "" | "deep" | "shallow")}>
                <option value="">—</option>
                <option value="deep">Deep</option>
                <option value="shallow">Shallow</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={splittable}
                  onChange={(e) => setSplittable(e.target.checked)}
                />{" "}
                Splittable
              </label>
            </div>
            {splittable && (
              <div className="field">
                <label>Min chunk (min)</label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={minChunk}
                  onChange={(e) => setMinChunk(Number(e.target.value))}
                />
              </div>
            )}
          </div>
          <div className="field">
            <label>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="modal-actions">
            <span />
            <div className="right">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
