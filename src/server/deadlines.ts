import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import { lockMembership, lockUniversity } from "./enrollment-guards";
import { audienceTarget } from "./announcements";
import { notifyDeadline, saveDeadlineReminder } from "./notification-events";
import { parseInput } from "./portfolio";
import { civil } from "@/lib/semester";
import { text } from "@/lib/applications";
import { dayKey, localInstant, timeLabel } from "@/lib/schedule-time";

type Actor = Awaited<ReturnType<typeof actor>>;
const HOUR = 3600000;
/** Напоминание появляется, когда до срока осталось 48 часов или меньше. */
export const REMIND_BEFORE = 48 * HOUR;

export const deadlineInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      operationId: z.uuid(),
      scope: z.enum(["UNIVERSITY", "FACULTY", "PROGRAM", "GROUP"]),
      targetId: z.string().min(1).max(100).optional(),
      title: text(1, 120),
      body: text(0, 300).transform((v) => v || null),
      day: civil,
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Укажите время ЧЧ:ММ"),
    })
    .strict(),
  z.object({ action: z.literal("DELETE"), id: z.uuid() }).strict(),
]);
const doneInput = z.object({ id: z.uuid(), done: z.boolean() }).strict();

function error(message: string, status = 409): never {
  const e = new Denied(status);
  e.message = message;
  throw e;
}

const select = {
  id: true,
  scope: true,
  title: true,
  body: true,
  dueAt: true,
  createdAt: true,
  faculty: { select: { name: true } },
  program: { select: { name: true } },
  group: { select: { name: true } },
} satisfies Prisma.DeadlineSelect;
type Row = Prisma.DeadlineGetPayload<{ select: typeof select }>;
function audience(r: Row) {
  return r.scope === "GROUP"
    ? (r.group?.name ?? "Группа")
    : r.scope === "PROGRAM"
      ? (r.program?.name ?? "Направление")
      : r.scope === "FACULTY"
        ? (r.faculty?.name ?? "Факультет")
        : "Весь университет";
}
function view(r: Row, zone: string) {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    audience: audience(r),
    dueAt: r.dueAt.toISOString(),
    day: dayKey(r.dueAt, zone),
    time: timeLabel(r.dueAt, zone),
  };
}
export type DeadlineView = ReturnType<typeof view> & { done?: boolean };

/** Видимые студенту: его группа, направление, факультет или весь вуз. */
function visibleTo(a: Actor) {
  const group = studentAccess(a).group;
  return {
    universityId: a.membership.universityId,
    deletedAt: null,
    OR: [
      { scope: "UNIVERSITY" },
      { scope: "FACULTY", facultyId: group.program.facultyId },
      { scope: "PROGRAM", programId: group.programId },
      { scope: "GROUP", groupId: group.id },
    ],
  } satisfies Prisma.DeadlineWhereInput;
}

/**
 * Напоминания «Скоро дедлайн»: при входе студента, если до срока ≤ 48 ч и он
 * не отметил «Сделано». Ровно одно на дедлайн — повтор ничего не создаёт.
 */
export async function ensureDeadlineReminders(a: Actor) {
  if (a.membership.role !== "STUDENT") return 0;
  const where = visibleTo(a),
    now = new Date(),
    membershipId = a.membership.id,
    universityId = a.membership.universityId;
  const due = await db.deadline.findMany({
    where: {
      ...where,
      dueAt: { gt: now, lte: new Date(+now + REMIND_BEFORE) },
      done: { none: { membershipId } },
      notifications: {
        none: { recipientMembershipId: membershipId, kind: "DEADLINE_SOON" },
      },
    },
    select: { id: true },
    take: 20,
  });
  if (!due.length) return 0;
  return db.$transaction(async (tx) => {
    await lockMembership(tx, membershipId, universityId);
    let created = 0;
    for (const d of due) {
      const exists = await tx.notification.findFirst({
        where: {
          universityId,
          recipientMembershipId: membershipId,
          sourceKey: `deadline:${d.id}:soon`,
        },
        select: { id: true },
      });
      if (exists) continue;
      await saveDeadlineReminder(
        tx,
        a.user.id,
        universityId,
        membershipId,
        d.id,
      );
      created++;
    }
    return created;
  });
}

/** Студент: активные (ближайшие сверху) и прошедшие за 30 дней. */
export async function studentDeadlines(a: Actor) {
  const where = visibleTo(a),
    zone = a.membership.university.timezone,
    now = new Date();
  await ensureDeadlineReminders(a);
  const rows = await db.deadline.findMany({
    where: { ...where, dueAt: { gt: new Date(+now - 30 * 24 * HOUR) } },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: 100,
    select: {
      ...select,
      done: {
        where: { membershipId: a.membership.id },
        select: { createdAt: true },
      },
    },
  });
  const items = rows.map((r) => ({
    ...view(r, zone),
    done: r.done.length > 0,
  }));
  return {
    timezone: zone,
    today: dayKey(now, zone),
    serverNow: now.toISOString(),
    active: items.filter((i) => Date.parse(i.dueAt) > +now),
    past: items.filter((i) => Date.parse(i.dueAt) <= +now).reverse(),
  };
}

/** «Сделано» — личная отметка студента; снимается повторным нажатием. */
export async function markDeadline(a: Actor, raw: unknown) {
  const d = parseInput(doneInput.parse, raw);
  const where = visibleTo(a),
    membershipId = a.membership.id;
  const found = await db.deadline.findFirst({
    where: { ...where, id: d.id },
    select: { id: true },
  });
  if (!found) throw new Denied(404);
  if (d.done)
    await db.deadlineDone.upsert({
      where: { deadlineId_membershipId: { deadlineId: d.id, membershipId } },
      create: {
        deadlineId: d.id,
        membershipId,
        universityId: a.membership.universityId,
      },
      update: {},
    });
  else
    await db.deadlineDone.deleteMany({
      where: { deadlineId: d.id, membershipId },
    });
  return { id: d.id, done: d.done };
}

/** Сотрудник: действующие и прошедшие за неделю дедлайны вуза. */
export async function staffDeadlines(a: Actor) {
  staff(a);
  const zone = a.membership.university.timezone;
  const rows = await db.deadline.findMany({
    where: {
      universityId: a.membership.universityId,
      deletedAt: null,
      dueAt: { gt: new Date(Date.now() - 7 * 24 * HOUR) },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: 200,
    select,
  });
  return {
    timezone: zone,
    today: dayKey(new Date(), zone),
    items: rows.map((r) => view(r, zone)),
  };
}

/** Сотрудник: опубликовать дедлайн (адресатам — уведомление) или отменить. */
export async function changeDeadline(a: Actor, raw: unknown) {
  staff(a);
  const d = parseInput(deadlineInput.parse, raw);
  const universityId = a.membership.universityId,
    actorId = a.user.id,
    zone = a.membership.university.timezone;
  return db.$transaction(
    async (tx) => {
      await lockUniversity(tx, universityId);
      if (d.action === "DELETE") {
        const gone = await tx.deadline.updateMany({
          where: { id: d.id, universityId, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        if (!gone.count) throw new Denied(404);
        await tx.auditLog.create({
          data: {
            actorId,
            universityId,
            targetId: d.id,
            action: "DEADLINE_DELETED",
          },
        });
        return { id: d.id, deleted: true };
      }
      if (await tx.deadline.findUnique({ where: { id: d.operationId } }))
        error("Уже опубликовано. Обновите страницу.");
      let dueAt: Date;
      try {
        dueAt = localInstant(d.day, d.time, zone);
      } catch {
        error("Такого времени нет в календаре вуза.", 400);
      }
      if (dueAt <= new Date()) error("Срок уже прошёл.", 400);
      if (+dueAt - Date.now() > 366 * 24 * HOUR)
        error("Срок — не дальше чем через год.", 400);
      const created = await tx.deadline.create({
        data: {
          id: d.operationId,
          universityId,
          scope: d.scope,
          ...(await audienceTarget(tx, universityId, d.scope, d.targetId)),
          title: d.title,
          body: d.body,
          dueAt,
          authorId: actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          universityId,
          targetId: created.id,
          action: "DEADLINE_CREATED",
          reason: d.scope,
        },
      });
      await notifyDeadline(tx, actorId, created);
      return { id: created.id };
    },
    { timeout: 15000 },
  );
}
