import type { Prisma } from "../generated/prisma/client";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db } from "./db";
import { makeAuth } from "./auth";
import { Denied } from "./security";
export const registration = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
    universityId: z.string().max(100),
    facultyId: z.string().max(100),
    programId: z.string().max(100),
    groupId: z.string().max(100),
  })
  .strict();
export async function validGroup(
  tx: Prisma.TransactionClient,
  groupId: string,
  universityId: string,
  requireActive = true,
) {
  const group = await tx.studentGroup.findUnique({
    where: { id: groupId },
    include: {
      program: { include: { faculty: { include: { university: true } } } },
    },
  });
  if (
    !group ||
    (requireActive && !group.active) ||
    !group.program.faculty.university.active ||
    group.program.faculty.universityId !== universityId
  )
    throw new Denied();
  return group;
}
export async function register(input: unknown, headers: Headers) {
  const data = registration.parse(input);
  return db.$transaction(
    async (tx) => {
      if (await tx.user.findUnique({ where: { email: data.email } })) {
        await hashPassword(data.password);
        throw new Denied(409);
      }
      const group = await validGroup(tx, data.groupId, data.universityId);
      if (
        group.programId !== data.programId ||
        group.program.facultyId !== data.facultyId
      )
        throw new Denied();
      const response = await makeAuth(tx, true).api.signUpEmail({
        headers,
        body: {
          name: data.firstName + " " + data.lastName,
          email: data.email,
          password: data.password,
        },
        asResponse: true,
      });
      if (!response.ok) throw new Denied(400);
      // Never trust the synthetic signup response: verify the newly created auth row.
      const user = await tx.user.findUnique({ where: { email: data.email } });
      if (
        !user ||
        (await tx.universityMembership.count({ where: { userId: user.id } }))
      )
        throw new Denied(400);
      const membership = await tx.universityMembership.create({
        data: {
          userId: user.id,
          universityId: data.universityId,
          profile: {
            create: { firstName: data.firstName, lastName: data.lastName },
          },
          requests: { create: { targetGroupId: group.id } },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          universityId: data.universityId,
          targetId: membership.id,
          action: "SUBMITTED",
          newGroupId: group.id,
        },
      });
    },
    { timeout: 20000 },
  );
}
export async function decide(
  actorId: string,
  universityId: string,
  requestId: string,
  status: "APPROVED" | "REJECTED",
  reason: string,
) {
  await db.$transaction(async (tx) => {
    const staff = await tx.universityMembership.findUnique({
      where: { userId_universityId: { userId: actorId, universityId } },
      include: { user: true },
    });
    if (
      !staff?.user.active ||
      staff.role !== "STAFF" ||
      staff.status !== "APPROVED"
    )
      throw new Denied();
    const r = await tx.enrollmentRequest.findUnique({
      where: { id: requestId },
      include: { membership: true },
    });
    if (
      !r ||
      r.membership.universityId !== universityId ||
      r.membership.role !== "STUDENT" ||
      r.membership.status !== "PENDING"
    )
      throw new Denied();
    await validGroup(tx, r.targetGroupId, universityId, status === "APPROVED");
    const claimed = await tx.enrollmentRequest.updateMany({
      where: { id: r.id, status: "PENDING" },
      data: { status, reason, decidedBy: actorId, decidedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Denied(409);
    await tx.universityMembership.update({
      where: { id: r.membershipId },
      data: { status },
    });
    if (status === "APPROVED")
      await tx.groupMembership.create({
        data: {
          membershipId: r.membershipId,
          groupId: r.targetGroupId,
          sourceId: r.id,
        },
      });
    await tx.auditLog.create({
      data: {
        actorId,
        universityId,
        targetId: r.id,
        action: status,
        reason,
        newGroupId: r.targetGroupId,
      },
    });
  });
}
