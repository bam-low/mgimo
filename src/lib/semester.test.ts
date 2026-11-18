import { expect, it } from "vitest";
import {
  calendarInput,
  civilDay,
  dates,
  parity,
  type Calendar,
  type Rule,
} from "./semester";
import { localInstant } from "./schedule-time";
const calendar: Calendar = {
  name: "Демо учебный цикл",
  start: "2026-09-01",
  end: "2026-09-30",
  anchor: "2026-08-31",
  exclusions: [
    { from: "2026-09-08", to: "2026-09-15", reason: "Демо" },
    { from: "2026-09-08", to: "2026-09-08", reason: "Перекрытие" },
  ],
};
const rule: Rule = {
  recurrence: "A",
  weekday: 2,
  once: calendar.start,
  subjectId: "s",
  teacherId: null,
  roomId: null,
  groupIds: ["g"],
  startTime: "09:00",
  endTime: "10:00",
};
it("empty and impossible calendar fields return validation errors without throwing", () => {
  for (const anchor of ["", "31.02.2038", "2038-02-31"])
    expect(calendarInput.safeParse({ ...calendar, anchor }).success).toBe(
      false,
    );
});
it("anchors A/B independently of ISO year or excluded weeks; union of exclusions counts a slot only once", () => {
  expect(parity("2026-09-01", calendar.anchor)).toBe("A");
  expect(parity("2026-09-08", calendar.anchor)).toBe("B");
  expect(parity("2026-09-15", calendar.anchor)).toBe("A");
  expect(parity("2026-08-24", calendar.anchor)).toBe("B");
  expect(dates(calendar, rule)).toEqual({
    days: ["2026-09-01", "2026-09-29"],
    skipped: ["2026-09-15"],
  });
  expect(dates(calendar, { ...rule, recurrence: "EVERY" }).skipped).toEqual([
    "2026-09-08",
    "2026-09-15",
  ]);
});
it("accepts arbitrary names, years and duration; validates impossible dates, anchor and entire exclusions", () => {
  expect(
    calendarInput.safeParse({
      ...calendar,
      start: "2140-02-01",
      end: "2142-07-23",
      anchor: "2140-02-01",
      exclusions: [],
    }).success,
  ).toBe(true);
  for (const day of ["2026-02-31", "2027-02-29", "0000-01-01", "2026/09/01"])
    expect(civilDay(day)).toBe(false);
  expect(civilDay("2400-02-29")).toBe(true);
  for (const patch of [
    { name: " " },
    { start: "2026-10-01" },
    { anchor: "2026-09-01" },
    { exclusions: [{ from: "2026-08-31", to: "2026-09-02", reason: "" }] },
  ])
    expect(calendarInput.safeParse({ ...calendar, ...patch }).success).toBe(
      false,
    );
  expect(() =>
    dates(
      { ...calendar, start: "2000-01-01", end: "2200-01-01", exclusions: [] },
      { ...rule, recurrence: "EVERY" },
    ),
  ).toThrow(/1000/);
});
it("DST gaps and duplicate wall times are rejected, arbitrary semester years resolve without browser zone", () => {
  expect(() => localInstant("2027-03-28", "02:30", "Europe/Berlin")).toThrow();
  expect(() => localInstant("2027-10-31", "02:30", "Europe/Berlin")).toThrow();
  expect(
    localInstant("2140-02-02", "09:00", "Europe/Moscow").toISOString(),
  ).toBe("2140-02-02T06:00:00.000Z");
});

it("partial first/last weeks, weekend starts and year changes keep the configured parity", () => {
  const c = {
    ...calendar,
    start: "2026-09-01",
    end: "2026-09-17",
    exclusions: [],
  };
  expect(dates(c, { ...rule, recurrence: "A", weekday: 1 }).days).toEqual([
    "2026-09-14",
  ]);
  expect(dates(c, { ...rule, recurrence: "B", weekday: 2 }).days).toEqual([
    "2026-09-08",
  ]);
  expect(
    dates({ ...c, anchor: "2026-08-24" }, { ...rule, recurrence: "B" }).days,
  ).toEqual(["2026-09-01", "2026-09-15"]);
  expect(() =>
    dates(c, { ...rule, recurrence: "ONCE", once: "2026-08-31" }),
  ).toThrow(/вне семестра/);
  const weekend = { ...c, start: "2026-09-05", end: "2026-09-06" };
  expect(dates(weekend, { ...rule, weekday: 6 }).days).toEqual(["2026-09-05"]);
  expect(dates(weekend, { ...rule, weekday: 1 }).days).toEqual([]);
  expect(
    dates(
      { ...c, start: "2026-12-30", end: "2027-01-05", anchor: "2026-12-28" },
      { ...rule, recurrence: "B", weekday: 1 },
    ).days,
  ).toEqual(["2027-01-04"]);
});
