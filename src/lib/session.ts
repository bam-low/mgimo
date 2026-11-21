import { z } from "zod";
import { civil } from "./semester";

export const examKinds = {
  EXAM: "Экзамен",
  CREDIT: "Зачёт",
  DIFF_CREDIT: "Дифф. зачёт",
  CONSULTATION: "Консультация",
} as const;
export type ExamKind = keyof typeof examKinds;
export const examKindLabel = (k: string) =>
  examKinds[k as ExamKind] ?? "Экзамен";

const id = z.string().min(1).max(100);
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время ЧЧ:ММ");
const slot = {
  day: civil,
  startTime: time,
  endTime: time,
  teacherId: id,
  roomId: id,
};
export const examInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      operationId: z.uuid(),
      kind: z.enum(Object.keys(examKinds) as [ExamKind, ...ExamKind[]]),
      subjectId: id,
      groupIds: z.array(id).min(1, "Выберите группу").max(20),
      ...slot,
    })
    .strict(),
  z
    .object({
      action: z.literal("MOVE"),
      id: z.uuid(),
      version: z.number().int().positive(),
      ...slot,
    })
    .strict(),
  z
    .object({
      action: z.literal("CANCEL"),
      id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
]);

/** Сдано: оценка 3–5 или «зачтено». Консультация результата не имеет. */
export function passed(r: {
  kind: string;
  mark: number | null;
  credit: string | null;
}) {
  return r.kind === "MARK" ? (r.mark ?? 0) >= 3 : r.credit === "PASSED";
}

/** «через 5 дн.», «завтра», «сегодня» — по календарным дням вуза. */
export function daysUntil(today: string, day: string) {
  return Math.round(
    (Date.parse(day + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
      86400000,
  );
}
export function countdownLabel(days: number) {
  if (days <= 0) return "сегодня";
  if (days === 1) return "завтра";
  const n = days % 100,
    d = days % 10;
  const word =
    n >= 11 && n <= 14
      ? "дней"
      : d === 1
        ? "день"
        : d >= 2 && d <= 4
          ? "дня"
          : "дней";
  return `через ${days} ${word}`;
}
