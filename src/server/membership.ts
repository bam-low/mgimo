import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { Denied } from "./security";
import { validGroup, lockMembership, requireStaff } from "./enrollment-guards";

const id = z.string().min(1).max(100);
const reason = z.string().trim().min(1).max(500);
export const membershipAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("TRANSFER"),
      membershipId: id,
      expectedEnrollmentId: id,
      groupId: id,
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("REVOKE"),
      membershipId: id,
      expectedEnrollmentId: id,
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal("ALLOW_RESUBMISSION"),
      membershipId: id,
      reason,
    })
    .strict(),
]);

export async function changeMembership(
  actorId: string,
  universityId: string,
  input: unknown,
) {
  const d = membershipAction.parse(input);
  await db.$transaction(async (tx) => {
    await lockMembership(tx, d.membershipId, universityId);
    await requireStaff(tx, actorId, universityId);
    const m = await tx.universityMembership.findUniqueOrThrow({
      where: { id: d.membershipId },
      include: {
        enrollments: { where: { endedAt: null, revokedAt: null } },
      },
    });
    if (m.role !== "STUDENT" || m.status !== "APPROVED") throw new Denied();
    const current = m.enrollments[0];
    const now = new Date();
    const auditId = randomUUID();
    if (d.action === "ALLOW_RESUBMISSION") {
      const revoked = await tx.groupMembership.findFirst({
        where: { membershipId: m.id, revokedAt: { not: null } },
        select: { id: true },
      });
      if (!revoked || m.enrollments.length || m.resubmissionAllowed)
        throw new Denied(409);
      await tx.universityMembership.update({
        where: { id: m.id },
        data: { resubmissionAllowed: true },
      });
    } else {
      if (m.enrollments.length !== 1 || current.id !== d.expectedEnrollmentId)
        throw new Denied(409);
      await validGroup(tx, current.groupId, universityId, false);
      if (d.action === "TRANSFER") {
        if (d.groupId === current.groupId) throw new Denied(409);
        await validGroup(tx, d.groupId, universityId);
      }
      await tx.groupMembership.update({
        where: { id: current.id },
        data: {
          endedAt: now,
          ...(d.action === "REVOKE" ? { revokedAt: now } : {}),
        },
      });
      await tx.universityMembership.update({
        where: { id: m.id },
        data: { resubmissionAllowed: false },
      });
      if (d.action === "TRANSFER")
        await tx.groupMembership.create({
          data: {
            membershipId: m.id,
            groupId: d.groupId,
            sourceId: auditId,
            startedAt: now,
          },
        });
    }
    await tx.auditLog.create({
      data: {
        id: auditId,
        actorId,
        universityId,
        targetId: m.id,
        reason: d.reason,
        action:
          d.action === "TRANSFER"
            ? "TRANSFERRED"
            : d.action === "REVOKE"
              ? "REVOKED"
              : "RESUBMISSION_ALLOWED",
        oldGroupId: current?.groupId,
        newGroupId: d.action === "TRANSFER" ? d.groupId : undefined,
        createdAt: now,
      },
    });
  });
}
