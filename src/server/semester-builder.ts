import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  Prisma,
  ScheduleTemplate,
  Semester,
} from "../generated/prisma/client";
import { db } from "./db";
import { notifyCancellation } from "./notification-events";
import { Denied } from "./security";
import { lockUniversity, requireStaff, validGroup } from "./enrollment-guards";
import {
  calendarInput,
  calendarKey,
  ruleInput,
  civil,
  dates,
  excluded,
  label,
  type Calendar,
  type Rule,
} from "@/lib/semester";
import { dayKey, localInstant, addDays } from "@/lib/schedule-time";
const id = z.string().min(1).max(100),
  version = z.number().int().positive();
const occurrenceFields = {
  day: civil,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  subjectId: id,
  teacherId: id.nullable(),
  roomId: id.nullable(),
};
const assignmentFields = {
  programId: id,
  subjectId: id,
  kind: z.enum(["LECTURE", "SEMINAR"]),
  groups: z
    .array(z.object({ groupId: id, teacherId: id }).strict())
    .min(1)
    .max(50),
};
export const builderCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("ASSIGNMENT_CREATE"),
      operationId: z.uuid(),
      ...assignmentFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("ASSIGNMENT_EDIT"),
      id,
      version,
      active: z.boolean(),
      ...assignmentFields,
    })
    .strict(),
  z
    .object({
      action: z.literal("SEMESTER_CREATE"),
      operationId: z.uuid(),
      calendar: calendarInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("SEMESTER_EDIT"),
      id,
      version,
      calendar: calendarInput,
    })
    .strict(),
  z
    .object({
      action: z.literal("TEACHER_CREATE"),
      operationId: z.uuid(),
      name: label,
      subjectIds: z.array(id).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("TEACHER_EDIT"),
      id,
      version,
      name: label,
      active: z.boolean(),
      subjectIds: z.array(id).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("ROOM_CREATE"),
      operationId: z.uuid(),
      building: label,
      number: label,
    })
    .strict(),
  z
    .object({
      action: z.literal("ROOM_EDIT"),
      id,
      version,
      building: label,
      number: label,
      active: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("TEMPLATE_CREATE"),
      assignment: z
        .object({ id, version, groupId: id.optional() })
        .strict()
        .optional(),
      operationId: z.uuid(),
      semesterId: id,
      programId: id,
      rule: ruleInput.refine((r) => !!r.teacherId && !!r.roomId, {
        message: "Выберите преподавателя и аудиторию.",
      }),
    })
    .strict(),
  z
    .object({
      action: z.literal("TEMPLATE_FUTURE"),
      id,
      version,
      from: civil,
      rule: ruleInput.refine((r) => !!r.teacherId && !!r.roomId, {
        message: "Выберите преподавателя и аудиторию.",
      }),
    })
    .strict(),
  z
    .object({
      action: z.literal("OCCURRENCE_EDIT"),
      id,
      version,
      ...occurrenceFields,
    })
    .strict(),
  z
    .object({
      action: z.enum([
        "OCCURRENCE_CANCEL",
        "OCCURRENCE_RESTORE",
        "OCCURRENCE_DELETE",
      ]),
      id,
      version,
    })
    .strict(),
  z
    .object({
      action: z.literal("DETACH"),
      id,
      version,
      operationId: z.uuid(),
      groupId: id,
      ...occurrenceFields,
    })
    .strict(),
]);
export const builderRequest = z
  .object({
    command: builderCommand,
    preview: z.boolean(),
    token: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    confirmed: z.boolean().optional(),
  })
  .strict();
export type BuilderCommand = z.infer<typeof builderCommand>;
function reject(message: string, status = 409): never {
  const e = new Denied(status);
  e.message = message;
  throw e;
}
function checkedVersion(row: { version: number } | null, n: number) {
  if (!row) throw new Denied(404);
  if (row.version !== n)
    reject("Данные изменены другим сотрудником. Обновите страницу.");
}
export function asCalendar(row: Semester): Calendar {
  return calendarInput.parse({
    name: row.name,
    start: row.start.toISOString().slice(0, 10),
    end: row.end.toISOString().slice(0, 10),
    anchor: row.anchor.toISOString().slice(0, 10),
    exclusions: row.exclusions,
  });
}
const includeEntry = {
  groups: { where: { active: true }, include: { group: true } },
} satisfies Prisma.ScheduleEntryInclude;
type Entry = Prisma.ScheduleEntryGetPayload<{ include: typeof includeEntry }>;
type Candidate = {
  id: string;
  groupIds: string[];
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  semesterId: string;
  templateId: string | null;
  slotDay: string;
  generation: number;
  manual: boolean;
  sourceEntryId?: string;
};
function groupsOf(row: Entry) {
  return row.groups.length
    ? row.groups.map((g) => g.groupId).sort()
    : [row.groupId];
}
async function scopedSemester(
  tx: Prisma.TransactionClient,
  universityId: string,
  id: string,
) {
  const s = await tx.semester.findFirst({ where: { id, universityId } });
  if (!s) throw new Denied(404);
  return s;
}
async function references(
  tx: Prisma.TransactionClient,
  universityId: string,
  subjectId: string,
  teacherId: string | null,
  roomId: string | null,
  requireActive = true,
) {
  const subject = await tx.subject.findFirst({
    where: {
      id: subjectId,
      universityId,
      active: requireActive ? true : undefined,
    },
  });
  if (!subject) reject("Выберите действующую дисциплину своего вуза.", 400);
  const teacher = teacherId
    ? await tx.teacher.findFirst({
        where: {
          id: teacherId,
          universityId,
          active: requireActive ? true : undefined,
          subjects: requireActive
            ? { some: { subjectId, active: true } }
            : undefined,
        },
      })
    : null;
  if (teacherId && !teacher)
    reject("Преподаватель недоступен или не связан с дисциплиной.", 400);
  const room = roomId
    ? await tx.room.findFirst({
        where: {
          id: roomId,
          universityId,
          active: requireActive ? true : undefined,
        },
      })
    : null;
  if (roomId && !room) reject("Аудитория недоступна.", 400);
  return {
    title: subject.name,
    teacher: teacher?.name ?? null,
    room: room ? `${room.building} · ${room.number}` : null,
  };
}
async function ruleGroups(
  tx: Prisma.TransactionClient,
  universityId: string,
  programId: string,
  groupIds: string[],
) {
  for (const groupId of groupIds) {
    const g = await validGroup(tx, groupId, universityId);
    if (g.programId !== programId)
      reject("Общая лекция допускает группы одного направления.", 400);
  }
}
function instant(day: string, time: string, zone: string) {
  try {
    return localInstant(day, time, zone);
  } catch {
    return reject(
      "Время не существует или неоднозначно в часовом поясе вуза.",
      400,
    );
  }
}
function candidate(
  fields: z.infer<z.ZodObject<typeof occurrenceFields>>,
  zone: string,
  calendar: Calendar,
  base: Omit<
    Candidate,
    "startsAt" | "endsAt" | "subjectId" | "teacherId" | "roomId"
  >,
): Candidate {
  if (
    fields.day < calendar.start ||
    fields.day > calendar.end ||
    excluded(fields.day, calendar)
  )
    reject(
      "Активное занятие должно находиться внутри семестра и вне исключений.",
      400,
    );
  const startsAt = instant(fields.day, fields.startTime, zone),
    endsAt = instant(fields.day, fields.endTime, zone);
  if (startsAt >= endsAt) reject("Окончание должно быть позже начала.", 400);
  return {
    ...base,
    subjectId: fields.subjectId,
    teacherId: fields.teacherId,
    roomId: fields.roomId,
    startsAt,
    endsAt,
  };
}
async function conflicts(
  tx: Prisma.TransactionClient,
  universityId: string,
  candidates: Candidate[],
  ignored: Set<string>,
  zone: string,
) {
  const active = candidates.filter((c) => c.status === "SCHEDULED");
  if (!active.length) return;
  const min = new Date(Math.min(...active.map((c) => +c.startsAt))),
    max = new Date(Math.max(...active.map((c) => +c.endsAt)));
  const existing = await tx.scheduleEntry.findMany({
    where: {
      status: "SCHEDULED",
      group: { program: { faculty: { universityId } } },
      startsAt: { lt: max },
      endsAt: { gt: min },
    },
    include: includeEntry,
    take: 10001,
  });
  if (existing.length > 10000)
    reject(
      "Слишком много занятий для одной проверки. Сократите период операции.",
      413,
    );
  const occupied = existing
    .filter((e) => !ignored.has(e.id))
    .map((e) => ({ ...e, groupIds: groupsOf(e) }));
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    for (const b of [...occupied, ...active.slice(0, i)]) {
      if (a.startsAt >= b.endsAt || a.endsAt <= b.startsAt) continue;
      const shared = a.groupIds.find((g) => b.groupIds.includes(g));
      const resource = shared
        ? `группа ${(await tx.studentGroup.findUniqueOrThrow({ where: { id: shared } })).name}`
        : a.teacherId && a.teacherId === b.teacherId
          ? `преподаватель ${(await tx.teacher.findUniqueOrThrow({ where: { id: a.teacherId } })).name}`
          : a.roomId && a.roomId === b.roomId
            ? `аудитория ${(await tx.room.findUniqueOrThrow({ where: { id: a.roomId } })).number}`
            : null;
      if (resource)
        reject(
          `Конфликт: ${resource} занят(а) ${dayKey(b.startsAt, zone)} с ${b.startsAt.toLocaleTimeString("ru-RU", { timeZone: zone, hour: "2-digit", minute: "2-digit" })} до ${b.endsAt.toLocaleTimeString("ru-RU", { timeZone: zone, hour: "2-digit", minute: "2-digit" })}. Выберите другое время или ресурс.`,
        );
    }
  }
}
function calendarData(c: Calendar) {
  return {
    name: c.name,
    nameKey: c.name.normalize("NFKC").toLocaleLowerCase("ru-RU"),
    start: new Date(c.start),
    end: new Date(c.end),
    anchor: new Date(c.anchor),
    exclusions: c.exclusions,
  };
}
export async function changeBuilder(
  actorId: string,
  universityId: string,
  raw: unknown,
) {
  const request = builderRequest.parse(raw),
    d = request.command;
  return db.$transaction(
    async (tx) => {
      await lockUniversity(tx, universityId);
      await requireStaff(tx, actorId, universityId);
      const uni = await tx.university.findUniqueOrThrow({
          where: { id: universityId },
        }),
        zone = uni.timezone;
      const now = new Date(),
        today = dayKey(now, zone);
      const changes: Candidate[] = [],
        retire: Entry[] = [];
      const writes: (() => Promise<unknown>)[] = [];
      const evidence: unknown[] = [],
        warnings: string[] = [],
        skipped: string[] = [];
      let targetId = "id" in d ? d.id : d.operationId;
      const audit = async (
        id: string,
        action: string,
        before: unknown,
        after: unknown,
      ) =>
        tx.auditLog.create({
          data: {
            actorId,
            universityId,
            targetId: id,
            action,
            reason: JSON.stringify({ before, after }),
          },
        });
      const reserve = async (exists: boolean) => {
        if (exists) reject("Операция уже выполнена. Обновите страницу.");
      };
      const addGeneration = async (
        template: ScheduleTemplate,
        rule: Rule,
        calendar: Calendar,
        cutoff: string,
        creating: boolean,
      ) => {
        ruleInput.parse(rule);
        const old = creating
          ? []
          : await tx.scheduleEntry.findMany({
              where: { templateId: template.id, universityId },
              include: includeEntry,
              take: 10001,
            });
        if (old.length > 10000)
          reject("История шаблона превышает предел одной операции.", 413);
        evidence.push(
          old.map((e) => ({
            id: e.id,
            version: e.version,
            status: e.status,
            manual: e.manual,
          })),
        );
        const protectedSlots = new Set(
          old
            .filter(
              (e) =>
                e.manual || e.startsAt <= now || (e.slotDay ?? "") < cutoff,
            )
            .map((e) => e.slotDay),
        );
        retire.push(
          ...old.filter(
            (e) =>
              !e.manual &&
              e.startsAt > now &&
              (e.slotDay ?? "") >= cutoff &&
              e.status !== "DELETED",
          ),
        );
        const segments = z
          .array(z.object({ from: civil, rule: ruleInput }).strict())
          .min(1)
          .max(100)
          .parse(template.segments);
        for (let index = 0; index < segments.length; index++) {
          const segment = segments[index],
            rule = segment.rule;
          const start = [calendar.start, segment.from, cutoff].sort().at(-1)!;
          const end = [
            calendar.end,
            segments[index + 1]
              ? addDays(segments[index + 1].from, -1)
              : calendar.end,
          ].sort()[0];
          if (
            start > end ||
            (rule.recurrence === "ONCE" &&
              (rule.once < start || rule.once > end))
          )
            continue;
          await ruleGroups(tx, universityId, template.programId, rule.groupIds);
          await references(
            tx,
            universityId,
            rule.subjectId,
            rule.teacherId,
            rule.roomId,
          );
          let generated: ReturnType<typeof dates>;
          try {
            generated = dates({ ...calendar, start, end }, rule);
          } catch (e) {
            reject(e instanceof Error ? e.message : "Неверный период", 400);
          }
          skipped.push(...generated.skipped);
          for (const day of generated.days) {
            if (protectedSlots.has(day)) continue;
            const c = candidate({ ...rule, day }, zone, calendar, {
              id: `${template.id}:${template.version}:${day}`,
              semesterId: template.semesterId,
              templateId: template.id,
              generation: template.version,
              slotDay: day,
              manual: false,
              groupIds: [...rule.groupIds].sort(),
              status: "SCHEDULED",
            });
            if (!creating && c.startsAt <= now) continue;
            changes.push(c);
          }
        }
        if (
          changes.length > 1000 ||
          changes.reduce((n, e) => n + e.groupIds.length, 0) > 5000
        )
          reject(
            "Лимит одной операции: 1000 занятий / 5000 связей групп. Сократите период.",
            413,
          );
      };
      if (d.action === "ASSIGNMENT_CREATE" || d.action === "ASSIGNMENT_EDIT") {
        const old =
          d.action === "ASSIGNMENT_EDIT"
            ? await tx.teachingAssignment.findFirst({
                where: { id: d.id, universityId },
                include: { groups: true },
              })
            : null;
        if (d.action === "ASSIGNMENT_EDIT") checkedVersion(old, d.version);
        else
          await reserve(
            !!(await tx.teachingAssignment.findUnique({
              where: { id: targetId },
            })),
          );
        if (
          old &&
          (old.programId !== d.programId ||
            old.subjectId !== d.subjectId ||
            old.kind !== d.kind)
        )
          reject(
            "Дисциплина, направление и вид существующей настройки не меняются. Создайте другую настройку.",
            400,
          );
        if (new Set(d.groups.map((g) => g.groupId)).size !== d.groups.length)
          reject("Группа выбрана дважды.", 400);
        if (
          d.kind === "LECTURE" &&
          new Set(d.groups.map((g) => g.teacherId)).size !== 1
        )
          reject("У общей лекции должен быть один преподаватель.", 400);
        const active = d.action === "ASSIGNMENT_CREATE" || d.active;
        for (const g of d.groups) {
          const group = await validGroup(tx, g.groupId, universityId, active);
          if (group.programId !== d.programId)
            reject("Выберите группы одного направления.", 400);
          await references(
            tx,
            universityId,
            d.subjectId,
            g.teacherId,
            null,
            active,
          );
        }
        evidence.push(old);
        // Bind the preview to directory state, even though no dates are generated yet.
        evidence.push(
          await tx.subject.findUnique({ where: { id: d.subjectId } }),
          await tx.teacher.findMany({
            where: { id: { in: d.groups.map((g) => g.teacherId) } },
            orderBy: { id: "asc" },
            include: { subjects: true },
          }),
          await tx.studentGroup.findMany({
            where: { id: { in: d.groups.map((g) => g.groupId) } },
            orderBy: { id: "asc" },
            include: { program: { include: { faculty: true } } },
          }),
        );
        const data = {
          universityId,
          programId: d.programId,
          subjectId: d.subjectId,
          kind: d.kind,
          active,
        };
        writes.push(async () => {
          if (old)
            await tx.teachingAssignment.update({
              where: { id: old.id },
              data: { ...data, version: { increment: 1 } },
            });
          else
            await tx.teachingAssignment.create({
              data: { id: targetId, ...data },
            });
          await tx.teachingAssignmentGroup.updateMany({
            where: { assignmentId: targetId },
            data: { active: false },
          });
          for (const g of d.groups)
            await tx.teachingAssignmentGroup.upsert({
              where: {
                assignmentId_groupId: {
                  assignmentId: targetId,
                  groupId: g.groupId,
                },
              },
              create: { assignmentId: targetId, universityId, ...g },
              update: { teacherId: g.teacherId, active: true },
            });
          await audit(targetId, d.action, old, { ...data, groups: d.groups });
        });
      } else if (
        d.action === "SEMESTER_CREATE" ||
        d.action === "SEMESTER_EDIT"
      ) {
        const old =
          d.action === "SEMESTER_EDIT"
            ? await scopedSemester(tx, universityId, d.id)
            : null;
        if (old && d.action === "SEMESTER_EDIT") checkedVersion(old, d.version);
        if (!old)
          await reserve(
            !!(await tx.semester.findUnique({ where: { id: targetId } })),
          );
        const data = calendarData(d.calendar);
        if (
          await tx.semester.findFirst({
            where: {
              universityId,
              nameKey: data.nameKey,
              id: { not: targetId },
            },
          })
        )
          reject("Семестр с таким названием уже существует.", 400);
        const overlap = await tx.semester.findMany({
          where: {
            universityId,
            id: { not: targetId },
            start: { lte: data.end },
            end: { gte: data.start },
          },
          select: { name: true },
        });
        if (overlap.length)
          warnings.push(
            `Период пересекается с семестрами: ${overlap.map((s) => s.name).join(", ")}. При создании занятия выберите семестр явно.`,
          );
        evidence.push(old);
        if (old && calendarKey(asCalendar(old)) !== calendarKey(d.calendar)) {
          const manual = await tx.scheduleEntry.findMany({
            where: {
              semesterId: old.id,
              universityId,
              manual: true,
              status: "SCHEDULED",
              startsAt: { gt: now },
            },
            take: 10001,
          });
          if (manual.length > 10000)
            reject("Слишком много ручных занятий для проверки.", 413);
          for (const entry of manual) {
            const day = dayKey(entry.startsAt, zone);
            if (
              day < d.calendar.start ||
              day > d.calendar.end ||
              excluded(day, d.calendar)
            )
              reject(
                `Ручное занятие ${day} станет недопустимым. Сначала явно перенесите или отмените его.`,
              );
          }
          const templates = await tx.scheduleTemplate.findMany({
            where: { semesterId: old.id, universityId },
            include: { groups: { where: { active: true } } },
            take: 101,
          });
          if (templates.length > 100)
            reject(
              "Изменение затрагивает более 100 шаблонов. Сократите операцию.",
              413,
            );
          for (const t of templates) {
            const rule = ruleInput.parse({
              subjectId: t.subjectId,
              teacherId: t.teacherId,
              roomId: t.roomId,
              groupIds: t.groups.map((g) => g.groupId),
              recurrence: t.recurrence,
              weekday: t.weekday,
              once: t.once,
              startTime: t.startTime,
              endTime: t.endTime,
            });
            await addGeneration(
              { ...t, version: t.version + 1 },
              rule,
              d.calendar,
              today,
              false,
            );
            writes.push(async () => {
              const next = await tx.scheduleTemplate.update({
                where: { id: t.id },
                data: { version: { increment: 1 } },
              });
              await audit(t.id, "TEMPLATE_CALENDAR", t, next);
            });
          }
        }
        writes.push(async () => {
          const next = old
            ? await tx.semester.update({
                where: { id: old.id },
                data: { ...data, version: { increment: 1 } },
              })
            : await tx.semester.create({
                data: { id: targetId, universityId, ...data },
              });
          await audit(targetId, d.action, old, next);
        });
      } else if (d.action === "TEACHER_CREATE" || d.action === "TEACHER_EDIT") {
        const old =
          d.action === "TEACHER_EDIT"
            ? await tx.teacher.findFirst({
                where: { id: d.id, universityId },
                include: { subjects: true },
              })
            : null;
        if (d.action === "TEACHER_EDIT") checkedVersion(old, d.version);
        else
          await reserve(
            !!(await tx.teacher.findUnique({ where: { id: targetId } })),
          );
        if (new Set(d.subjectIds).size !== d.subjectIds.length)
          reject("Повтор дисциплины.", 400);
        const subjects = await tx.subject.count({
          where: { id: { in: d.subjectIds }, universityId, active: true },
        });
        if (subjects !== d.subjectIds.length) throw new Denied();
        evidence.push(old);
        writes.push(async () => {
          const data = {
            name: d.name,
            active: d.action === "TEACHER_EDIT" ? d.active : true,
          };
          if (old)
            await tx.teacher.update({
              where: { id: old.id },
              data: { ...data, version: { increment: 1 } },
            });
          else
            await tx.teacher.create({
              data: { id: targetId, universityId, ...data },
            });
          await tx.teacherSubject.updateMany({
            where: { teacherId: targetId },
            data: { active: false },
          });
          for (const subjectId of d.subjectIds)
            await tx.teacherSubject.upsert({
              where: {
                teacherId_subjectId: { teacherId: targetId, subjectId },
              },
              create: { teacherId: targetId, subjectId, universityId },
              update: { active: true },
            });
          await audit(targetId, d.action, old, {
            ...data,
            subjectIds: d.subjectIds,
          });
        });
      } else if (d.action === "ROOM_CREATE" || d.action === "ROOM_EDIT") {
        const old =
          d.action === "ROOM_EDIT"
            ? await tx.room.findFirst({ where: { id: d.id, universityId } })
            : null;
        if (d.action === "ROOM_EDIT") checkedVersion(old, d.version);
        else
          await reserve(
            !!(await tx.room.findUnique({ where: { id: targetId } })),
          );
        const data = {
          building: d.building,
          number: d.number,
          nameKey: JSON.stringify([
            d.building.normalize("NFKC").toLowerCase(),
            d.number.normalize("NFKC").toLowerCase(),
          ]),
          active: d.action === "ROOM_EDIT" ? d.active : true,
        };
        if (
          await tx.room.findFirst({
            where: {
              universityId,
              nameKey: data.nameKey,
              id: { not: targetId },
            },
          })
        )
          reject("Такая аудитория уже существует в этом корпусе.", 400);
        evidence.push(old);
        writes.push(async () => {
          const next = old
            ? await tx.room.update({
                where: { id: old.id },
                data: { ...data, version: { increment: 1 } },
              })
            : await tx.room.create({
                data: { id: targetId, universityId, ...data },
              });
          await audit(targetId, d.action, old, next);
        });
      } else if (
        d.action === "TEMPLATE_CREATE" ||
        d.action === "TEMPLATE_FUTURE"
      ) {
        const old =
          d.action === "TEMPLATE_FUTURE"
            ? await tx.scheduleTemplate.findFirst({
                where: { id: d.id, universityId },
                include: { groups: { where: { active: true } } },
              })
            : null;
        if (d.action === "TEMPLATE_FUTURE") {
          checkedVersion(old, d.version);
          if (d.from < today)
            reject(
              "Изменять будущие повторения можно начиная с сегодняшнего дня.",
              400,
            );
        } else
          await reserve(
            !!(await tx.scheduleTemplate.findUnique({
              where: { id: targetId },
            })),
          );
        const semesterId =
          old?.semesterId ??
          (d as Extract<BuilderCommand, { action: "TEMPLATE_CREATE" }>)
            .semesterId;
        const programId =
          old?.programId ??
          (d as Extract<BuilderCommand, { action: "TEMPLATE_CREATE" }>)
            .programId;
        const semester = await scopedSemester(tx, universityId, semesterId),
          calendar = asCalendar(semester);
        if (d.action === "TEMPLATE_CREATE" && d.assignment) {
          const a = await tx.teachingAssignment.findFirst({
            where: { id: d.assignment.id, universityId },
            include: {
              groups: { where: { active: true }, orderBy: { groupId: "asc" } },
            },
          });
          checkedVersion(a, d.assignment.version);
          if (
            !a ||
            !a.active ||
            a.programId !== programId ||
            a.subjectId !== d.rule.subjectId
          )
            reject("Назначение недоступно. Обновите каталог и предпросмотр.");
          const rows =
            a.kind === "LECTURE"
              ? a.groups
              : a.groups.filter((g) => g.groupId === d.assignment!.groupId);
          if (
            !rows.length ||
            (a.kind === "SEMINAR" && rows.length !== 1) ||
            JSON.stringify(rows.map((g) => g.groupId).sort()) !==
              JSON.stringify([...d.rule.groupIds].sort()) ||
            rows.some((g) => g.teacherId !== d.rule.teacherId)
          )
            reject(
              "Группы или преподаватель не соответствуют готовому занятию. Обновите предпросмотр.",
            );
          evidence.push(a);
        }
        const { groupIds, ...fields } = d.rule;
        const previousSegments = old
          ? z
              .array(z.object({ from: civil, rule: ruleInput }).strict())
              .parse(old.segments)
          : [];
        if (d.action === "TEMPLATE_FUTURE" && d.from > calendar.end)
          reject("Дата изменения позже конца семестра.", 400);
        const segments =
          d.action === "TEMPLATE_FUTURE"
            ? [
                ...previousSegments.filter((s) => s.from < d.from),
                { from: d.from, rule: d.rule },
              ]
            : [{ from: "0001-01-01", rule: d.rule }];
        if (segments.length > 100)
          reject("Не более 100 периодов правил в одном шаблоне.", 413);
        const template = {
          segments,
          id: targetId,
          universityId,
          semesterId,
          programId,
          ...fields,
          version: (old?.version ?? 0) + 1,
        };
        await addGeneration(
          template,
          d.rule,
          calendar,
          d.action === "TEMPLATE_FUTURE" ? d.from : calendar.start,
          !old,
        );
        evidence.push(old, semester);
        writes.push(async () => {
          if (old)
            await tx.scheduleTemplate.update({
              where: { id: old.id },
              data: { ...fields, segments, version: template.version },
            });
          else await tx.scheduleTemplate.create({ data: template });
          await tx.templateGroup.updateMany({
            where: { templateId: targetId },
            data: { active: false },
          });
          for (const groupId of groupIds)
            await tx.templateGroup.upsert({
              where: { templateId_groupId: { templateId: targetId, groupId } },
              create: { templateId: targetId, groupId },
              update: { active: true },
            });
          await audit(targetId, d.action, old, { ...template, groupIds });
        });
      } else {
        const old = await tx.scheduleEntry.findFirst({
          where: { id: d.id, universityId, semesterId: { not: null } },
          include: includeEntry,
        });
        checkedVersion(old, d.version);
        if (!old || old.status === "DELETED") throw new Denied(404);
        const semester = await scopedSemester(
          tx,
          universityId,
          old.semesterId!,
        );
        const groupIds = groupsOf(old);
        evidence.push(old, semester);
        let c: Candidate = {
          id: old.id,
          groupIds,
          subjectId: old.subjectId!,
          teacherId: old.teacherId,
          roomId: old.roomId,
          startsAt: old.startsAt,
          endsAt: old.endsAt,
          semesterId: old.semesterId!,
          templateId: old.templateId,
          generation: old.generation,
          slotDay: old.slotDay!,
          manual: true,
          status: old.status,
        };
        if (d.action === "OCCURRENCE_EDIT" || d.action === "DETACH") {
          if (d.action === "DETACH") {
            if (
              old.status !== "SCHEDULED" ||
              groupIds.length < 2 ||
              !groupIds.includes(d.groupId)
            )
              reject("Отделение доступно для активной общей лекции.", 400);
            await reserve(
              !!(await tx.scheduleEntry.findUnique({
                where: { id: d.operationId },
              })),
            );
            const remaining = {
              ...c,
              groupIds: groupIds.filter((g) => g !== d.groupId),
            };
            changes.push(remaining);
            c = {
              ...c,
              id: d.operationId,
              groupIds: [d.groupId],
              templateId: null,
              sourceEntryId: old.id,
            };
            targetId = d.operationId;
          }
          c = candidate(d, zone, asCalendar(semester), c);
        } else if (d.action === "OCCURRENCE_CANCEL") {
          if (old.status !== "SCHEDULED") reject("Занятие уже отменено.");
          c.status = "CANCELLED";
        } else if (d.action === "OCCURRENCE_RESTORE") {
          if (old.status !== "CANCELLED")
            reject("Восстановить можно отменённое занятие.");
          c.status = "SCHEDULED";
          const day = dayKey(c.startsAt, zone),
            calendar = asCalendar(semester);
          if (
            day < calendar.start ||
            day > calendar.end ||
            excluded(day, calendar)
          )
            reject("Сначала перенесите занятие на допустимую дату.", 400);
        } else c.status = "DELETED";
        if (c.status === "SCHEDULED") {
          await references(
            tx,
            universityId,
            c.subjectId,
            c.teacherId,
            c.roomId,
          );
          for (const groupId of c.groupIds)
            await validGroup(tx, groupId, universityId);
        } else if (d.action === "OCCURRENCE_EDIT") {
          // Cancelled history may refer to inactive resources, but never foreign
          // identities. Preview must enforce ownership before offering a token.
          await references(
            tx,
            universityId,
            c.subjectId,
            c.teacherId,
            c.roomId,
            false,
          );
        }
        changes.push(c);
        retire.push(old);
      }
      const [subjectRows, teacherRows, roomRows, groupRows] = await Promise.all(
        [
          tx.subject.findMany({
            where: {
              universityId,
              id: { in: [...new Set(changes.map((c) => c.subjectId))] },
            },
            orderBy: { id: "asc" },
          }),
          tx.teacher.findMany({
            where: {
              universityId,
              id: {
                in: [
                  ...new Set(
                    changes.flatMap((c) => (c.teacherId ? [c.teacherId] : [])),
                  ),
                ],
              },
            },
            orderBy: { id: "asc" },
            include: { subjects: { orderBy: { subjectId: "asc" } } },
          }),
          tx.room.findMany({
            where: {
              universityId,
              id: {
                in: [
                  ...new Set(
                    changes.flatMap((c) => (c.roomId ? [c.roomId] : [])),
                  ),
                ],
              },
            },
            orderBy: { id: "asc" },
          }),
          tx.studentGroup.findMany({
            where: {
              id: {
                in: [
                  ...new Set([
                    ...changes.flatMap((c) => c.groupIds),
                    ...retire.flatMap(groupsOf),
                  ]),
                ],
              },
              program: { faculty: { universityId } },
            },
            orderBy: { id: "asc" },
            include: { program: { include: { faculty: true } } },
          }),
        ],
      );
      evidence.push(subjectRows, teacherRows, roomRows, groupRows);
      if (
        (d.action === "TEMPLATE_CREATE" || d.action === "TEMPLATE_FUTURE") &&
        !changes.length
      )
        reject(
          "Нет подходящих дат. Измените день, тип повторения или границы семестра; ручные исключения и прошедшие занятия сохраняются.",
          400,
        );
      const ignored = new Set(retire.map((e) => e.id));
      await conflicts(tx, universityId, changes, ignored, zone);
      if (changes.some((c) => c.status === "SCHEDULED" && !c.teacherId))
        warnings.push(
          "Преподаватель не назначен: его занятость проверить невозможно.",
        );
      if (changes.some((c) => c.status === "SCHEDULED" && !c.roomId))
        warnings.push(
          "Аудитория не назначена: её занятость проверить невозможно.",
        );
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            d,
            evidence,
            changes,
            retire: retire.map((e) => [e.id, e.version]),
            warnings,
          }),
        )
        .digest("hex");
      const summary = {
        id: targetId,
        token: digest,
        dates: changes.map((c) => ({
          day: dayKey(c.startsAt, zone),
          groupCount: c.groupIds.length,
          groups: c.groupIds.map(
            (id) => groupRows.find((g) => g.id === id)?.name ?? "Группа",
          ),
          title:
            subjectRows.find((s) => s.id === c.subjectId)?.name ?? "Занятие",
          teacher:
            teacherRows.find((t) => t.id === c.teacherId)?.name ??
            "Не назначен",
          room: roomRows.find((r) => r.id === c.roomId)
            ? `${roomRows.find((r) => r.id === c.roomId)!.building} · ${roomRows.find((r) => r.id === c.roomId)!.number}`
            : "Не назначена",
          startTime: c.startsAt.toLocaleTimeString("ru-RU", {
            timeZone: zone,
            hour: "2-digit",
            minute: "2-digit",
          }),
          endTime: c.endsAt.toLocaleTimeString("ru-RU", {
            timeZone: zone,
            hour: "2-digit",
            minute: "2-digit",
          }),
          status: c.status,
        })),
        affected: retire.map((e) => ({
          id: e.id,
          day: dayKey(e.startsAt, zone),
          groups: groupsOf(e).map(
            (id) => groupRows.find((g) => g.id === id)?.name ?? "Группа",
          ),
        })),
        skippedCount: skipped.length,
        skipped: [...new Set(skipped)].sort(),
        warnings,
      };
      if (request.preview) return summary;
      if (!request.confirmed || request.token !== digest)
        reject(
          "Предпросмотр устарел. Повторите проверку и подтвердите изменения.",
        );
      for (const write of writes) await write();
      const updatedIds = new Set(changes.map((c) => c.id));
      for (const entry of retire.filter((e) => !updatedIds.has(e.id))) {
        await tx.scheduleEntry.update({
          where: { id: entry.id },
          data: { status: "DELETED", version: { increment: 1 } },
        });
        await audit(entry.id, "OCCURRENCE_REGENERATE", entry, {
          status: "DELETED",
          generation: entry.generation,
        });
      }
      for (const c of changes) {
        const display =
          c.status === "SCHEDULED" || d.action === "OCCURRENCE_EDIT"
            ? await references(
                tx,
                universityId,
                c.subjectId,
                c.teacherId,
                c.roomId,
                c.status === "SCHEDULED",
              )
            : {};
        const { id: entryId, groupIds, ...fields } = c;
        const old = retire.find((e) => e.id === entryId);
        const data = {
          ...fields,
          universityId,
          groupId: groupIds[0],
          ...display,
        };
        if (old)
          await tx.scheduleEntry.update({
            where: { id: entryId },
            data: { ...data, version: { increment: 1 } },
          });
        else
          await tx.scheduleEntry.create({
            data: {
              ...data,
              id: entryId,
              title:
                "title" in display && typeof display.title === "string"
                  ? display.title
                  : "Занятие",
            },
          });
        await tx.scheduleGroup.updateMany({
          where: { entryId },
          data: { active: false },
        });
        for (const groupId of groupIds)
          await tx.scheduleGroup.upsert({
            where: { entryId_groupId: { entryId, groupId } },
            create: { entryId, groupId },
            update: { active: true },
          });
        await audit(
          entryId,
          d.action === "DETACH"
            ? "OCCURRENCE_DETACH"
            : old
              ? d.action
              : "OCCURRENCE_PUBLISH",
          old ?? null,
          c,
        );
        if (old && old.status === "SCHEDULED" && c.status === "CANCELLED")
          await notifyCancellation(
            tx,
            actorId,
            universityId,
            { ...old, version: old.version + 1 },
            groupIds,
          );
      }
      return summary;
    },
    { timeout: 30000 },
  );
}

// Explicit projection. Neither authentication records nor students are fetched here.
export async function builderCatalog(universityId: string) {
  const [semesters, teachers, rooms, subjects, faculties, assignments] =
    await Promise.all([
      db.semester.findMany({
        where: { universityId },
        orderBy: [{ start: "desc" }, { id: "asc" }],
        take: 201,
      }),
      db.teacher.findMany({
        where: { universityId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        include: {
          subjects: { where: { active: true }, select: { subjectId: true } },
        },
        take: 501,
      }),
      db.room.findMany({
        where: { universityId },
        orderBy: [{ building: "asc" }, { number: "asc" }, { id: "asc" }],
        take: 501,
      }),
      db.subject.findMany({
        where: { universityId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, active: true },
        take: 501,
      }),
      db.faculty.findMany({
        where: { universityId },
        select: {
          id: true,
          name: true,
          active: true,
          programs: {
            select: {
              id: true,
              name: true,
              active: true,
              groups: {
                select: { id: true, name: true, active: true, course: true },
              },
            },
          },
        },
      }),
      db.teachingAssignment.findMany({
        where: { universityId },
        orderBy: { id: "asc" },
        take: 501,
        select: {
          id: true,
          programId: true,
          subjectId: true,
          kind: true,
          active: true,
          version: true,
          groups: {
            where: { active: true },
            orderBy: { groupId: "asc" },
            select: { groupId: true, teacherId: true },
          },
        },
      }),
    ]);
  if (
    assignments.length > 500 ||
    semesters.length > 200 ||
    teachers.length > 500 ||
    rooms.length > 500 ||
    subjects.length > 500
  )
    throw new Denied(413);
  return {
    semesters: semesters.map((s) => ({
      id: s.id,
      version: s.version,
      calendar: asCalendar(s),
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      active: t.active,
      version: t.version,
      subjectIds: t.subjects.map((s) => s.subjectId),
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      building: r.building,
      number: r.number,
      active: r.active,
      version: r.version,
    })),
    subjects,
    faculties,
    assignments,
  };
}
export async function builderWeek(universityId: string, query: unknown) {
  const q = z
    .object({
      semesterId: id,
      programId: id,
      from: civil,
      groupId: id.optional(),
    })
    .strict()
    .parse(query);
  const semester = await scopedSemester(db, universityId, q.semesterId);
  const program = await db.program.findFirst({
    where: { id: q.programId, faculty: { universityId } },
    include: { groups: true },
  });
  if (
    !program ||
    (q.groupId && !program.groups.some((g) => g.id === q.groupId))
  )
    throw new Denied();
  const zone = (
    await db.university.findUniqueOrThrow({ where: { id: universityId } })
  ).timezone;
  const from = instant(q.from, "00:00", zone),
    to = instant(addDays(q.from, 7), "00:00", zone);
  const groupIds = q.groupId ? [q.groupId] : program.groups.map((g) => g.id);
  const entries = await db.scheduleEntry.findMany({
    where: {
      status: { not: "DELETED" },
      OR: [
        { groupId: { in: groupIds }, groups: { none: {} } },
        { groups: { some: { groupId: { in: groupIds }, active: true } } },
      ],
      startsAt: { gte: from, lt: to },
    },
    include: includeEntry,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 501,
  });
  if (entries.length > 500) throw new Denied(413);
  const templates = await db.scheduleTemplate.findMany({
    where: { universityId, semesterId: semester.id, programId: program.id },
    include: { groups: { where: { active: true }, select: { groupId: true } } },
    take: 501,
  });
  if (templates.length > 500) throw new Denied(413);
  return {
    timezone: zone,
    today: dayKey(new Date(), zone),
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      teacher: e.teacher,
      room: e.room,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      status: e.status,
      version: e.version,
      semesterId: e.semesterId,
      templateId: e.templateId,
      subjectId: e.subjectId,
      teacherId: e.teacherId,
      roomId: e.roomId,
      groupIds: groupsOf(e),
      manual: e.manual,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      version: t.version,
      rule: ruleInput.parse({
        subjectId: t.subjectId,
        teacherId: t.teacherId,
        roomId: t.roomId,
        groupIds: t.groups.map((g) => g.groupId),
        recurrence: t.recurrence,
        weekday: t.weekday,
        once: t.once,
        startTime: t.startTime,
        endTime: t.endTime,
      }),
    })),
  };
}
