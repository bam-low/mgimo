import type { Prisma } from "../generated/prisma/client";
import { Denied } from "./errors";
import {
  applicationNotificationKind,
  type NotificationKind,
} from "@/lib/notifications";
/** Must be called inside the domain transaction: failures roll everything back. */
async function save(
  tx: Prisma.TransactionClient,
  actorId: string,
  data: {
    universityId: string;
    recipientMembershipId: string;
    kind: NotificationKind;
    sourceKey: string;
    enrollmentRequestId?: string;
    applicationId?: string;
    applicationEventId?: string;
    cancellationId?: string;
    portfolioItemId?: string;
    scheduleChangeId?: string;
    examId?: string;
    deadlineId?: string;
  },
) {
  const n = await tx.notification.create({ data });
  await tx.auditLog.create({
    data: {
      actorId,
      universityId: data.universityId,
      targetId: n.id,
      action: "NOTIFICATION_CREATED",
    },
  });
}

/**
 * Действующие студенты нужных групп. Строки участников блокируются без ожидания:
 * параллельный перевод студента даёт явный повтор, а не частичную рассылку.
 */
export async function lockedStudents(
  tx: Prisma.TransactionClient,
  universityId: string,
  group: Prisma.StudentGroupWhereInput,
  failure: string,
) {
  const students = await tx.universityMembership.findMany({
    where: {
      universityId,
      role: "STUDENT",
      status: "APPROVED",
      user: { active: true },
      enrollments: {
        some: {
          endedAt: null,
          revokedAt: null,
          group: {
            AND: [
              {
                active: true,
                program: {
                  active: true,
                  faculty: { universityId, active: true },
                },
              },
              group,
            ],
          },
        },
      },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (students.length) {
    // Enrollment/grade writes lock membership before the university. Never wait
    // for those rows while holding the university lock: a concurrent transfer
    // must yield an explicit retry, not a FK-lock deadlock or partial delivery.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "UniversityMembership"
      WHERE "universityId"=${universityId} AND "id"=ANY(${students.map((s) => s.id)}::text[])
      ORDER BY "id" FOR KEY SHARE SKIP LOCKED`;
    if (locked.length !== students.length) {
      const error = new Denied(409);
      error.message = failure;
      throw error;
    }
  }
  return students;
}

export async function notifyCancellation(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  entry: {
    id: string;
    version: number;
    title: string;
    startsAt: Date;
    endsAt: Date;
  },
  groupIds: string[],
) {
  const cancellationId = `${entry.id}:${entry.version}`;
  const students = await lockedStudents(
    tx,
    universityId,
    { id: { in: groupIds } },
    "Данные студентов сейчас изменяются. Отмена не выполнена. Повторите действие после обновления.",
  );
  await tx.scheduleCancellation.create({
    data: {
      id: cancellationId,
      universityId,
      entryId: entry.id,
      entryVersion: entry.version,
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      groupIds,
    },
  });
  for (const student of students)
    await save(tx, actorId, {
      universityId,
      recipientMembershipId: student.id,
      kind: "SCHEDULE_CANCELLED",
      cancellationId,
      sourceKey: `cancellation:${cancellationId}`,
    });
}
export async function notifyEnrollment(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  membershipId: string,
  requestId: string,
  status: "APPROVED" | "REJECTED",
) {
  await save(tx, actorId, {
    universityId,
    recipientMembershipId: membershipId,
    enrollmentRequestId: requestId,
    kind: status === "APPROVED" ? "ENROLLMENT_APPROVED" : "ENROLLMENT_REJECTED",
    sourceKey: `enrollment:${requestId}:decision`,
  });
}
export async function notifyApplication(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  applicationId: string,
  eventId: string,
  type: string,
) {
  if (
    ![
      "APPLICATION_TAKEN",
      "APPLICATION_COMPLETED",
      "APPLICATION_REJECTED",
      "DOCUMENT_REPLACED",
    ].includes(type)
  )
    return;
  const app = await tx.application.findFirstOrThrow({
    where: { id: applicationId, universityId },
    select: { membershipId: true, kind: true, status: true },
  });
  const kind = applicationNotificationKind(type, app.kind, app.status);
  if (kind)
    await save(tx, actorId, {
      universityId,
      recipientMembershipId: app.membershipId,
      applicationId,
      applicationEventId: eventId,
      kind,
      sourceKey: `application:${eventId}`,
    });
}
/** Решение деканата по работе портфолио: один ключ на каждый раунд проверки. */
export async function notifyPortfolio(
  tx: Prisma.TransactionClient,
  actorId: string,
  item: { id: string; universityId: string; membershipId: string },
  round: number,
  approved: boolean,
) {
  await save(tx, actorId, {
    universityId: item.universityId,
    recipientMembershipId: item.membershipId,
    portfolioItemId: item.id,
    kind: approved ? "PORTFOLIO_APPROVED" : "PORTFOLIO_REJECTED",
    sourceKey: `portfolio:${item.id}:${round}`,
  });
}

type Slot = {
  startsAt: Date;
  endsAt: Date;
  room: string | null;
  teacher: string | null;
};
/** Перенос считается только при смене даты, времени, аудитории или преподавателя. */
export function isMove(before: Slot, after: Slot) {
  return (
    +before.startsAt !== +after.startsAt ||
    +before.endsAt !== +after.endsAt ||
    (before.room ?? null) !== (after.room ?? null) ||
    (before.teacher ?? null) !== (after.teacher ?? null)
  );
}
/** Неизменяемая запись «было → стало» и уведомление студентам групп занятия. */
export async function notifyMove(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  entry: { id: string; version: number; title: string },
  before: Slot,
  after: Slot,
  groupIds: string[],
) {
  if (!isMove(before, after)) return;
  const students = await lockedStudents(
    tx,
    universityId,
    { id: { in: groupIds } },
    "Данные студентов сейчас изменяются. Перенос не сохранён. Повторите действие после обновления.",
  );
  const changeId = `${entry.id}:${entry.version}`;
  await tx.scheduleChange.create({
    data: {
      id: changeId,
      universityId,
      entryId: entry.id,
      entryVersion: entry.version,
      title: entry.title,
      fromStartsAt: before.startsAt,
      fromEndsAt: before.endsAt,
      fromRoom: before.room,
      fromTeacher: before.teacher,
      toStartsAt: after.startsAt,
      toEndsAt: after.endsAt,
      toRoom: after.room,
      toTeacher: after.teacher,
      groupIds,
    },
  });
  for (const student of students)
    await save(tx, actorId, {
      universityId,
      recipientMembershipId: student.id,
      kind: "SCHEDULE_MOVED",
      scheduleChangeId: changeId,
      sourceKey: `move:${changeId}`,
    });
}
/** Перенос или отмена экзамена: одно уведомление на каждую версию. */
export async function notifyExam(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  exam: { id: string; version: number },
  groupIds: string[],
  kind: "EXAM_MOVED" | "EXAM_CANCELLED",
) {
  const students = await lockedStudents(
    tx,
    universityId,
    { id: { in: groupIds } },
    "Данные студентов сейчас изменяются. Изменение не сохранено. Повторите действие после обновления.",
  );
  for (const student of students)
    await save(tx, actorId, {
      universityId,
      recipientMembershipId: student.id,
      kind,
      examId: exam.id,
      sourceKey: `exam:${exam.id}:${exam.version}`,
    });
}
/** Адресаты по уровню: весь вуз, факультет, направление или группа. */
export function scopeGroups(d: {
  scope: string;
  facultyId: string | null;
  programId: string | null;
  groupId: string | null;
}): Prisma.StudentGroupWhereInput {
  if (d.scope === "GROUP") return { id: d.groupId! };
  if (d.scope === "PROGRAM") return { programId: d.programId! };
  if (d.scope === "FACULTY") return { program: { facultyId: d.facultyId! } };
  return {};
}
/** «Новый дедлайн» всем адресатам в момент публикации. */
export async function notifyDeadline(
  tx: Prisma.TransactionClient,
  actorId: string,
  deadline: {
    id: string;
    universityId: string;
    scope: string;
    facultyId: string | null;
    programId: string | null;
    groupId: string | null;
  },
) {
  const students = await lockedStudents(
    tx,
    deadline.universityId,
    scopeGroups(deadline),
    "Данные студентов сейчас изменяются. Дедлайн не опубликован. Повторите действие после обновления.",
  );
  for (const student of students)
    await save(tx, actorId, {
      universityId: deadline.universityId,
      recipientMembershipId: student.id,
      kind: "DEADLINE_NEW",
      deadlineId: deadline.id,
      sourceKey: `deadline:${deadline.id}:new`,
    });
}
/** Напоминание «скоро срок»: ровно одно на студента и дедлайн. */
export async function saveDeadlineReminder(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  membershipId: string,
  deadlineId: string,
) {
  await save(tx, actorId, {
    universityId,
    recipientMembershipId: membershipId,
    kind: "DEADLINE_SOON",
    deadlineId,
    sourceKey: `deadline:${deadlineId}:soon`,
  });
}
