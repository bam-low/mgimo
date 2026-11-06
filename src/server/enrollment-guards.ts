import type { Prisma } from "../generated/prisma/client";
import { Denied } from "./security";
export async function validGroup(
  tx: Prisma.TransactionClient,
  groupId: string,
  universityId: string,
  requireActive = true,
) {
  if ("$executeRaw" in tx) await lockUniversity(tx, universityId);
  const group = await tx.studentGroup.findUnique({
    where: { id: groupId },
    include: {
      program: { include: { faculty: { include: { university: true } } } },
    },
  });
  if (
    !group ||
    (requireActive &&
      (!group.active ||
        !group.program.active ||
        !group.program.faculty.active)) ||
    !group.program.faculty.university.active ||
    group.program.faculty.universityId !== universityId
  )
    throw new Denied();
  return group;
}
// Same row lock for approval, retry, transfer and revoke: no half-transitions.
export async function lockMembership(
  tx: Prisma.TransactionClient,
  membershipId: string,
  universityId: string,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "UniversityMembership" WHERE "id"=${membershipId} AND "universityId"=${universityId} FOR UPDATE`;
  if (rows.length !== 1) throw new Denied();
}
export async function requireStaff(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
) {
  const m = await tx.universityMembership.findUnique({
    where: { userId_universityId: { userId: actorId, universityId } },
    include: { user: true, university: true },
  });
  if (
    !m?.user.active ||
    !m.university.active ||
    m.role !== "STAFF" ||
    m.status !== "APPROVED"
  )
    throw new Denied();
}

// Transaction advisory lock also works with the SELECT-only University grant.
// Serializes structure deactivation and enrollment/schedule writes across runtimes.
export async function lockUniversity(
  tx: Prisma.TransactionClient,
  universityId: string,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${universityId},29))::text`;
}
