import { it, expect } from "vitest";
import {
  dayKey,
  localInstant,
  currentLesson,
  monday,
  addDays,
  type Lesson,
} from "./schedule-time";
const sample: Lesson = {
  id: "one",
  title: "Демо",
  teacher: null,
  room: null,
  startsAt: "2026-11-06T09:00:00Z",
  endsAt: "2026-11-06T10:30:00Z",
  status: "SCHEDULED",
  version: 1,
};
it("uses the university civil day across midnight and week/year boundaries", () => {
  expect(dayKey(new Date("2026-11-06T22:30:00Z"), "Europe/Moscow")).toBe(
    "2026-11-07",
  );
  expect(dayKey(new Date("2026-11-06T22:30:00Z"), "America/Los_Angeles")).toBe(
    "2026-11-06",
  );
  expect(monday("2027-01-01")).toBe("2026-12-28");
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
});
it("maps explicit local dates without host timezone and rejects DST gaps and ambiguous times", () => {
  expect(
    localInstant("2026-11-06", "12:00", "Europe/Moscow").toISOString(),
  ).toBe("2026-11-06T09:00:00.000Z");
  expect(() =>
    localInstant("2026-03-08", "02:30", "America/New_York"),
  ).toThrow();
  expect(() =>
    localInstant("2026-11-01", "01:30", "America/New_York"),
  ).toThrow();
  expect(() => localInstant("2026-02-30", "12:00", "Europe/Moscow")).toThrow();
  expect(() => localInstant("2026-11-06", "24:00", "Europe/Moscow")).toThrow();
});
it("uses half-open lesson boundaries with real progress and all five states", () => {
  const start = Date.parse(sample.startsAt),
    end = Date.parse(sample.endsAt);
  expect(currentLesson([], start).state).toBe("empty");
  expect(currentLesson([sample], start - 1).state).toBe("before");
  expect(currentLesson([sample], start)).toMatchObject({
    state: "current",
    progress: 0,
    remaining: 90,
  });
  expect(currentLesson([sample], (start + end) / 2)).toMatchObject({
    state: "current",
    progress: 50,
    remaining: 45,
  });
  expect(currentLesson([sample], end).state).toBe("after");
  const next = {
    ...sample,
    id: "two",
    startsAt: "2026-11-06T11:00:00Z",
    endsAt: "2026-11-06T12:30:00Z",
  };
  expect(currentLesson([next, sample], end).state).toBe("break");
  expect(currentLesson([{ ...sample, status: "CANCELLED" }], start).state).toBe(
    "empty",
  );
});
