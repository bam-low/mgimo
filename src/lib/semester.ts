import { z } from "zod";
import { addDays, monday } from "./schedule-time";
export function civilDay(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value.slice(0, 4) !== "0000" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export const civil = z
  .string()
  .refine(civilDay, "Укажите существующую дату ГГГГ-ММ-ДД");
export const label = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (v) => ![...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
    "Недопустимые символы",
  );
export const calendarInput = z
  .object({
    name: label,
    start: civil,
    end: civil,
    anchor: civil,
    exclusions: z
      .array(
        z
          .object({
            from: civil,
            to: civil,
            reason: z.string().trim().max(200),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.start > v.end)
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Окончание раньше начала",
      });
    if (civilDay(v.anchor) && monday(v.anchor) !== v.anchor)
      ctx.addIssue({
        code: "custom",
        path: ["anchor"],
        message: "Опорная дата должна быть понедельником",
      });
    v.exclusions.forEach((e, i) => {
      if (e.from > e.to || e.from < v.start || e.to > v.end)
        ctx.addIssue({
          code: "custom",
          path: ["exclusions", i],
          message: "Исключение должно целиком находиться внутри семестра",
        });
    });
  });
export type Calendar = z.infer<typeof calendarInput>;
export function parity(day: string, anchor: string): "A" | "B" {
  return Math.abs(
    Math.floor((Date.parse(monday(day)) - Date.parse(anchor)) / 604800000) % 2,
  ) === 0
    ? "A"
    : "B";
}
export function excluded(day: string, calendar: Calendar) {
  return calendar.exclusions.some((e) => e.from <= day && day <= e.to);
}
export const ruleInput = z
  .object({
    subjectId: z.string().min(1).max(100),
    teacherId: z.string().min(1).max(100).nullable(),
    roomId: z.string().min(1).max(100).nullable(),
    groupIds: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(50)
      .refine((v) => new Set(v).size === v.length, "Группа выбрана дважды"),
    recurrence: z.enum(["EVERY", "A", "B", "ONCE"]),
    weekday: z.number().int().min(1).max(7),
    once: civil,
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict()
  .refine((v) => v.startTime < v.endTime, "Окончание должно быть позже начала");
export type Rule = z.infer<typeof ruleInput>;
// Bounds concern materialisation, never the permissible calendar or academic year.
export function dates(calendar: Calendar, rule: Rule) {
  const days: string[] = [],
    skipped: string[] = [];
  let count = 0;
  const take = (day: string) => {
    if (++count > 1000)
      throw new Error(
        "Не более 1000 дат за публикацию. Сократите период шаблона.",
      );
    (excluded(day, calendar) ? skipped : days).push(day);
  };
  if (rule.recurrence === "ONCE") {
    if (rule.once < calendar.start || rule.once > calendar.end)
      throw new Error("Дата занятия вне семестра");
    take(rule.once);
  } else {
    let day = addDays(monday(calendar.start), rule.weekday - 1);
    if (day < calendar.start) day = addDays(day, 7);
    while (day <= calendar.end) {
      if (
        rule.recurrence === "EVERY" ||
        parity(day, calendar.anchor) === rule.recurrence
      )
        take(day);
      const next = addDays(day, 7);
      if (!civilDay(next)) break;
      day = next;
    }
  }
  return { days, skipped };
}

// Compare effective exclusions, ignoring notes, order and overlapping ranges.
export function calendarKey(calendar: Calendar) {
  const merged: { from: string; to: string }[] = [];
  for (const e of [...calendar.exclusions].sort((a, b) =>
    a.from.localeCompare(b.from),
  )) {
    const last = merged.at(-1);
    if (last && e.from <= addDays(last.to, 1))
      last.to = last.to > e.to ? last.to : e.to;
    else merged.push({ from: e.from, to: e.to });
  }
  return JSON.stringify({
    start: calendar.start,
    end: calendar.end,
    anchor: calendar.anchor,
    exclusions: merged,
  });
}
