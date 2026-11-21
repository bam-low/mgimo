import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import { lockUniversity, requireStaff, validGroup } from "./enrollment-guards";
import { notifyExam } from "./notification-events";
import { parseInput } from "./portfolio";
import { dayKey, localInstant, timeLabel } from "@/lib/schedule-time";
import { resultLabel } from "@/lib/grade-display";
import { examInput, examKindLabel, passed, daysUntil } from "@/lib/session";

type Actor = Awaited<ReturnType<typeof actor>>;
type Tx = Prisma.TransactionClient;
const MAX_MINUTES = 8 * 60;

function error(message: string, status = 409): never {
  const e = new Denied(status);
  e.message = message;
  throw e;
}

/** Слот экзамена по календарю вуза: только будущее время, не длиннее 8 часов. */
function slot(day: string, start: string, end: string, zone: string) {
  let startsAt: Date, endsAt: Date;
  try {
    startsAt = localInstant(day, start, zone);
    endsAt = localInstant(day, end, zone);
  } catch {
    error("Такого времени нет в календаре вуза.", 400);
  }
  if (endsAt <= startsAt) error("Окончание должно быть позже начала.", 400);
  if ((+endsAt - +startsAt) / 60000 > MAX_MINUTES)
    error("Экзамен не может длиться дольше 8 часов.", 400);
  if (startsAt <= new Date())
    error("Нельзя назначить на прошедшее время.", 400);
  return { startsAt, endsAt };
}

/** Преподаватель, аудитория и дисциплина — действующие, своего вуза, связаны. */
async function resources(
  tx: Tx,
  universityId: string,
  subjectId: string,
  teacherId: string,
  roomId: string,
) {
  const [subject, teacher, room] = await Promise.all([
    tx.subject.findFirst({
      where: { id: subjectId, universityId, active: true },
    }),
    tx.teacher.findFirst({
      where: {
        id: teacherId,
        universityId,
        active: true,
        subjects: { some: { subjectId, active: true } },
      },
    }),
    tx.room.findFirst({ where: { id: roomId, universityId, active: true } }),
  ]);
  if (!subject) error("Выберите действующую дисциплину.", 400);
  if (!teacher) error("Преподаватель не ведёт эту дисциплину.", 400);
  if (!room) error("Аудитория недоступна.", 400);
  return { subject, teacher, room: `${room.building} · ${room.number}` };
}

/**
 * Пересечения с парами и другими экзаменами: группа, преподаватель, аудитория.
 * Сообщение называет, с чем именно пересечение.
 */
async function clash(
  tx: Tx,
  universityId: string,
  zone: string,
  s: { startsAt: Date; endsAt: Date; teacherId: string; roomId: string },
  groupIds: string[],
  ignoreExamId?: string,
) {
  const when = (d: Date, e: Date) =>
    `${dayKey(d, zone).split("-").reverse().slice(0, 2).join(".")} ${timeLabel(d, zone)}–${timeLabel(e, zone)}`;
  const lesson = await tx.scheduleEntry.findFirst({
    where: {
      group: { program: { faculty: { universityId } } },
      status: "SCHEDULED",
      startsAt: { lt: s.endsAt },
      endsAt: { gt: s.startsAt },
      OR: [
        { groupId: { in: groupIds }, groups: { none: {} } },
        { groups: { some: { groupId: { in: groupIds }, active: true } } },
        { teacherId: s.teacherId },
        { roomId: s.roomId },
      ],
    },
    orderBy: { startsAt: "asc" },
    select: { title: true, startsAt: true, endsAt: true },
  });
  if (lesson)
    error(
      `Пересечение с парой «${lesson.title}», ${when(lesson.startsAt, lesson.endsAt)}.`,
    );
  const exam = await tx.exam.findFirst({
    where: {
      universityId,
      status: "SCHEDULED",
      id: ignoreExamId ? { not: ignoreExamId } : undefined,
      startsAt: { lt: s.endsAt },
      endsAt: { gt: s.startsAt },
      OR: [
        { groups: { some: { groupId: { in: groupIds } } } },
        { teacherId: s.teacherId },
        { roomId: s.roomId },
      ],
    },
    orderBy: { startsAt: "asc" },
    select: { kind: true, title: true, startsAt: true, endsAt: true },
  });
  if (exam)
    error(
      `Пересечение: ${examKindLabel(exam.kind).toLowerCase()} «${exam.title}», ${when(exam.startsAt, exam.endsAt)}.`,
    );
}

/** Сотрудник: назначить, перенести или отменить экзамен / зачёт / консультацию. */
export async function changeExam(a: Actor, raw: unknown) {
  staff(a);
  const d = parseInput(examInput.parse, raw);
  const universityId = a.membership.universityId,
    zone = a.membership.university.timezone;
  return db.$transaction(
    async (tx) => {
      await lockUniversity(tx, universityId);
      await requireStaff(tx, a.user.id, universityId);
      if (d.action === "CREATE") {
        if (await tx.exam.findUnique({ where: { id: d.operationId } }))
          error("Уже сохранено. Обновите страницу.");
        const groupIds = [...new Set(d.groupIds)];
        for (const g of groupIds) await validGroup(tx, g, universityId);
        const r = await resources(
          tx,
          universityId,
          d.subjectId,
          d.teacherId,
          d.roomId,
        );
        const s = {
          ...slot(d.day, d.startTime, d.endTime, zone),
          teacherId: d.teacherId,
          roomId: d.roomId,
        };
        await clash(tx, universityId, zone, s, groupIds);
        const exam = await tx.exam.create({
          data: {
            id: d.operationId,
            universityId,
            subjectId: d.subjectId,
            kind: d.kind,
            title: r.subject.name,
            ...s,
            teacherName: r.teacher.name,
            roomName: r.room,
            authorId: a.user.id,
            groups: { create: groupIds.map((groupId) => ({ groupId })) },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: a.user.id,
            universityId,
            targetId: exam.id,
            action: "EXAM_CREATED",
          },
        });
        return { id: exam.id, version: exam.version };
      }
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Exam" WHERE "id"=${d.id} AND "universityId"=${universityId} FOR UPDATE`;
      if (rows.length !== 1) throw new Denied(404);
      const old = await tx.exam.findUniqueOrThrow({
        where: { id: d.id },
        include: { groups: { select: { groupId: true } } },
      });
      if (old.version !== d.version)
        error("Экзамен уже изменён. Обновите страницу.");
      if (old.status !== "SCHEDULED") error("Экзамен уже отменён.");
      if (old.endsAt <= new Date()) error("Прошедший экзамен изменить нельзя.");
      const groupIds = old.groups.map((g) => g.groupId);
      if (d.action === "CANCEL") {
        const next = await tx.exam.update({
          where: { id: d.id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            actorId: a.user.id,
            universityId,
            targetId: d.id,
            action: "EXAM_CANCELLED",
          },
        });
        await notifyExam(
          tx,
          a.user.id,
          universityId,
          next,
          groupIds,
          "EXAM_CANCELLED",
        );
        return { id: next.id, version: next.version };
      }
      const r = await resources(
        tx,
        universityId,
        old.subjectId,
        d.teacherId,
        d.roomId,
      );
      const s = {
        ...slot(d.day, d.startTime, d.endTime, zone),
        teacherId: d.teacherId,
        roomId: d.roomId,
      };
      if (
        +s.startsAt === +old.startsAt &&
        +s.endsAt === +old.endsAt &&
        s.teacherId === old.teacherId &&
        s.roomId === old.roomId
      )
        error("Ничего не изменилось.", 400);
      await clash(tx, universityId, zone, s, groupIds, old.id);
      const next = await tx.exam.update({
        where: { id: d.id },
        data: {
          ...s,
          teacherName: r.teacher.name,
          roomName: r.room,
          movedFromStartsAt: old.startsAt,
          movedFromRoom: old.roomId !== s.roomId ? old.roomName : null,
          version: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: a.user.id,
          universityId,
          targetId: d.id,
          action: "EXAM_MOVED",
        },
      });
      await notifyExam(
        tx,
        a.user.id,
        universityId,
        next,
        groupIds,
        "EXAM_MOVED",
      );
      return { id: next.id, version: next.version };
    },
    { timeout: 15000 },
  );
}

const examSelect = {
  id: true,
  kind: true,
  title: true,
  subjectId: true,
  startsAt: true,
  endsAt: true,
  teacherId: true,
  teacherName: true,
  roomId: true,
  roomName: true,
  status: true,
  version: true,
  movedFromStartsAt: true,
  movedFromRoom: true,
} satisfies Prisma.ExamSelect;

/** Сотрудник: сессия вуза — с недели назад и вперёд, с группами. */
export async function staffExams(a: Actor) {
  staff(a);
  const universityId = a.membership.universityId,
    zone = a.membership.university.timezone;
  const since = new Date(Date.now() - 7 * 86400000);
  const rows = await db.exam.findMany({
    where: { universityId, endsAt: { gte: since } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 300,
    select: {
      ...examSelect,
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  });
  return {
    timezone: zone,
    today: dayKey(new Date(), zone),
    items: rows.map((e) => ({
      ...e,
      day: dayKey(e.startsAt, zone),
      startTime: timeLabel(e.startsAt, zone),
      endTime: timeLabel(e.endsAt, zone),
      past: e.endsAt <= new Date(),
      groups: e.groups.map((g) => g.group),
    })),
  };
}

/** Справочники формы: только действующие записи своего вуза. */
export async function sessionCatalog(a: Actor) {
  staff(a);
  const universityId = a.membership.universityId;
  const [subjects, teachers, rooms] = await Promise.all([
    db.subject.findMany({
      where: { universityId, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
      take: 500,
    }),
    db.teacher.findMany({
      where: { universityId, active: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        subjects: { where: { active: true }, select: { subjectId: true } },
      },
      take: 500,
    }),
    db.room.findMany({
      where: { universityId, active: true },
      orderBy: [{ building: "asc" }, { number: "asc" }],
      select: { id: true, building: true, number: true },
      take: 500,
    }),
  ]);
  return {
    subjects,
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      subjectIds: t.subjects.map((s) => s.subjectId),
    })),
    rooms: rooms.map((r) => ({
      id: r.id,
      name: `${r.building} · ${r.number}`,
    })),
  };
}

/**
 * Студент: сессия своей группы. Результат — последняя действующая оценка по
 * дисциплине, выставленная в день экзамена или позже.
 */
export async function studentSession(a: Actor) {
  const enrollment = studentAccess(a);
  const zone = a.membership.university.timezone,
    today = dayKey(new Date(), zone);
  const rows = await db.exam.findMany({
    where: {
      universityId: a.membership.universityId,
      groups: { some: { groupId: enrollment.groupId } },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 100,
    select: examSelect,
  });
  const grades = rows.length
    ? await db.grade.findMany({
        where: {
          membershipId: a.membership.id,
          universityId: a.membership.universityId,
          voided: false,
          subjectId: { in: [...new Set(rows.map((r) => r.subjectId))] },
        },
        orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: {
          subjectId: true,
          kind: true,
          mark: true,
          credit: true,
          issuedOn: true,
        },
      })
    : [];
  const now = Date.now();
  const items = rows.map((e) => {
    const day = dayKey(e.startsAt, zone);
    const grade =
      e.kind === "CONSULTATION" || e.status !== "SCHEDULED"
        ? undefined
        : grades.find(
            (g) =>
              g.subjectId === e.subjectId &&
              g.issuedOn.toISOString().slice(0, 10) >= day,
          );
    return {
      id: e.id,
      kind: e.kind,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      day,
      startTime: timeLabel(e.startsAt, zone),
      endTime: timeLabel(e.endsAt, zone),
      teacher: e.teacherName,
      room: e.roomName,
      status: e.status,
      upcoming: e.status === "SCHEDULED" && +e.endsAt > now,
      days: daysUntil(today, day),
      moved:
        e.status === "SCHEDULED" && e.movedFromStartsAt
          ? {
              day: dayKey(e.movedFromStartsAt, zone),
              time: timeLabel(e.movedFromStartsAt, zone),
              room: e.movedFromRoom,
            }
          : null,
      result: grade
        ? { label: resultLabel(grade), passed: passed(grade) }
        : null,
    };
  });
  const graded = items.filter(
    (i) => i.kind !== "CONSULTATION" && i.status === "SCHEDULED",
  );
  return {
    timezone: zone,
    today,
    items,
    summary: {
      total: graded.length,
      passed: graded.filter((i) => i.result?.passed).length,
    },
  };
}

/** Главная: ближайший экзамен или зачёт в пределах 14 дней. */
export async function nextExam(a: Actor) {
  const s = await studentSession(a);
  return (
    s.items.find(
      (i) => i.upcoming && i.kind !== "CONSULTATION" && i.days <= 14,
    ) ?? null
  );
}
