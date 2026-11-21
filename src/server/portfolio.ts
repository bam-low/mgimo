import { createHash } from "node:crypto";
import { z, ZodError } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import { lockMembership, lockUniversity, requireStaff } from "./enrollment-guards";
import { notifyPortfolio } from "./notification-events";
import { dayKey } from "@/lib/schedule-time";
import { MAX_DOCUMENT } from "@/lib/applications";
import {
  portfolioMetadata,
  portfolioStudentAction,
  portfolioStaffAction,
  portfolioFileName,
  PORTFOLIO_MAX_ITEMS,
  PORTFOLIO_UNIVERSITY_QUOTA,
  type PortfolioStatus,
} from "@/lib/portfolio";

type Actor = Awaited<ReturnType<typeof actor>>;
const uuid = z.uuid();

function error(message: string, status = 409): never {
  const e = new Denied(status);
  e.message = message;
  throw e;
}
/** Понятная причина вместо общего «не удалось»: поля формы проверяются на сервере. */
export function parseInput<T>(parse: (v: unknown) => T, raw: unknown): T {
  try {
    return parse(raw);
  } catch (e) {
    if (e instanceof ZodError)
      error(
        e.issues[0]?.message && !/^Invalid|^Too|^Expected/.test(e.issues[0].message)
          ? e.issues[0].message
          : "Проверьте заполнение полей формы.",
        400,
      );
    throw e;
  }
}

const select = {
  id: true,
  status: true,
  category: true,
  activity: true,
  eventDate: true,
  title: true,
  comment: true,
  format: true,
  eventType: true,
  rulesUrl: true,
  participants: true,
  eventUrl: true,
  level: true,
  organizers: true,
  byteSize: true,
  reviewComment: true,
  reviewedAt: true,
  submittedAt: true,
  createdAt: true,
  version: true,
} satisfies Prisma.PortfolioItemSelect;
type Row = Prisma.PortfolioItemGetPayload<{ select: typeof select }>;

function dto(r: Row) {
  return {
    ...r,
    status: r.status as PortfolioStatus,
    eventDate: r.eventDate.toISOString().slice(0, 10),
    organizers: Array.isArray(r.organizers)
      ? (r.organizers as { type: string; name: string }[])
      : [],
  };
}
export type PortfolioItemView = ReturnType<typeof dto>;

function today(a: Actor) {
  return dayKey(new Date(), a.membership.university.timezone);
}

/** Свои работы студента — все состояния, новые сверху. */
export async function studentPortfolio(a: Actor) {
  studentAccess(a);
  const rows = await db.portfolioItem.findMany({
    where: {
      membershipId: a.membership.id,
      universityId: a.membership.universityId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PORTFOLIO_MAX_ITEMS,
    select,
  });
  return {
    timezone: a.membership.university.timezone,
    today: today(a),
    limit: PORTFOLIO_MAX_ITEMS,
    items: rows.map(dto),
  };
}

export async function createPortfolioItem(
  a: Actor,
  raw: unknown,
  file: { content: Uint8Array; sha256: string; mime: string },
) {
  studentAccess(a);
  const m = parseInput(portfolioMetadata.parse, raw);
  if (
    file.mime !== "application/pdf" ||
    !file.content.length ||
    file.content.length > MAX_DOCUMENT ||
    file.sha256 !== createHash("sha256").update(file.content).digest("hex")
  )
    throw new Denied(400);
  if (m.eventDate > today(a))
    error("Дата мероприятия не может быть позже сегодняшней.", 400);
  const universityId = a.membership.universityId,
    membershipId = a.membership.id;
  return db.$transaction(
    async (tx) => {
      await lockMembership(tx, membershipId, universityId);
      await lockUniversity(tx, universityId);
      if (await tx.portfolioItem.findUnique({ where: { id: m.operationId } }))
        error("Эта работа уже сохранена. Обновите страницу.");
      // Внутри транзакции — строго по очереди: одно соединение, без параллельных запросов.
      const own = await tx.portfolioItem.count({
        where: { membershipId, universityId },
      });
      const total = await tx.portfolioItem.aggregate({
        where: { universityId },
        _sum: { byteSize: true },
      });
      if (own >= PORTFOLIO_MAX_ITEMS)
        error(
          `В портфолио может быть не больше ${PORTFOLIO_MAX_ITEMS} работ. Удалите ненужную работу «Только для вас».`,
        );
      if ((total._sum.byteSize ?? 0) + file.content.length > PORTFOLIO_UNIVERSITY_QUOTA)
        error("Хранилище портфолио демо-вуза заполнено. Попробуйте позже.");
      const now = new Date();
      const created = await tx.portfolioItem.create({
        data: {
          id: m.operationId,
          universityId,
          membershipId,
          status: m.mode,
          category: m.category,
          activity: m.activity,
          eventDate: new Date(m.eventDate + "T00:00:00Z"),
          title: m.title,
          comment: m.comment,
          format: m.format,
          eventType: m.eventType,
          rulesUrl: m.rulesUrl,
          participants: m.participants,
          eventUrl: m.eventUrl,
          level: m.level,
          organizers: m.organizers,
          byteSize: file.content.length,
          sha256: file.sha256,
          content: new Uint8Array(file.content),
          submittedAt: m.mode === "PENDING" ? now : null,
        },
        select,
      });
      await tx.auditLog.create({
        data: {
          actorId: a.user.id,
          universityId,
          targetId: created.id,
          action: m.mode === "PENDING" ? "PORTFOLIO_SUBMITTED" : "PORTFOLIO_SAVED",
        },
      });
      return dto(created);
    },
    { timeout: 15000 },
  );
}

/** Студент: отправить «Только для вас» или отклонённую работу на модерацию, удалить свою скрытую. */
export async function actOnOwnPortfolio(a: Actor, raw: unknown) {
  studentAccess(a);
  const d = parseInput(portfolioStudentAction.parse, raw);
  const universityId = a.membership.universityId,
    membershipId = a.membership.id;
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PortfolioItem"
      WHERE "id"=${d.id} AND "membershipId"=${membershipId} AND "universityId"=${universityId}
      FOR UPDATE`;
    if (rows.length !== 1) throw new Denied(404);
    const item = await tx.portfolioItem.findUniqueOrThrow({
      where: { id: d.id },
      select: { status: true, version: true },
    });
    if (item.version !== d.expectedVersion)
      error("Работа уже изменена. Обновите страницу.");
    if (d.action === "DELETE") {
      if (item.status !== "PRIVATE")
        error("Удалить можно только работу «Только для вас».");
      await tx.portfolioItem.delete({ where: { id: d.id } });
      await tx.auditLog.create({
        data: { actorId: a.user.id, universityId, targetId: d.id, action: "PORTFOLIO_DELETED" },
      });
      return { id: d.id, deleted: true };
    }
    if (!["PRIVATE", "REJECTED"].includes(item.status))
      error("Работа уже на модерации или подтверждена.");
    const next = await tx.portfolioItem.update({
      where: { id: d.id },
      data: {
        status: "PENDING",
        submittedAt: new Date(),
        reviewerId: null,
        reviewedAt: null,
        reviewComment: null,
        version: { increment: 1 },
      },
      select,
    });
    await tx.auditLog.create({
      data: { actorId: a.user.id, universityId, targetId: d.id, action: "PORTFOLIO_SUBMITTED" },
    });
    return dto(next);
  });
}

const staffSelect = {
  ...select,
  membershipId: true,
  membership: {
    select: {
      user: { select: { name: true } },
      enrollments: {
        where: { endedAt: null, revokedAt: null },
        select: { group: { select: { name: true } } },
        take: 1,
      },
    },
  },
} satisfies Prisma.PortfolioItemSelect;
type StaffRow = Prisma.PortfolioItemGetPayload<{ select: typeof staffSelect }>;
function staffDto(r: StaffRow) {
  const { membership, membershipId, ...rest } = r;
  return {
    ...dto(rest),
    student: {
      id: membershipId,
      name: membership.user.name,
      group: membership.enrollments[0]?.group.name ?? "Без группы",
    },
  };
}
export type StaffPortfolioItemView = ReturnType<typeof staffDto>;

/** Очередь модерации: все работы «На модерации», старые сверху. */
export async function staffPortfolioQueue(a: Actor) {
  staff(a);
  const rows = await db.portfolioItem.findMany({
    where: { universityId: a.membership.universityId, status: "PENDING" },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 200,
    select: staffSelect,
  });
  return { timezone: a.membership.university.timezone, items: rows.map(staffDto) };
}

/** Студенты вуза для выбора и число их видимых деканату работ. */
export async function staffPortfolioStudents(a: Actor) {
  staff(a);
  const universityId = a.membership.universityId;
  const [students, counts] = await Promise.all([
    db.universityMembership.findMany({
      where: { universityId, role: "STUDENT", status: "APPROVED" },
      orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        user: { select: { name: true } },
        enrollments: {
          where: { endedAt: null, revokedAt: null },
          select: { group: { select: { name: true } } },
          take: 1,
        },
      },
    }),
    db.portfolioItem.groupBy({
      by: ["membershipId"],
      where: { universityId, status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
      _count: { _all: true },
    }),
  ]);
  const count = new Map(counts.map((c) => [c.membershipId, c._count._all]));
  return students.map((s) => ({
    id: s.id,
    name: s.user.name,
    group: s.enrollments[0]?.group.name ?? "Без группы",
    items: count.get(s.id) ?? 0,
  }));
}

/** Достижения выбранного студента глазами деканата: без работ «Только для вас». */
export async function staffStudentPortfolio(a: Actor, membershipId: string) {
  staff(a);
  z.string().min(1).max(100).parse(membershipId);
  const universityId = a.membership.universityId;
  const member = await db.universityMembership.findFirst({
    where: { id: membershipId, universityId, role: "STUDENT" },
    select: { id: true },
  });
  if (!member) throw new Denied(404);
  const rows = await db.portfolioItem.findMany({
    where: {
      membershipId,
      universityId,
      status: { in: ["PENDING", "APPROVED", "REJECTED"] },
    },
    orderBy: [{ eventDate: "desc" }, { id: "desc" }],
    take: 100,
    select: staffSelect,
  });
  return rows.map(staffDto);
}

/** Деканат: подтвердить или отклонить работу; студенту приходит уведомление. */
export async function decidePortfolio(a: Actor, raw: unknown) {
  staff(a);
  const d = parseInput(portfolioStaffAction.parse, raw);
  const universityId = a.membership.universityId;
  return db.$transaction(async (tx) => {
    await requireStaff(tx, a.user.id, universityId);
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PortfolioItem"
      WHERE "id"=${d.id} AND "universityId"=${universityId} AND "status" <> 'PRIVATE'
      FOR UPDATE`;
    if (rows.length !== 1) throw new Denied(404);
    const item = await tx.portfolioItem.findUniqueOrThrow({
      where: { id: d.id },
      select: { status: true, version: true, reviewRound: true, membershipId: true },
    });
    if (item.status !== "PENDING" || item.version !== d.expectedVersion)
      error("Решение по работе уже принято или она изменена. Обновите страницу.");
    const approved = d.action === "APPROVE",
      round = item.reviewRound + 1;
    const next = await tx.portfolioItem.update({
      where: { id: d.id },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        reviewRound: round,
        reviewerId: a.user.id,
        reviewedAt: new Date(),
        reviewComment: d.comment,
        version: { increment: 1 },
      },
      select,
    });
    await tx.auditLog.create({
      data: {
        actorId: a.user.id,
        universityId,
        targetId: d.id,
        action: approved ? "PORTFOLIO_APPROVED" : "PORTFOLIO_REJECTED",
      },
    });
    await notifyPortfolio(
      tx,
      a.user.id,
      { id: d.id, universityId, membershipId: item.membershipId },
      round,
      approved,
    );
    return dto(next);
  });
}

/** PDF работы: студенту — своя, деканату — любая, кроме «Только для вас». */
export async function portfolioFile(a: Actor, id: string) {
  uuid.parse(id);
  const isStaff = a.membership.role === "STAFF";
  if (isStaff) staff(a);
  else studentAccess(a);
  const item = await db.portfolioItem.findFirst({
    where: {
      id,
      universityId: a.membership.universityId,
      ...(isStaff
        ? { status: { in: ["PENDING", "APPROVED", "REJECTED"] } }
        : { membershipId: a.membership.id }),
    },
    select: { id: true, content: true },
  });
  if (!item) throw new Denied(404);
  return {
    content: item.content,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${portfolioFileName(item.id)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Accept-Ranges": "none",
    },
  };
}
