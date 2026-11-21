// Civil days belong to the University, never to the browser's local timezone.
export function dayKey(instant: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}
export function validDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number(day.slice(0, 4)) >= 2000 &&
    Number(day.slice(0, 4)) <= 2100 &&
    !Number.isNaN(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function addDays(day: string, count: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + count * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function monday(day: string) {
  return addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
}
export function timeLabel(instant: Date, zone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
// Find possible instants from actual IANA offsets. Reject nonexistent/ambiguous
// wall times instead of guessing during a DST change. No process-TZ dependency.
export function localInstant(day: string, time: string, zone: string) {
  if (
    !(
      /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      day.slice(0, 4) !== "0000" &&
      !Number.isNaN(Date.parse(day)) &&
      new Date(day).toISOString().slice(0, 10) === day
    ) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw Error("Invalid local time");
  const naive = Date.parse(`${day}T${time}:00Z`),
    offsets = new Set<number>();
  for (const hours of [-24, -12, 0, 12, 24]) {
    const d = new Date(naive + hours * 3600000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "longOffset",
    }).formatToParts(d);
    const offset = parts.find((p) => p.type === "timeZoneName")!.value;
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
    offsets.add(m ? (m[1] === "+" ? 1 : -1) * (+m[2] * 60 + +m[3]) * 60000 : 0);
  }
  const possible = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((d) => dayKey(d, zone) === day && timeLabel(d, zone) === time);
  if (possible.length !== 1) throw Error("Ambiguous or nonexistent local time");
  return possible[0];
}
export type Lesson = {
  id: string;
  title: string;
  teacher: string | null;
  room: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  version: number;
  semesterId?: string | null;
  /** EXAM — экзамен или зачёт сессии в общем списке дня. */
  kind?: "LESSON" | "EXAM";
  examKind?: string;
  /** Последний перенос: откуда перенесли (для плашки «Перенесено»). */
  moved?: {
    fromStartsAt: string;
    fromEndsAt: string | null;
    fromRoom: string | null;
  } | null;
};
export function currentLesson(lessons: Lesson[], now: number) {
  const active = lessons
    .filter((l) => l.status === "SCHEDULED")
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const lesson = active.find(
    (l) => Date.parse(l.startsAt) <= now && now < Date.parse(l.endsAt),
  );
  if (lesson) {
    const progress = Math.max(
      0,
      Math.min(
        100,
        ((now - Date.parse(lesson.startsAt)) /
          (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt))) *
          100,
      ),
    );
    return {
      state: "current" as const,
      lesson,
      progress,
      remaining: Math.ceil((Date.parse(lesson.endsAt) - now) / 60000),
    };
  }
  return {
    state: !active.length
      ? ("empty" as const)
      : now < Date.parse(active[0].startsAt)
        ? ("before" as const)
        : now >= Date.parse(active.at(-1)!.endsAt)
          ? ("after" as const)
          : ("break" as const),
  };
}
