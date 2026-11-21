import { z } from "zod";
import { ensureDeadlineReminders } from "./deadlines";
import { examKindLabel } from "@/lib/session";
import { db } from "./db";
import type { Prisma } from "../generated/prisma/client";
import { actor, Denied, studentAccess } from "./security";
import { lockMembership } from "./enrollment-guards";
import { cursorId, listCursor, listPage, pageSize } from "@/lib/pagination";
import { notificationText } from "@/lib/notifications";
import { dayKey, timeLabel } from "@/lib/schedule-time";
type Actor = Awaited<ReturnType<typeof actor>>;
async function recipient(
  tx: Prisma.TransactionClient,
  a: Actor,
  write = false,
) {
  if (write)
    await lockMembership(tx, a.membership.id, a.membership.universityId);
  const session = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Session" WHERE "id"=${a.sessionId} AND "userId"=${a.user.id} AND "expiresAt">clock_timestamp() FOR KEY SHARE`;
  if (session.length !== 1) throw new Denied(401);
  const m = await tx.universityMembership.findFirst({
    where: {
      id: a.membership.id,
      userId: a.user.id,
      universityId: a.membership.universityId,
      user: { active: true },
      university: { active: true },
    },
    include: {
      university: true,
      enrollments: {
        where: { endedAt: null, revokedAt: null },
        include: {
          group: { include: { program: { include: { faculty: true } } } },
        },
      },
      requests: { take: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
    },
  });
  if (
    !m ||
    m.role !== "STUDENT" ||
    !["PENDING", "APPROVED", "REJECTED"].includes(m.status) ||
    (await tx.universityMembership.count({ where: { userId: a.user.id } })) !==
      1
  )
    throw new Denied();
  let canStudy = false;
  try {
    studentAccess({
      ...a,
      membership: {
        ...a.membership,
        status: m.status,
        role: m.role,
        university: m.university,
        enrollments: m.enrollments,
      },
    });
    canStudy = true;
  } catch (e) {
    if (!(e instanceof Denied)) throw e;
  }
  return {
    where: { universityId: m.universityId, recipientMembershipId: m.id },
    canStudy,
    latestRequestId: m.requests[0]?.id,
    timezone: m.university.timezone,
    groupIds: m.enrollments.map((e) => e.groupId),
  };
}
const select = {
  id: true,
  kind: true,
  schemaVersion: true,
  createdAt: true,
  readAt: true,
  enrollmentRequestId: true,
  applicationId: true,
  application: { select: { currentDocumentId: true } },
  applicationEvent: { select: { documentId: true } },
  cancellation: {
    select: { title: true, startsAt: true, endsAt: true, groupIds: true },
  },
  portfolioItem: { select: { title: true } },
  scheduleChange: {
    select: {
      title: true,
      fromStartsAt: true,
      toStartsAt: true,
      toEndsAt: true,
      toRoom: true,
      groupIds: true,
    },
  },
  exam: {
    select: {
      kind: true,
      title: true,
      startsAt: true,
      endsAt: true,
      roomName: true,
      status: true,
    },
  },
  deadline: { select: { title: true, dueAt: true, deletedAt: true } },
} satisfies Prisma.NotificationSelect;
type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;
function dto(n: Row, scope: Awaited<ReturnType<typeof recipient>>) {
  if (n.schemaVersion !== 1) throw new Denied(503);
  const day = (d: Date) =>
    dayKey(d, scope.timezone).split("-").reverse().slice(0, 2).join(".");
  const at = (d: Date) => `${day(d)} ${timeLabel(d, scope.timezone)}`;
  const target = n.scheduleChange
    ? scope.canStudy &&
      Array.isArray(n.scheduleChange.groupIds) &&
      n.scheduleChange.groupIds.some(
        (id) => typeof id === "string" && scope.groupIds.includes(id),
      )
      ? {
          available: true,
          href: `/schedule?day=${dayKey(n.scheduleChange.toStartsAt, scope.timezone)}`,
        }
      : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" }
    : n.exam
      ? scope.canStudy
        ? { available: true, href: "/grades/session" }
        : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" }
      : n.deadline
        ? scope.canStudy
          ? { available: true, href: "/deadlines" }
          : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" }
        : n.portfolioItem
          ? scope.canStudy
            ? { available: true, href: "/portfolio" }
            : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" }
          : n.cancellation
            ? scope.canStudy &&
              Array.isArray(n.cancellation.groupIds) &&
              n.cancellation.groupIds.some(
                (id) => typeof id === "string" && scope.groupIds.includes(id),
              )
              ? {
                  available: true,
                  href: `/schedule?day=${dayKey(n.cancellation.startsAt, scope.timezone)}`,
                }
              : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" }
            : n.enrollmentRequestId
              ? scope.latestRequestId === n.enrollmentRequestId
                ? { available: true, href: "/cabinet" }
                : { available: false, reasonCode: "PREVIOUS_ENROLLMENT" }
              : scope.canStudy
                ? {
                    available: true,
                    href: `/applications/${encodeURIComponent(n.applicationId!)}`,
                  }
                : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" };
  const message = n.scheduleChange
    ? `${n.scheduleChange.title}: ${at(n.scheduleChange.fromStartsAt)} → ${at(n.scheduleChange.toStartsAt)}${n.scheduleChange.toRoom ? ` · ${n.scheduleChange.toRoom}` : ""}.`
    : n.exam
      ? n.exam.status === "CANCELLED"
        ? `${examKindLabel(n.exam.kind)} · ${n.exam.title} — отменён.`
        : `${examKindLabel(n.exam.kind)} · ${n.exam.title}: ${at(n.exam.startsAt)}–${timeLabel(n.exam.endsAt, scope.timezone)} · ${n.exam.roomName}.`
      : n.deadline
        ? n.deadline.deletedAt
          ? `«${n.deadline.title}» — отменён.`
          : `«${n.deadline.title}» — до ${at(n.deadline.dueAt)}.`
        : n.portfolioItem
          ? `«${n.portfolioItem.title}». ${n.kind === "PORTFOLIO_APPROVED" ? "Работа учитывается в портфолио." : "Причина — в карточке работы."}`
          : n.cancellation
            ? `${n.cancellation.title} · ${dayKey(n.cancellation.startsAt, scope.timezone).split("-").reverse().join(".")} · ${timeLabel(n.cancellation.startsAt, scope.timezone)}–${timeLabel(n.cancellation.endsAt, scope.timezone)}. Занятие отменено.`
            : n.enrollmentRequestId
              ? "Решение по вашему запросу прикрепления сохранено."
              : "В истории вашего обращения появилось новое событие.";
  const newerDocument =
    target.available &&
    !!n.applicationEvent?.documentId &&
    n.applicationEvent.documentId !== n.application?.currentDocumentId;
  return {
    id: n.id,
    kind: n.kind,
    title: notificationText(n.kind),
    message,
    createdAt: n.createdAt,
    readAt: n.readAt,
    target,
    ...(newerDocument
      ? {
          notice:
            "Документ уже обновлён. В карточке доступна только текущая разрешённая версия.",
        }
      : {}),
  };
}
const querySchema = z
  .object({
    filter: z.enum(["all", "unread"]).default("all"),
    cursor: z.string().optional(),
  })
  .strict();
export async function listNotifications(a: Actor, raw: unknown = {}) {
  const q = querySchema.parse(raw),
    after = listCursor(q.cursor);
  return db.$transaction(async (tx) => {
    const scope = await recipient(tx, a),
      where = {
        ...scope.where,
        ...(q.filter === "unread" ? { readAt: null } : {}),
      };
    const anchor = after
      ? await tx.notification.findFirst({
          where: { ...scope.where, id: after },
          select: { id: true, createdAt: true },
        })
      : null;
    if (after && !anchor) throw new Denied(404);
    const rows = await tx.notification.findMany({
      where: {
        ...where,
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
    });
    const page = listPage(rows);
    return {
      items: page.items.map((n) => dto(n, scope)),
      next: page.next,
      timezone: scope.timezone,
      canStudy: scope.canStudy,
    };
  });
}
export async function notificationCount(a: Actor) {
  // Колокольчик опрашивает счётчик: здесь же появляются «Скоро дедлайн».
  try {
    await ensureDeadlineReminders(a);
  } catch (e) {
    if (!(e instanceof Denied)) throw e;
  }
  return db.$transaction(async (tx) => {
    const scope = await recipient(tx, a);
    return {
      count: await tx.notification.count({
        where: { ...scope.where, readAt: null },
      }),
    };
  });
}
export async function notificationDetail(a: Actor, id: string) {
  cursorId.parse(id);
  return db.$transaction(async (tx) => {
    const scope = await recipient(tx, a),
      n = await tx.notification.findFirst({
        where: { ...scope.where, id },
        select,
      });
    if (!n) throw new Denied(404);
    return {
      notification: dto(n, scope),
      timezone: scope.timezone,
      canStudy: scope.canStudy,
    };
  });
}
export async function readNotification(a: Actor, id: string, raw: unknown) {
  cursorId.parse(id);
  z.object({}).strict().parse(raw);
  return db.$transaction(async (tx) => {
    const scope = await recipient(tx, a, true);
    const found = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Notification" WHERE "id"=${id} AND "universityId"=${scope.where.universityId} AND "recipientMembershipId"=${scope.where.recipientMembershipId} FOR UPDATE`;
    if (!found.length) throw new Denied(404);
    const n = await tx.notification.findUniqueOrThrow({
      where: { id },
      select: { readAt: true },
    });
    if (n.readAt) return { readAt: n.readAt };
    const next = await tx.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: { readAt: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: a.user.id,
        universityId: scope.where.universityId,
        targetId: id,
        action: "NOTIFICATION_READ",
      },
    });
    return next;
  });
}
