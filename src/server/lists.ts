import { db } from "./db";
import { actor, staff, Denied } from "./security";
import { listPage, pageSize } from "@/lib/pagination";
type Actor = Awaited<ReturnType<typeof actor>>;

export async function ownRequestPage(a: Actor, after?: string) {
  if (a.membership.role !== "STUDENT") throw new Denied();
  const where = { membershipId: a.membership.id };
  if (
    after &&
    !(await db.enrollmentRequest.findFirst({
      where: { ...where, id: after },
      select: { id: true },
    }))
  )
    throw new Denied(404);
  return listPage(
    await db.enrollmentRequest.findMany({
      where,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: pageSize + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true, createdAt: true },
    }),
  );
}
export async function staffRequestPage(a: Actor, after?: string) {
  staff(a);
  const scope = { membership: { universityId: a.membership.universityId } };
  if (
    after &&
    !(await db.enrollmentRequest.findFirst({
      where: { ...scope, id: after },
      select: { id: true },
    }))
  )
    throw new Denied(404);
  return listPage(
    await db.enrollmentRequest.findMany({
      where: {
        membership: {
          universityId: a.membership.universityId,
          role: "STUDENT",
          status: "PENDING",
        },
        status: "PENDING",
      },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: pageSize + 1,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        createdAt: true,
        membership: {
          select: { profile: { select: { firstName: true, lastName: true } } },
        },
        targetGroup: {
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
    }),
  );
}
export async function staffMemberPage(a: Actor, after?: string) {
  staff(a);
  const scope = { universityId: a.membership.universityId, role: "STUDENT" };
  if (
    after &&
    !(await db.universityMembership.findFirst({
      where: { ...scope, id: after },
      select: { id: true },
    }))
  )
    throw new Denied(404);
  return listPage(
    await db.universityMembership.findMany({
      where: { ...scope, status: "APPROVED" },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      take: pageSize + 1,
      orderBy: { id: "asc" },
      select: {
        id: true,
        resubmissionAllowed: true,
        profile: { select: { firstName: true, lastName: true } },
        enrollments: {
          where: { endedAt: null, revokedAt: null },
          take: 1,
          select: {
            id: true,
            groupId: true,
            group: { select: { name: true, active: true } },
          },
        },
      },
    }),
  );
}
