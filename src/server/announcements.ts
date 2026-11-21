import { z } from "zod";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import { lockUniversity } from "./enrollment-guards";
import type { Prisma } from "../generated/prisma/client";

type Actor = Awaited<ReturnType<typeof actor>>;

const DAY = 24 * 60 * 60 * 1000;
export const ANNOUNCEMENT_TERMS = ["1", "2", "3", "5", "NONE"] as const;
const id = z.string().min(1).max(100);

export const announcementInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      operationId: z.uuid(),
      scope: z.enum(["UNIVERSITY", "FACULTY", "PROGRAM", "GROUP"]),
      targetId: id.optional(),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(2000),
      term: z.enum(ANNOUNCEMENT_TERMS),
    })
    .strict(),
  z.object({ action: z.literal("DELETE"), id }).strict(),
]);

/** Истёкшие объявления не показываются и физически удаляются, чтобы не копить мусор. */
async function purgeExpired(universityId: string, now = new Date()) {
  await db.announcement.deleteMany({
    where: { universityId, expiresAt: { lte: now } },
  });
}

const active = (now: Date) => ({
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

const select = {
  id: true,
  scope: true,
  title: true,
  body: true,
  expiresAt: true,
  createdAt: true,
  faculty: { select: { name: true } },
  program: { select: { name: true, faculty: { select: { name: true } } } },
  group: {
    select: {
      name: true,
      program: { select: { name: true, faculty: { select: { name: true } } } },
    },
  },
} satisfies Prisma.AnnouncementSelect;

type Row = Prisma.AnnouncementGetPayload<{ select: typeof select }>;

function audience(r: Row) {
  if (r.scope === "FACULTY") return r.faculty?.name ?? "Факультет";
  if (r.scope === "PROGRAM")
    return [r.program?.faculty.name, r.program?.name]
      .filter(Boolean)
      .join(" / ");
  if (r.scope === "GROUP")
    return [r.group?.program.faculty.name, r.group?.program.name, r.group?.name]
      .filter(Boolean)
      .join(" / ");
  return "Весь университет";
}

const view = (r: Row) => ({
  id: r.id,
  scope: r.scope,
  audience: audience(r),
  title: r.title,
  body: r.body,
  expiresAt: r.expiresAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

/** Объявления для студента: весь вуз, его факультет, направление и группа. */
export async function studentAnnouncements(a: Actor, take = 50) {
  const enrollment = studentAccess(a);
  const universityId = a.membership.universityId,
    now = new Date();
  await purgeExpired(universityId, now);
  const group = enrollment.group;
  const rows = await db.announcement.findMany({
    where: {
      universityId,
      AND: [
        active(now),
        {
          OR: [
            { scope: "UNIVERSITY" },
            { scope: "FACULTY", facultyId: group.program.facultyId },
            { scope: "PROGRAM", programId: group.programId },
            { scope: "GROUP", groupId: group.id },
          ],
        },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select,
  });
  return { timezone: a.membership.university.timezone, items: rows.map(view) };
}

/** Все действующие объявления вуза для сотрудника. */
export async function staffAnnouncements(a: Actor) {
  staff(a);
  const universityId = a.membership.universityId,
    now = new Date();
  await purgeExpired(universityId, now);
  const rows = await db.announcement.findMany({
    where: { universityId, ...active(now) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select,
  });
  return { timezone: a.membership.university.timezone, items: rows.map(view) };
}

async function target(
  tx: Prisma.TransactionClient,
  universityId: string,
  scope: "UNIVERSITY" | "FACULTY" | "PROGRAM" | "GROUP",
  targetId?: string,
) {
  if (scope === "UNIVERSITY") {
    if (targetId) throw new Denied(400);
    return {};
  }
  if (!targetId) throw new Denied(400);
  const ok =
    scope === "FACULTY"
      ? await tx.faculty.findFirst({
          where: { id: targetId, universityId, active: true },
        })
      : scope === "PROGRAM"
        ? await tx.program.findFirst({
            where: {
              id: targetId,
              active: true,
              faculty: { universityId, active: true },
            },
          })
        : await tx.studentGroup.findFirst({
            where: {
              id: targetId,
              active: true,
              program: {
                active: true,
                faculty: { universityId, active: true },
              },
            },
          });
  if (!ok) throw new Denied(404);
  return scope === "FACULTY"
    ? { facultyId: targetId }
    : scope === "PROGRAM"
      ? { programId: targetId }
      : { groupId: targetId };
}

export async function changeAnnouncement(a: Actor, input: unknown) {
  staff(a);
  const d = announcementInput.parse(input);
  const universityId = a.membership.universityId,
    actorId = a.user.id;
  return db.$transaction(async (tx) => {
    await lockUniversity(tx, universityId);
    if (d.action === "DELETE") {
      const gone = await tx.announcement.deleteMany({
        where: { id: d.id, universityId },
      });
      if (!gone.count) throw new Denied(404);
      await tx.auditLog.create({
        data: {
          actorId,
          universityId,
          targetId: d.id,
          action: "ANNOUNCEMENT_DELETED",
        },
      });
      return { id: d.id, deleted: true };
    }
    // Повтор того же запроса (двойной клик, сеть) не создаёт дубль.
    const existing = await tx.announcement.findFirst({
      where: { id: d.operationId, universityId },
      select,
    });
    if (existing) return view(existing);
    const now = new Date();
    const created = await tx.announcement.create({
      data: {
        id: d.operationId,
        universityId,
        scope: d.scope,
        ...(await target(tx, universityId, d.scope, d.targetId)),
        title: d.title,
        body: d.body,
        authorId: actorId,
        expiresAt:
          d.term === "NONE"
            ? null
            : new Date(now.getTime() + Number(d.term) * DAY),
      },
      select,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        universityId,
        targetId: created.id,
        action: "ANNOUNCEMENT_CREATED",
        reason: d.scope,
      },
    });
    return view(created);
  });
}
