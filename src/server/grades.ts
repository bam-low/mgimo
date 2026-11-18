import { z } from "zod";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import {
  lockUniversity,
  lockMembership,
  requireStaff,
  validGroup,
} from "./enrollment-guards";
import { validDay } from "@/lib/schedule-time";
import type { Prisma } from "../generated/prisma/client";
const id = z.string().min(1).max(100);
const reason = z.string().trim().min(1).max(500);
const result = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("MARK"), mark: z.number().int().min(2).max(5) })
    .strict(),
  z
    .object({ kind: z.literal("CREDIT"), credit: z.enum(["PASSED", "FAILED"]) })
    .strict(),
]);
const fields = { subjectId: id, issuedOn: z.string().refine(validDay), result };
export const gradeInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      operationId: z.uuid(),
      membershipId: id,
      groupId: id,
      ...fields,
    })
    .strict(),
  z
    .object({
      action: z.literal("EDIT"),
      id,
      version: z.number().int().positive(),
      reason,
      ...fields,
    })
    .strict(),
  z
    .object({
      action: z.literal("VOID"),
      id,
      version: z.number().int().positive(),
      reason,
    })
    .strict(),
]);
export const subjectInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("CREATE"),
      operationId: z.uuid(),
      name: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      action: z.literal("EDIT"),
      id,
      version: z.number().int().positive(),
      name: z.string().trim().min(1).max(160),
      active: z.boolean(),
    })
    .strict(),
]);
async function eligible(
  tx: Prisma.TransactionClient,
  membershipId: string,
  universityId: string,
) {
  await lockMembership(tx, membershipId, universityId);
  const m = await tx.universityMembership.findFirst({
    where: {
      id: membershipId,
      universityId,
      role: "STUDENT",
      status: "APPROVED",
      user: { active: true },
    },
    include: { enrollments: { where: { endedAt: null, revokedAt: null } } },
  });
  if (!m || m.enrollments.length !== 1) throw new Denied();
  await validGroup(tx, m.enrollments[0].groupId, universityId);
  return m.enrollments[0];
}
function snapshot(g: {
  membershipId: string;
  subjectId: string;
  kind: string;
  mark: number | null;
  credit: string | null;
  issuedOn: Date;
  voided: boolean;
  version: number;
}) {
  return {
    membershipId: g.membershipId,
    subjectId: g.subjectId,
    kind: g.kind,
    mark: g.mark,
    credit: g.credit,
    issuedOn: g.issuedOn.toISOString().slice(0, 10),
    voided: g.voided,
    version: g.version,
  };
}
export async function changeGrade(
  actorId: string,
  universityId: string,
  input: unknown,
) {
  const d = gradeInput.parse(input);
  return db.$transaction(async (tx) => {
    await requireStaff(tx, actorId, universityId);
    let old =
      d.action === "CREATE"
        ? null
        : await tx.grade.findFirst({ where: { id: d.id, universityId } });
    if (d.action !== "CREATE" && !old) throw new Denied(404);
    if (
      old &&
      (old.voided || old.version !== (d as { version: number }).version)
    )
      throw new Denied(409);
    const membershipId =
      d.action === "CREATE" ? d.membershipId : old!.membershipId;
    const enrollment = await eligible(tx, membershipId, universityId);
    if (d.action === "CREATE" && enrollment.groupId !== d.groupId) {
      const error = new Denied(409);
      error.message =
        "Студент не прикреплён к выбранной группе. Обновите список и выберите студента заново. Ввод результата сохранён.";
      throw error;
    }
    await requireStaff(tx, actorId, universityId);
    if (d.action !== "CREATE") {
      old = await tx.grade.findFirst({ where: { id: d.id, universityId } });
      if (!old) throw new Denied(404);
      if (old.voided || old.version !== d.version) throw new Denied(409);
    }
    if (
      d.action === "CREATE" &&
      (await tx.grade.findUnique({ where: { id: d.operationId } }))
    )
      throw new Denied(409);
    let data;
    if (d.action !== "VOID") {
      const subject = await tx.subject.findFirst({
        where: { id: d.subjectId, universityId, active: true },
      });
      if (!subject) throw new Denied();
      data = {
        subjectId: subject.id,
        issuedOn: new Date(d.issuedOn + "T00:00:00Z"),
        kind: d.result.kind,
        mark: d.result.kind === "MARK" ? d.result.mark : null,
        credit: d.result.kind === "CREDIT" ? d.result.credit : null,
      };
    }
    const grade =
      d.action === "CREATE"
        ? await tx.grade.create({
            data: {
              id: d.operationId,
              universityId,
              membershipId,
              authorId: actorId,
              ...data!,
            },
          })
        : await tx.grade.update({
            where: { id: old!.id },
            data: {
              ...(d.action === "VOID" ? { voided: true } : data),
              version: { increment: 1 },
            },
          });
    await tx.auditLog.create({
      data: {
        actorId,
        universityId,
        targetId: grade.id,
        action: "GRADE_" + d.action,
        reason: JSON.stringify({
          membershipId,
          ...(d.action === "CREATE" ? { groupId: enrollment.groupId } : {}),
          reason: d.action === "CREATE" ? null : d.reason,
          before: old ? snapshot(old) : null,
          after: snapshot(grade),
        }),
      },
    });
    return { id: grade.id };
  });
}
export async function changeSubject(
  actorId: string,
  universityId: string,
  input: unknown,
) {
  const d = subjectInput.parse(input);
  return db.$transaction(async (tx) => {
    await lockUniversity(tx, universityId);
    await requireStaff(tx, actorId, universityId);
    const old =
      d.action === "EDIT"
        ? await tx.subject.findFirst({ where: { id: d.id, universityId } })
        : null;
    if (d.action === "EDIT" && !old) throw new Denied(404);
    if (old && old.version !== (d as { version: number }).version)
      throw new Denied(409);
    if (
      d.action === "CREATE" &&
      (await tx.subject.findUnique({ where: { id: d.operationId } }))
    )
      throw new Denied(409);
    const subject =
      d.action === "CREATE"
        ? await tx.subject.create({
            data: { id: d.operationId, universityId, name: d.name },
          })
        : await tx.subject.update({
            where: { id: old!.id },
            data: { name: d.name, active: d.active, version: { increment: 1 } },
          });
    await tx.auditLog.create({
      data: {
        actorId,
        universityId,
        targetId: subject.id,
        action: "SUBJECT_" + d.action,
        reason: JSON.stringify({
          before: old ? { name: old.name, active: old.active } : null,
          after: { name: subject.name, active: subject.active },
        }),
      },
    });
    return { id: subject.id };
  });
}
type Actor = Awaited<ReturnType<typeof actor>>;
// Personal history follows membership, never a caller-supplied current group.
export async function readGrades(
  a: Actor,
  q: {
    membershipId?: string;
    cursor?: string;
    auditCursor?: string;
    from?: string;
    to?: string;
    subjectId?: string;
  } = {},
) {
  let membershipId = a.membership.id;
  const isStaff = a.membership.role === "STAFF";
  if (isStaff) {
    staff(a);
    membershipId = id.parse(q.membershipId);
    const m = await db.universityMembership.findFirst({
      where: {
        id: membershipId,
        universityId: a.membership.universityId,
        role: "STUDENT",
      },
    });
    if (!m) throw new Denied(404);
  } else {
    studentAccess(a);
    if (q.membershipId && q.membershipId !== membershipId) throw new Denied();
  }
  const from = q.from ? z.string().refine(validDay).parse(q.from) : undefined;
  const to = q.to ? z.string().refine(validDay).parse(q.to) : undefined;
  if (from && to && from > to) throw new Denied(400);
  const where = {
    universityId: a.membership.universityId,
    membershipId,
    ...(isStaff ? {} : { voided: false }),
    ...(from || to
      ? {
          issuedOn: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };
  // Aggregate the entire selected period, never just the visible result page.
  const totals = await db.grade.aggregate({
    where: { ...where, voided: false, kind: "MARK" },
    _avg: { mark: true },
    _count: { mark: true },
  });
  const credits = await db.grade.groupBy({
    by: ["credit"],
    where: { ...where, voided: false, kind: "CREDIT" },
    _count: true,
  });
  const subjectSummary = await db.grade.groupBy({
    by: ["subjectId"],
    where: { ...where, voided: false, kind: "MARK" },
    _avg: { mark: true },
    _count: { mark: true },
  });
  const selectedSubject = q.subjectId ? id.parse(q.subjectId) : undefined;
  const disciplines = await db.subject.findMany({
    where: {
      universityId: a.membership.universityId,
      ...(selectedSubject ? { id: selectedSubject } : {}),
      grades: {
        some: selectedSubject
          ? {
              universityId: a.membership.universityId,
              membershipId,
              ...(isStaff ? {} : { voided: false }),
            }
          : where,
      },
    },
    select: {
      id: true,
      name: true,
      active: true,
      _count: { select: { grades: { where } } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  if (selectedSubject && !disciplines.length) throw new Denied(404);
  const resultWhere = {
    ...where,
    ...(selectedSubject ? { subjectId: selectedSubject } : {}),
  };
  const cursor = q.cursor ? id.parse(q.cursor) : undefined;
  if (
    cursor &&
    !(await db.grade.findFirst({ where: { ...resultWhere, id: cursor } }))
  )
    throw new Denied(404);
  const rows = await db.grade.findMany({
    where: resultWhere,
    orderBy: [{ issuedOn: "desc" }, { id: "desc" }],
    take: 26,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      subject: { select: { name: true, active: true } },
      subjectId: true,
      issuedOn: true,
      kind: true,
      mark: true,
      credit: true,
      voided: true,
      version: true,
    },
  });
  const page = rows.slice(0, 25);
  const auditWhere = {
    universityId: a.membership.universityId,
    targetId: { in: page.map((r) => r.id) },
    action: { in: ["GRADE_CREATE", "GRADE_EDIT", "GRADE_VOID"] },
  };
  const auditCursor =
    isStaff && q.auditCursor ? id.parse(q.auditCursor) : undefined;
  if (
    auditCursor &&
    !(await db.auditLog.findFirst({
      where: { ...auditWhere, id: auditCursor },
    }))
  )
    throw new Denied(404);
  const events = isStaff
    ? await db.auditLog.findMany({
        where: auditWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 101,
        ...(auditCursor ? { cursor: { id: auditCursor }, skip: 1 } : {}),
        select: {
          id: true,
          targetId: true,
          actorId: true,
          action: true,
          reason: true,
          createdAt: true,
        },
      })
    : [];
  return {
    summary: {
      average: totals._avg.mark,
      count: totals._count.mark,
      passed: credits.find((c) => c.credit === "PASSED")?._count ?? 0,
      failed: credits.find((c) => c.credit === "FAILED")?._count ?? 0,
    },
    period: { from: from ?? "", to: to ?? "" },
    subjectSummary: subjectSummary.map((s) => ({
      subjectId: s.subjectId,
      average: s._avg.mark,
      count: s._count.mark,
    })),
    subjectId: selectedSubject ?? null,
    disciplines: disciplines.map((s) => ({
      id: s.id,
      name: s.name,
      active: s.active,
      count: s._count.grades,
    })),
    rows: page.map((r) => ({
      ...r,
      issuedOn: r.issuedOn.toISOString().slice(0, 10),
    })),
    next: rows.length > 25 ? page[24].id : null,
    events: events
      .slice(0, 100)
      .map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    nextAudit: events.length > 100 ? events[99].id : null,
  };
}
export async function gradeRoster(
  a: Actor,
  q: { groupId?: string; cursor?: string; history?: boolean } = {},
) {
  staff(a);
  if (!q.history && !q.groupId) return { rows: [], next: null };
  if (q.groupId)
    await validGroup(
      db,
      id.parse(q.groupId),
      a.membership.universityId,
      !q.history,
    );
  const where = {
    universityId: a.membership.universityId,
    role: "STUDENT",
    ...(!q.history ? { status: "APPROVED", user: { active: true } } : {}),
    ...(q.groupId
      ? {
          enrollments: {
            some: { groupId: q.groupId, endedAt: null, revokedAt: null },
          },
        }
      : {}),
  };
  const cursor = q.cursor ? id.parse(q.cursor) : undefined;
  if (
    cursor &&
    !(await db.universityMembership.findFirst({
      where: { ...where, id: cursor },
    }))
  )
    throw new Denied(404);
  const rows = await db.universityMembership.findMany({
    where,
    orderBy: { id: "asc" },
    take: 26,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      user: { select: { active: true } },
      profile: { select: { firstName: true, lastName: true } },
      enrollments: {
        where: { endedAt: null, revokedAt: null },
        select: {
          group: {
            select: {
              id: true,
              name: true,
              active: true,
              program: {
                select: { active: true, faculty: { select: { active: true } } },
              },
            },
          },
        },
      },
    },
  });
  return {
    rows: rows.slice(0, 25).map((m) => ({
      id: m.id,
      name: m.profile
        ? `${m.profile.lastName} ${m.profile.firstName}`
        : "Демо студент",
      group: m.enrollments[0]?.group.name ?? "Без группы",
      eligible:
        m.status === "APPROVED" &&
        m.user.active &&
        m.enrollments.length === 1 &&
        m.enrollments[0].group.active &&
        m.enrollments[0].group.program.active &&
        m.enrollments[0].group.program.faculty.active,
    })),
    next: rows.length > 25 ? rows[24].id : null,
  };
}
export async function subjects(a: Actor) {
  staff(a);
  const rows = await db.subject.findMany({
    where: { universityId: a.membership.universityId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 201,
    select: { id: true, name: true, active: true, version: true },
  });
  if (rows.length > 200) throw new Denied(409); // Explicit MVP capacity; never silently hide records.
  return rows;
}
