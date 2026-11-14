import { z } from "zod";
import { db } from "./db";
import type { Prisma } from "../generated/prisma/client";
import { actor, Denied, studentAccess } from "./security";
import { lockMembership } from "./enrollment-guards";
import { cursorId, listCursor, listPage, pageSize } from "@/lib/pagination";
import { notificationText } from "@/lib/notifications";
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
} satisfies Prisma.NotificationSelect;
type Row = Prisma.NotificationGetPayload<{ select: typeof select }>;
function dto(n: Row, scope: Awaited<ReturnType<typeof recipient>>) {
  if (n.schemaVersion !== 1) throw new Denied(503);
  const target = n.enrollmentRequestId
    ? scope.latestRequestId === n.enrollmentRequestId
      ? { available: true, href: "/cabinet" }
      : { available: false, reasonCode: "PREVIOUS_ENROLLMENT" }
    : scope.canStudy
      ? {
          available: true,
          href: `/applications/${encodeURIComponent(n.applicationId!)}`,
        }
      : { available: false, reasonCode: "STUDY_ACCESS_CLOSED" };
  const message = n.enrollmentRequestId
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
