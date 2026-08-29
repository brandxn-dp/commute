import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import {
  toZoned,
  minutesFromMidnight,
  snap,
  instantFromDayMinutes,
  startOfWeek,
  weekDays,
} from "../src/lib/time.js";

const NY = "America/New_York";

describe("timezone conversion", () => {
  it("renders a UTC instant in the display zone", () => {
    // 14:00 UTC on 2026-08-26 is 10:00 EDT (UTC-4).
    const dt = toZoned("2026-08-26T14:00:00Z", NY);
    expect(dt.toFormat("yyyy-LL-dd HH:mm")).toBe("2026-08-26 10:00");
    expect(minutesFromMidnight(dt)).toBe(10 * 60);
  });

  it("round-trips day+minutes -> UTC -> zoned", () => {
    const day = DateTime.fromISO("2026-08-26", { zone: NY });
    const iso = instantFromDayMinutes(day, 10 * 60, NY);
    expect(toZoned(iso, NY).toFormat("HH:mm")).toBe("10:00");
  });
});

describe("DST correctness (a lecture must not drift across a DST change)", () => {
  it("keeps a 6pm local lecture at 6pm local on both sides of spring-forward", () => {
    // US DST begins 2026-03-08. Pick a class before and after.
    const before = DateTime.fromISO("2026-03-01", { zone: NY }); // EST (UTC-5)
    const after = DateTime.fromISO("2026-03-15", { zone: NY }); // EDT (UTC-4)

    const isoBefore = instantFromDayMinutes(before, 18 * 60, NY);
    const isoAfter = instantFromDayMinutes(after, 18 * 60, NY);

    // The stored UTC instants differ by the offset change...
    expect(toZoned(isoBefore, "utc").toFormat("HH:mm")).toBe("23:00"); // 18:00 EST -> 23:00Z
    expect(toZoned(isoAfter, "utc").toFormat("HH:mm")).toBe("22:00"); // 18:00 EDT -> 22:00Z

    // ...but both render as 6:00 PM local. No drift.
    expect(toZoned(isoBefore, NY).toFormat("HH:mm")).toBe("18:00");
    expect(toZoned(isoAfter, NY).toFormat("HH:mm")).toBe("18:00");
  });
});

describe("snapping", () => {
  it("snaps to 15-minute increments and clamps", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(52)).toBe(45); // nearest 15 to 52 is 45
    expect(snap(53)).toBe(60);
    expect(snap(-10)).toBe(0);
    expect(snap(99999)).toBe(24 * 60);
  });
});

describe("week helpers", () => {
  it("startOfWeek returns the Sunday for any day in the week", () => {
    // 2026-08-26 is a Wednesday; its week starts Sunday 2026-08-23.
    const wed = DateTime.fromISO("2026-08-26", { zone: NY });
    expect(startOfWeek(wed).toFormat("yyyy-LL-dd")).toBe("2026-08-23");
  });

  it("weekDays yields 7 consecutive days from Sunday", () => {
    const days = weekDays(DateTime.fromISO("2026-08-26", { zone: NY }));
    expect(days).toHaveLength(7);
    expect(days[0]!.toFormat("ccc")).toBe("Sun");
    expect(days[6]!.toFormat("yyyy-LL-dd")).toBe("2026-08-29");
  });
});
