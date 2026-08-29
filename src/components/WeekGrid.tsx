"use client";

import { useCallbackRef } from "./useCallbackRef.js";
import { useRef, useState } from "react";
import { DateTime } from "luxon";
import type { EventDTO } from "../lib/types.js";
import { minutesFromMidnight, toZoned, snap, instantFromDayMinutes } from "../lib/time.js";

const HOUR_HEIGHT = 48;
const PX_PER_MIN = HOUR_HEIGHT / 60;
const DAY_HEIGHT = 24 * HOUR_HEIGHT;
const MIN_DURATION = 15;

interface Props {
  days: DateTime[]; // zoned day-starts
  events: EventDTO[];
  zone: string;
  onCreateDraft: (startIso: string, endIso: string) => void;
  onMoveResize: (id: string, patch: { startAt: string; endAt: string }) => void;
  onOpenEvent: (event: EventDTO) => void;
}

type Interaction =
  | { type: "create"; dayIndex: number; startMin: number; curMin: number }
  | {
      type: "move";
      id: string;
      grabOffsetMin: number;
      durationMin: number;
      curDayIndex: number;
      curStartMin: number;
    }
  | { type: "resize"; id: string; dayIndex: number; startMin: number; curEndMin: number };

interface Positioned {
  event: EventDTO;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

/** Assign overlapping events to side-by-side lanes (greedy interval colouring). */
function layoutDay(items: { event: EventDTO; startMin: number; endMin: number }[]): Positioned[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const result: Positioned[] = [];
  let cluster: Positioned[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = cluster.reduce((m, p) => Math.max(m, p.lane + 1), 0);
    for (const p of cluster) p.lanes = lanes;
    result.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length > 0 && it.startMin >= clusterEnd) flush();
    const laneEnds: number[] = [];
    for (const p of cluster) laneEnds[p.lane] = Math.max(laneEnds[p.lane] ?? -1, p.endMin);
    let lane = 0;
    while (lane < laneEnds.length && (laneEnds[lane] ?? -1) > it.startMin) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length > 0) flush();
  return result;
}

export default function WeekGrid({ days, events, zone, onCreateDraft, onMoveResize, onOpenEvent }: Props) {
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const dayCellsRef = useRef<(HTMLDivElement | null)[]>([]);
  const interactionRef = useRef<Interaction | null>(null);
  interactionRef.current = interaction;
  // True once a move/resize actually shifted something, so the click that may
  // follow pointerup doesn't re-open the editor.
  const movedRef = useRef(false);

  // Map each event to a day index within this view (by its start, in zone).
  const dayKeys = days.map((d) => d.toFormat("yyyy-LL-dd"));
  const perDay: { event: EventDTO; startMin: number; endMin: number }[][] = days.map(() => []);
  for (const ev of events) {
    const s = toZoned(ev.startAt, zone);
    const key = s.toFormat("yyyy-LL-dd");
    const dayIndex = dayKeys.indexOf(key);
    if (dayIndex < 0) continue;
    const startMin = minutesFromMidnight(s);
    const e = toZoned(ev.endAt, zone);
    const endMinRaw = e.toFormat("yyyy-LL-dd") === key ? minutesFromMidnight(e) : 24 * 60;
    perDay[dayIndex]!.push({ event: ev, startMin, endMin: Math.max(startMin + MIN_DURATION, endMinRaw) });
  }
  const positioned = perDay.map((items) => layoutDay(items));

  // Geometry helper: pointer -> {dayIndex, minutes}.
  function pointerToGrid(clientX: number, clientY: number): { dayIndex: number; minutes: number } {
    const cells = dayCellsRef.current.filter(Boolean) as HTMLDivElement[];
    const first = cells[0];
    if (!first) return { dayIndex: 0, minutes: 0 };
    const rect = first.getBoundingClientRect();
    const colWidth = rect.width;
    const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left) / colWidth)));
    const minutes = snap((clientY - rect.top) / PX_PER_MIN);
    return { dayIndex, minutes };
  }

  // Window-level move/up while an interaction is active.
  /**
   * Begin an interaction. Listeners are attached synchronously here (not via an
   * effect) so a fast click's pointerup is never missed, and so the commit
   * closure captures the current `days`/`zone` rather than a stale snapshot.
   */
  function startInteraction(initial: Interaction) {
    interactionRef.current = initial;
    setInteraction(initial);

    function onMove(e: PointerEvent) {
      const cur = interactionRef.current;
      if (!cur) return;
      const { dayIndex, minutes } = pointerToGrid(e.clientX, e.clientY);
      let next: Interaction;
      if (cur.type === "create") {
        next = { ...cur, curMin: minutes };
      } else if (cur.type === "move") {
        movedRef.current = true;
        next = { ...cur, curDayIndex: dayIndex, curStartMin: snap(minutes - cur.grabOffsetMin) };
      } else {
        movedRef.current = true;
        next = { ...cur, curEndMin: Math.max(cur.startMin + MIN_DURATION, minutes) };
      }
      interactionRef.current = next;
      setInteraction(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const cur = interactionRef.current;
      interactionRef.current = null;
      setInteraction(null);
      if (cur) commit(cur);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function commit(cur: Interaction) {
    if (cur.type === "create") {
      const a = Math.min(cur.startMin, cur.curMin);
      const b = Math.max(cur.startMin, cur.curMin);
      const end = b - a < MIN_DURATION ? a + 60 : b; // a plain click makes a 1h block
      const day = days[cur.dayIndex]!;
      onCreateDraft(instantFromDayMinutes(day, a, zone), instantFromDayMinutes(day, end, zone));
    } else if (cur.type === "move") {
      const day = days[cur.curDayIndex]!;
      const start = Math.max(0, Math.min(24 * 60 - cur.durationMin, cur.curStartMin));
      onMoveResize(cur.id, {
        startAt: instantFromDayMinutes(day, start, zone),
        endAt: instantFromDayMinutes(day, start + cur.durationMin, zone),
      });
    } else {
      const day = days[cur.dayIndex]!;
      onMoveResize(cur.id, {
        startAt: instantFromDayMinutes(day, cur.startMin, zone),
        endAt: instantFromDayMinutes(day, cur.curEndMin, zone),
      });
    }
  }

  const setDayCell = useCallbackRef(dayCellsRef);
  const today = DateTime.now().setZone(zone).toFormat("yyyy-LL-dd");
  const nowMin = minutesFromMidnight(DateTime.now().setZone(zone));

  return (
    <div
      className="cal"
      style={{ gridTemplateColumns: `var(--gutter-width) repeat(${days.length}, minmax(0,1fr))` }}
    >
      <div className="cal-corner" style={{ gridColumn: 1, gridRow: 1 }} />
      {days.map((d, i) => (
        <div
          key={`h${i}`}
          className={`cal-dayhead${d.toFormat("yyyy-LL-dd") === today ? " today" : ""}`}
          style={{ gridColumn: i + 2, gridRow: 1 }}
        >
          <div className="dow">{d.toFormat("ccc")}</div>
          <div className="dom">{d.toFormat("d")}</div>
        </div>
      ))}

      <div className="cal-gutter" style={{ gridColumn: 1, gridRow: 2, height: DAY_HEIGHT }}>
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="hour-label" style={{ position: "absolute", top: h * HOUR_HEIGHT, right: 0 }}>
            {h === 0 ? "" : DateTime.fromObject({ hour: h }).toFormat("h a")}
          </div>
        ))}
      </div>

      {days.map((day, dayIndex) => {
        const isToday = day.toFormat("yyyy-LL-dd") === today;
        return (
          <div
            key={`d${dayIndex}`}
            ref={(el) => setDayCell(dayIndex, el)}
            className="cal-day"
            style={{ gridColumn: dayIndex + 2, gridRow: 2, height: DAY_HEIGHT }}
            onPointerDown={(e) => {
              // Only start a create when the background itself is pressed.
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const min = snap((e.clientY - rect.top) / PX_PER_MIN);
              startInteraction({ type: "create", dayIndex, startMin: min, curMin: min });
            }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <div key={`l${h}`} className="cal-hourline" style={{ top: h * HOUR_HEIGHT }} />
            ))}
            {Array.from({ length: 24 }, (_, h) => (
              <div key={`hl${h}`} className="cal-halfline" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
            ))}
            {isToday && <div className="now-line" style={{ top: nowMin * PX_PER_MIN }} />}

            {positioned[dayIndex]!.map((p) => {
              const cur = interaction;
              let startMin = p.startMin;
              let endMin = p.endMin;
              let dragging = false;
              if (cur && "id" in cur && cur.id === p.event.id) {
                dragging = true;
                if (cur.type === "move") {
                  startMin = cur.curStartMin;
                  endMin = cur.curStartMin + cur.durationMin;
                } else if (cur.type === "resize") {
                  startMin = cur.startMin;
                  endMin = cur.curEndMin;
                }
              }
              // Moving event follows the pointer's current day column.
              const renderInThisDay =
                cur && cur.type === "move" && cur.id === p.event.id ? cur.curDayIndex === dayIndex : true;
              if (!renderInThisDay) return null;

              const widthPct = 100 / p.lanes;
              return (
                <div
                  key={p.event.id}
                  className={`event${p.event.kind === "protected" ? " protected" : ""}${dragging ? " dragging" : ""}`}
                  style={{
                    top: startMin * PX_PER_MIN,
                    height: Math.max(16, (endMin - startMin) * PX_PER_MIN),
                    left: `calc(${p.lane * widthPct}% + 3px)`,
                    width: `calc(${widthPct}% - 6px)`,
                  }}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).classList.contains("resize-handle")) {
                      e.stopPropagation();
                      startInteraction({
                        type: "resize",
                        id: p.event.id,
                        dayIndex,
                        startMin: p.startMin,
                        curEndMin: p.endMin,
                      });
                      return;
                    }
                    e.stopPropagation();
                    movedRef.current = false;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const pointerMin = snap((e.clientY - rect.top) / PX_PER_MIN) + p.startMin;
                    startInteraction({
                      type: "move",
                      id: p.event.id,
                      grabOffsetMin: pointerMin - p.startMin,
                      durationMin: p.endMin - p.startMin,
                      curDayIndex: dayIndex,
                      curStartMin: p.startMin,
                    });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (movedRef.current) {
                      movedRef.current = false;
                      return;
                    }
                    if (!dragging) onOpenEvent(p.event);
                  }}
                  title={p.event.title}
                >
                  <div className="event-title">{p.event.title}</div>
                  <div className="event-time">
                    {formatMin(startMin)}–{formatMin(endMin)}
                  </div>
                  {p.event.location && <div className="event-time">📍 {p.event.location}</div>}
                  <div className="resize-handle" />
                </div>
              );
            })}

            {/* draft-block while creating in this column */}
            {interaction?.type === "create" && interaction.dayIndex === dayIndex && (
              <div
                className="draft-block"
                style={{
                  top: Math.min(interaction.startMin, interaction.curMin) * PX_PER_MIN,
                  height:
                    Math.max(MIN_DURATION, Math.abs(interaction.curMin - interaction.startMin)) * PX_PER_MIN,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return DateTime.fromObject({ hour: h % 24, minute: m }).toFormat("h:mm a");
}
