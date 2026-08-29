"use client";

import { useState, type FormEvent } from "react";
import type { EventDTO } from "../lib/types.js";
import { toLocalInputValue, fromLocalInputValue } from "../lib/time.js";

export interface EventDraft {
  id?: string;
  title: string;
  location: string;
  description: string;
  startAt: string; // UTC ISO
  endAt: string; // UTC ISO
  kind: "event" | "protected";
}

interface Props {
  draft: EventDraft;
  zone: string;
  onSave: (patch: Partial<EventDTO>, id?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}

export default function EventDialog({ draft, zone, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(draft.title);
  const [location, setLocation] = useState(draft.location);
  const [description, setDescription] = useState(draft.description);
  const [start, setStart] = useState(toLocalInputValue(draft.startAt, zone));
  const [end, setEnd] = useState(toLocalInputValue(draft.endAt, zone));
  const [kind, setKind] = useState<"event" | "protected">(draft.kind);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const startIso = fromLocalInputValue(start, zone);
    const endIso = fromLocalInputValue(end, zone);
    if (new Date(endIso) <= new Date(startIso)) {
      setError("End must be after start.");
      return;
    }
    setBusy(true);
    try {
      await onSave(
        {
          title: title.trim(),
          location: location.trim() || null,
          description: description.trim() || null,
          startAt: startIso,
          endAt: endIso,
          kind,
        },
        draft.id,
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
        <h3>{draft.id ? "Edit event" : "New event"}</h3>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Start</label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div className="field">
              <label>End</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Address or place (used for travel time later)"
            />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as "event" | "protected")}>
              <option value="event">Event</option>
              <option value="protected">Protected (recurring commitment)</option>
            </select>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="modal-actions">
            {draft.id && onDelete ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete(draft.id!);
                    onClose();
                  } catch (err) {
                    setError((err as Error).message);
                    setBusy(false);
                  }
                }}
              >
                Delete
              </button>
            ) : (
              <span />
            )}
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
