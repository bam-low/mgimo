import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { actor, studentAccess, Denied } from "./security";

type Actor = Awaited<ReturnType<typeof actor>>;

const failing = [
  { kind: "MARK", mark: 2 },
  { kind: "CREDIT", credit: "FAILED" },
];

/**
 * «Можно исправить»: действующие «2» и «незачёт» студента.
 * Долг уходит из списка сам, если по той же дисциплине позже появилась
 * положительная оценка, или когда студент скрыл его галочкой.
 */
export async function readDebts(a: Actor) {
  studentAccess(a);
  const universityId = a.membership.universityId,
    membershipId = a.membership.id;
  const failed = await db.grade.findMany({
    where: { universityId, membershipId, voided: false, OR: failing },
    orderBy: [{ issuedOn: "desc" }, { id: "desc" }],
    take: 200,
    select: {
      id: true,
      subjectId: true,
      subject: { select: { name: true } },
      kind: true,
      mark: true,
      credit: true,
      issuedOn: true,
      createdAt: true,
      dismissals: { where: { membershipId }, select: { id: true } },
    },
  });
  if (!failed.length) return { open: [], hidden: [] };
  const positive = await db.grade.findMany({
    where: {
      universityId,
      membershipId,
      voided: false,
      subjectId: { in: [...new Set(failed.map((g) => g.subjectId))] },
      OR: [
        { kind: "MARK", mark: { gte: 3 } },
        { kind: "CREDIT", credit: "PASSED" },
      ],
    },
    select: { subjectId: true, issuedOn: true, createdAt: true },
  });
  const later = (g: (typeof failed)[number]) =>
    positive.some(
      (p) =>
        p.subjectId === g.subjectId &&
        (p.issuedOn > g.issuedOn ||
          (p.issuedOn.getTime() === g.issuedOn.getTime() &&
            p.createdAt > g.createdAt)),
    );
  const rows = failed
    .filter((g) => !later(g))
    .map((g) => ({
      id: g.id,
      subject: g.subject.name,
      result: g.kind === "MARK" ? "2" : "Незачёт",
      issuedOn: g.issuedOn.toISOString().slice(0, 10),
      hidden: g.dismissals.length > 0,
    }));
  return {
    open: rows.filter((r) => !r.hidden),
    hidden: rows.filter((r) => r.hidden),
  };
}

export const debtInput = z
  .object({ gradeId: z.string().min(1).max(100), hidden: z.boolean() })
  .strict();

/** Личная отметка студента; оценку и журнал сотрудника не меняет. */
export async function setDebtHidden(a: Actor, input: unknown) {
  studentAccess(a);
  const { gradeId, hidden } = debtInput.parse(input);
  const universityId = a.membership.universityId,
    membershipId = a.membership.id;
  const grade = await db.grade.findFirst({
    where: {
      id: gradeId,
      universityId,
      membershipId,
      voided: false,
      OR: failing,
    },
    select: { id: true },
  });
  if (!grade) throw new Denied(404);
  if (hidden)
    await db.gradeDismissal.upsert({
      where: { membershipId_gradeId: { membershipId, gradeId } },
      create: { id: randomUUID(), universityId, membershipId, gradeId },
      update: {},
    });
  else await db.gradeDismissal.deleteMany({ where: { membershipId, gradeId } });
  return { gradeId, hidden };
}
