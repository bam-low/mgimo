import type { Prisma } from "../generated/prisma/client";
import { Denied } from "./errors";
import {
  applicationNotificationKind,
  type NotificationKind,
} from "@/lib/notifications";
/** Must be called inside the domain transaction: failures roll everything back. */
async function save(
  tx: Prisma.TransactionClient,
  actorId: string,
  data: {
    universityId: string;
    recipientMembershipId: string;
    kind: NotificationKind;
    sourceKey: string;
    enrollmentRequestId?: string;
    applicationId?: string;
    applicationEventId?: string;
    cancellationId?: string;
  },
) {
  const n = await tx.notification.create({ data });
  await tx.auditLog.create({
    data: {
      actorId,
      universityId: data.universityId,
      targetId: n.id,
      action: "NOTIFICATION_CREATED",
    },
  });
}

export async function notifyCancellation(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  entry: {
    id: string;
    version: number;
    title: string;
    startsAt: Date;
    endsAt: Date;
  },
  groupIds: string[],
) {
  const cancellationId = `${entry.id}:${entry.version}`;
  const students = await tx.universityMembership.findMany({
    where: {
      universityId,
      role: "STUDENT",
      status: "APPROVED",
      user: { active: true },
      enrollments: {
        some: {
          groupId: { in: groupIds },
          endedAt: null,
          revokedAt: null,
          group: {
            active: true,
            program: { active: true, faculty: { universityId, active: true } },
          },
        },
      },
    },
    select: { id: true },
  });
  if (students.length) {
    // Enrollment/grade writes lock membership before the university. Never wait
    // for those rows while holding the university lock: a concurrent transfer
    // must yield an explicit retry, not a FK-lock deadlock or partial delivery.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "UniversityMembership"
      WHERE "universityId"=${universityId} AND "id"=ANY(${students.map((s) => s.id)}::text[])
      ORDER BY "id" FOR KEY SHARE SKIP LOCKED`;
    if (locked.length !== students.length) {
      const error = new Denied(409);
      error.message =
        "Данные студентов сейчас изменяются. Отмена не выполнена. Повторите действие после обновления.";
      throw error;
    }
  }
  await tx.scheduleCancellation.create({
    data: {
      id: cancellationId,
      universityId,
      entryId: entry.id,
      entryVersion: entry.version,
      title: entry.title,
      startsAt: entry.startsAt,
      endsAt: entry.endsAt,
      groupIds,
    },
  });
  for (const student of students)
    await save(tx, actorId, {
      universityId,
      recipientMembershipId: student.id,
      kind: "SCHEDULE_CANCELLED",
      cancellationId,
      sourceKey: `cancellation:${cancellationId}`,
    });
}
export async function notifyEnrollment(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  membershipId: string,
  requestId: string,
  status: "APPROVED" | "REJECTED",
) {
  await save(tx, actorId, {
    universityId,
    recipientMembershipId: membershipId,
    enrollmentRequestId: requestId,
    kind: status === "APPROVED" ? "ENROLLMENT_APPROVED" : "ENROLLMENT_REJECTED",
    sourceKey: `enrollment:${requestId}:decision`,
  });
}
export async function notifyApplication(
  tx: Prisma.TransactionClient,
  actorId: string,
  universityId: string,
  applicationId: string,
  eventId: string,
  type: string,
) {
  if (
    ![
      "APPLICATION_TAKEN",
      "APPLICATION_COMPLETED",
      "APPLICATION_REJECTED",
      "DOCUMENT_REPLACED",
    ].includes(type)
  )
    return;
  const app = await tx.application.findFirstOrThrow({
    where: { id: applicationId, universityId },
    select: { membershipId: true, kind: true, status: true },
  });
  const kind = applicationNotificationKind(type, app.kind, app.status);
  if (kind)
    await save(tx, actorId, {
      universityId,
      recipientMembershipId: app.membershipId,
      applicationId,
      applicationEventId: eventId,
      kind,
      sourceKey: `application:${eventId}`,
    });
}
