/**
 * Timezone-aware time helpers built on Luxon.
 *
 * The calendar is rendered in a single display timezone. Every stored instant is
 * UTC; positioning on the grid means "what wall-clock time is this instant in
 * the display zone", and creating/moving means "this wall-clock time in the
 * display zone, as a UTC instant". Doing this through Luxon zones (not fixed
 * offsets) is what keeps events correct across a DST transition.
 */
import { DateTime } from "luxon";

export const SNAP_MINUTES = 15;

/** Sunday-start week containing `instant`, as the zoned start-of-day DateTime. */
export function startOfWeek(instant: DateTime): DateTime {
  const startOfDay = instant.startOf("day");
  // Luxon weekday: Mon=1 … Sun=7. Days since Sunday = weekday % 7.
  return startOfDay.minus({ days: startOfDay.weekday % 7 });
}

export function zonedNow(zone: string): DateTime {
  return DateTime.now().setZone(zone);
}

/** The seven zoned day-starts for the week containing `instant`. */
export function weekDays(instant: DateTime): DateTime[] {
  const start = startOfWeek(instant);
  return Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
}

/** Convert a UTC ISO string to a DateTime in the display zone. */
export function toZoned(iso: string, zone: string): DateTime {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
}

/** Minutes from midnight (in zone) for a zoned DateTime. */
export function minutesFromMidnight(dt: DateTime): number {
  return dt.hour * 60 + dt.minute;
}

/** Round a minute value to the nearest snap increment, clamped to [0, 1440]. */
export function snap(minutes: number, increment = SNAP_MINUTES): number {
  const snapped = Math.round(minutes / increment) * increment;
  return Math.max(0, Math.min(24 * 60, snapped));
}

/**
 * Build a UTC ISO instant from a zoned day and a minutes-from-midnight offset.
 * Uses the zone so the resulting instant is correct across DST.
 */
export function instantFromDayMinutes(dayStart: DateTime, minutes: number, zone: string): string {
  const dt = dayStart
    .setZone(zone)
    .startOf("day")
    .plus({ minutes });
  return dt.toUTC().toISO()!;
}

export function formatTimeRange(startIso: string, endIso: string, zone: string): string {
  const s = toZoned(startIso, zone);
  const e = toZoned(endIso, zone);
  return `${s.toFormat("h:mm a")} – ${e.toFormat("h:mm a")}`;
}

/** Value for a datetime-local input (in the display zone). */
export function toLocalInputValue(iso: string, zone: string): string {
  return toZoned(iso, zone).toFormat("yyyy-LL-dd'T'HH:mm");
}

/** Parse a datetime-local input (interpreted in the display zone) to UTC ISO. */
export function fromLocalInputValue(value: string, zone: string): string {
  return DateTime.fromISO(value, { zone }).toUTC().toISO()!;
}
