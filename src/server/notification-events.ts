import type { Prisma } from "../generated/prisma/client";
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
