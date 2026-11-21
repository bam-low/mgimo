import type { Lesson } from "@/lib/schedule-time";
import { timeLabel } from "@/lib/schedule-time";
import { examKindLabel } from "@/lib/session";

function when(iso: string, timeZone: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(d);
  return `${day}, ${timeLabel(d, timeZone)}`;
}

/** Плашки пары: тип экзамена, «Перенесено» и строкой ниже — откуда. */
export function LessonFlags({
  lesson,
  timezone,
}: {
  lesson: Lesson;
  timezone: string;
}) {
  const exam = lesson.kind === "EXAM";
  if (!exam && !lesson.moved) return null;
  return (
    <>
      <span className="lesson-flags">
        {exam && (
          <span className="flag flag-exam">
            {examKindLabel(lesson.examKind ?? "EXAM")}
          </span>
        )}
        {lesson.moved && (
          <span className="flag flag-moved" data-testid="lesson-moved">
            Перенесено
          </span>
        )}
      </span>
      {lesson.moved && (
        <span className="lesson-was">
          было {when(lesson.moved.fromStartsAt, timezone)}
          {lesson.moved.fromRoom && lesson.moved.fromRoom !== lesson.room
            ? ` · ${lesson.moved.fromRoom}`
            : ""}
        </span>
      )}
    </>
  );
}
