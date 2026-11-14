import { notifyApplication } from "./notification-events";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client";
import { db } from "./db";
import { actor, staff, studentAccess, Denied } from "./security";
import {
  lockMembership,
  lockUniversity,
  requireStaff,
  validGroup,
} from "./enrollment-guards";
import {
  applicationCreate,
  applicationAction,
  documentMetadata,
  allowedAction,
  applicationKinds,
  applicationStatuses,
  documentName,
  MEMBER_QUOTA,
  UNIVERSITY_QUOTA,
  MAX_DOCUMENT,
} from "@/lib/applications";
import { civil } from "@/lib/semester";
import { addDays, localInstant } from "@/lib/schedule-time";
import { fileError } from "./application-files";
export type ApplicationActor = Awaited<ReturnType<typeof actor>>;
const uuid = z.uuid();
export const docSelect = {
  id: true,
  revision: true,
  mediaType: true,
  byteSize: true,
  sha256: true,
  createdAt: true,
  replacementReason: true,
} satisfies Prisma.ApplicationDocumentSelect;
const appSelect = {
  id: true,
  kind: true,
  status: true,
  subject: true,
  description: true,
  purpose: true,
  submittedGroupName: true,
  responseText: true,
  takenAt: true,
  resolvedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  currentDocumentId: true,
  currentDocument: { select: docSelect },
} satisfies Prisma.ApplicationSelect;
function error(message: string, status = 409): never {
  return fileError(message, status);
}
async function freshSession(tx: Prisma.TransactionClient, a: ApplicationActor) {
  const session = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Session" WHERE "id"=${a.sessionId} AND "userId"=${a.user.id} AND "expiresAt">clock_timestamp() FOR KEY SHARE`;
  if (session.length !== 1) throw new Denied(401);
  const m = await tx.universityMembership.findFirst({
    where: {
      id: a.membership.id,
      userId: a.user.id,
      universityId: a.membership.universityId,
      user: { active: true },
      university: { active: true },
    },
  });
  if (!m || m.role !== a.membership.role || m.status !== "APPROVED")
    throw new Denied();
}
async function eligible(tx: Prisma.TransactionClient, id: string, uni: string) {
  const m = await tx.universityMembership.findFirst({
    where: {
      id,
      universityId: uni,
      role: "STUDENT",
      status: "APPROVED",
      user: { active: true },
      university: { active: true },
    },
    include: { enrollments: { where: { endedAt: null, revokedAt: null } } },
  });
  if (!m || m.enrollments.length !== 1) throw new Denied();
  return validGroup(tx, m.enrollments[0].groupId, uni);
}
async function audit(
  tx: Prisma.TransactionClient,
  a: ApplicationActor,
  targetId: string,
  action: string,
  details: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorId: a.user.id,
      universityId: a.membership.universityId,
      targetId,
      action,
      reason: JSON.stringify(details),
    },
  });
}
async function event(
  tx: Prisma.TransactionClient,
  a: ApplicationActor,
  app: { id: string; status: string; version: number },
  operationId: string,
  type: string,
  after: { status: string; version: number },
  publicText?: string,
  documentId?: string,
) {
  await tx.applicationEvent.create({
    data: {
      id: operationId,
      applicationId: app.id,
      universityId: a.membership.universityId,
      actorId: a.user.id,
      eventType: type,
      fromStatus: type === "APPLICATION_SUBMITTED" ? null : app.status,
      toStatus: after.status,
      applicationVersion: after.version,
      publicText,
      documentId,
    },
  });
  await notifyApplication(
    tx,
    a.user.id,
    a.membership.universityId,
    app.id,
    operationId,
    type,
  );
}
async function operationUnused(tx: Prisma.TransactionClient, id: string) {
  if (
    await tx.applicationEvent.findUnique({
      where: { id },
      select: { id: true },
    })
  )
    error(
      "Операция уже выполнена. Обновите карточку, чтобы проверить результат.",
    );
}
async function lockedApplication(
  tx: Prisma.TransactionClient,
  a: ApplicationActor,
  id: string,
  write = false,
) {
  const uni = a.membership.universityId;
  // Membership lock order is the same as transfer/revoke, before university/app.
  const identity = await tx.application.findFirst({
    where: {
      id,
      universityId: uni,
      ...(a.membership.role === "STAFF"
        ? {}
        : { membershipId: a.membership.id }),
    },
    select: { membershipId: true },
  });
  if (!identity) throw new Denied(404);
  await lockMembership(tx, identity.membershipId, uni);
  await lockUniversity(tx, uni);
  await freshSession(tx, a);
  if (a.membership.role === "STAFF") await requireStaff(tx, a.user.id, uni);
  else await eligible(tx, a.membership.id, uni);
  if (write)
    await tx.$queryRaw`SELECT "id" FROM "Application" WHERE "id"=${id} AND "universityId"=${uni} FOR UPDATE`;
  return tx.application.findFirstOrThrow({ where: { id, universityId: uni } });
}
export async function createApplication(a: ApplicationActor, raw: unknown) {
  studentAccess(a);
  const d = applicationCreate.parse(raw),
    uni = a.membership.universityId;
  return db.$transaction(async (tx) => {
    await lockMembership(tx, a.membership.id, uni);
    await lockUniversity(tx, uni);
    await freshSession(tx, a);
    const group = await eligible(tx, a.membership.id, uni);
    await operationUnused(tx, d.operationId);
    if (
      (await tx.application.count({
        where: {
          membershipId: a.membership.id,
          status: { in: ["SUBMITTED", "IN_PROGRESS"] },
        },
      })) >= 10
    )
      error("У вас уже десять открытых заявок. Дождитесь обработки.");
    const app = await tx.application.create({
      data: {
        id: d.operationId,
        universityId: uni,
        membershipId: a.membership.id,
        submittedGroupId: group.id,
        submittedGroupName: `${group.program.faculty.name} / ${group.program.name} / ${group.name}`,
        kind: d.kind,
        subject:
          d.kind === "GENERAL_REQUEST"
            ? d.subject
            : "Демонстрационная справка об обучении",
        description: d.description || null,
        purpose: d.kind === "STUDY_CERTIFICATE" ? d.purpose : null,
      },
    });
    await event(tx, a, app, d.operationId, "APPLICATION_SUBMITTED", app);
    await audit(tx, a, app.id, "APPLICATION_SUBMITTED", {
      after: {
        kind: app.kind,
        status: app.status,
        version: app.version,
        membershipId: app.membershipId,
      },
    });
    return { id: app.id, version: app.version };
  });
}
export async function actOnApplication(
  a: ApplicationActor,
  id: string,
  raw: unknown,
) {
  staff(a);
  uuid.parse(id);
  const d = applicationAction.parse(raw);
  return db.$transaction(async (tx) => {
    const old = await lockedApplication(tx, a, id, true);
    await operationUnused(tx, d.operationId);
    if (old.version !== d.expectedVersion)
      error("Заявка изменена. Обновите карточку; введённый ответ сохранён.");
    if (!allowedAction(old.status, d.action))
      error("Этот переход статуса недоступен. Обновите карточку.");
    if (d.action !== "REJECT")
      await eligible(tx, old.membershipId, old.universityId);
    if (d.action === "COMPLETE" && old.kind === "STUDY_CERTIFICATE") {
      const doc = old.currentDocumentId
        ? await tx.applicationDocument.findFirst({
            where: {
              id: old.currentDocumentId,
              applicationId: old.id,
              universityId: old.universityId,
            },
            select: { byteSize: true, content: true },
          })
        : null;
      if (!doc || !doc.content.length || doc.content.length !== doc.byteSize)
        error("Сначала загрузите и сохраните демонстрационную справку.");
    }
    const status =
      d.action === "TAKE"
        ? "IN_PROGRESS"
        : d.action === "COMPLETE"
          ? "COMPLETED"
          : d.action === "REJECT"
            ? "REJECTED"
            : old.status;
    const next = await tx.application.update({
      where: { id },
      data: {
        status,
        version: { increment: 1 },
        ...(d.action === "TAKE"
          ? { takenById: a.user.id, takenAt: new Date() }
          : {}),
        ...(["COMPLETE", "REJECT"].includes(d.action)
          ? {
              responseText: (d as { text: string }).text,
              resolvedById: a.user.id,
              resolvedAt: new Date(),
            }
          : {}),
      },
    });
    const type =
      d.action === "TAKE"
        ? "APPLICATION_TAKEN"
        : d.action === "COMMENT"
          ? "APPLICATION_COMMENTED"
          : d.action === "COMPLETE"
            ? "APPLICATION_COMPLETED"
            : "APPLICATION_REJECTED";
    await event(
      tx,
      a,
      old,
      d.operationId,
      type,
      next,
      "text" in d ? d.text : undefined,
      d.action === "COMPLETE" && old.kind === "STUDY_CERTIFICATE"
        ? (next.currentDocumentId ?? undefined)
        : undefined,
    );
    await audit(tx, a, id, type, {
      before: {
        status: old.status,
        version: old.version,
        responseText: old.responseText,
      },
      after: {
        status: next.status,
        version: next.version,
        responseText: next.responseText,
      },
      ...(d.action === "COMMENT" ? { text: d.text } : {}),
    });
    return { id, version: next.version };
  });
}
export async function uploadPreflight(a: ApplicationActor, id: string) {
  staff(a);
  uuid.parse(id);
  await db.$transaction(async (tx) => {
    const app = await lockedApplication(tx, a, id);
    if (
      app.kind !== "STUDY_CERTIFICATE" ||
      !["IN_PROGRESS", "COMPLETED"].includes(app.status)
    )
      error("Прикрепить справку можно после принятия заказа в работу.");
    await eligible(tx, app.membershipId, app.universityId);
  });
}
export async function saveApplicationDocument(
  a: ApplicationActor,
  id: string,
  metadata: unknown,
  file: { content: Uint8Array; sha256: string; mime: string },
) {
  staff(a);
  uuid.parse(id);
  const d = documentMetadata.parse(metadata);
  if (
    file.sha256 !== createHash("sha256").update(file.content).digest("hex") ||
    !file.content.length ||
    file.content.length > MAX_DOCUMENT ||
    !/^[a-f0-9]{64}$/.test(file.sha256) ||
    !["application/pdf", "image/jpeg", "image/png"].includes(file.mime)
  )
    throw new Denied(400);
  return db.$transaction(
    async (tx) => {
      const app = await lockedApplication(tx, a, id, true);
      await operationUnused(tx, d.operationId);
      await eligible(tx, app.membershipId, app.universityId);
      if (
        app.kind !== "STUDY_CERTIFICATE" ||
        !["IN_PROGRESS", "COMPLETED"].includes(app.status)
      )
        error("Документ нельзя сохранить в текущем состоянии заявки.");
      if (
        app.version !== d.expectedVersion ||
        app.currentDocumentId !== d.expectedCurrentDocumentId
      )
        error("Заявка или документ изменены. Обновите карточку перед заменой.");
      if (app.currentDocumentId && !d.reason)
        error("Укажите причину замены (10–500 символов).", 400);
      if (!app.currentDocumentId && d.reason)
        error(
          "Причина замены применяется только к существующему документу.",
          400,
        );
      const n = await tx.applicationDocument.count({
        where: { applicationId: id },
      });
      if (n >= 5)
        error(
          "Сохранено пять версий. Новую версию добавить нельзя; история сохранена.",
        );
      const [member, university] = await Promise.all([
        tx.applicationDocument.aggregate({
          where: {
            application: { membershipId: app.membershipId },
            universityId: app.universityId,
          },
          _sum: { byteSize: true },
        }),
        tx.applicationDocument.aggregate({
          where: { universityId: app.universityId },
          _sum: { byteSize: true },
        }),
      ]);
      if (
        (member._sum.byteSize ?? 0) + file.content.length > MEMBER_QUOTA ||
        (university._sum.byteSize ?? 0) + file.content.length > UNIVERSITY_QUOTA
      )
        error(
          "Квота хранения исчерпана. Учтены все сохранённые версии; прежние файлы сохранены.",
        );
      const doc = await tx.applicationDocument.create({
        data: {
          id: d.operationId,
          applicationId: id,
          universityId: app.universityId,
          revision: n + 1,
          mediaType: file.mime,
          byteSize: file.content.length,
          sha256: file.sha256,
          content: new Uint8Array(file.content),
          uploadedById: a.user.id,
          replacesDocumentId: app.currentDocumentId,
          replacementReason: d.reason,
          demoConfirmed: true,
        },
        select: docSelect,
      });
      const next = await tx.application.update({
        where: { id },
        data: { currentDocumentId: doc.id, version: { increment: 1 } },
      });
      const type = app.currentDocumentId
        ? "DOCUMENT_REPLACED"
        : "DOCUMENT_UPLOADED";
      await event(tx, a, app, d.operationId, type, next, d.reason, doc.id);
      await audit(tx, a, id, type, {
        before: { documentId: app.currentDocumentId, version: app.version },
        after: {
          documentId: doc.id,
          revision: doc.revision,
          byteSize: doc.byteSize,
          sha256: doc.sha256,
          mediaType: doc.mediaType,
          version: next.version,
          demoConfirmed: true,
        },
        reason: d.reason ?? null,
      });
      return { id, version: next.version, document: doc };
    },
    { timeout: 15000 },
  );
}
const listQuery = z
  .object({
    kind: z.enum(applicationKinds).optional(),
    status: z.enum(applicationStatuses).optional(),
    from: civil.optional(),
    to: civil.optional(),
    cursor: uuid.optional(),
  })
  .strict();
export async function listApplications(a: ApplicationActor, raw: unknown = {}) {
  const q = listQuery.parse(raw),
    isStaff = a.membership.role === "STAFF",
    uni = a.membership.universityId;
  if (isStaff) staff(a);
  else {
    studentAccess(a);
    if (q.from || q.to) throw new Denied(400);
  }
  if (q.from && q.to && q.from > q.to)
    error("Начало диапазона позже окончания.", 400);
  const zone = a.membership.university.timezone;
  let range: { gte?: Date; lt?: Date } | undefined;
  try {
    range =
      q.from || q.to
        ? {
            ...(q.from ? { gte: localInstant(q.from, "00:00", zone) } : {}),
            ...(q.to
              ? { lt: localInstant(addDays(q.to, 1), "00:00", zone) }
              : {}),
          }
        : undefined;
  } catch {
    throw new Denied(400);
  }
  const where: Prisma.ApplicationWhereInput = {
    universityId: uni,
    ...(!isStaff ? { membershipId: a.membership.id } : {}),
    kind: q.kind,
    status: q.status,
    createdAt: range,
  };
  if (
    q.cursor &&
    !(await db.application.findFirst({
      where: { ...where, id: q.cursor },
      select: { id: true },
    }))
  )
    throw new Denied(404);
  const rows = await db.application.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    take: 26,
    select: {
      ...appSelect,
      ...(isStaff
        ? {
            membership: {
              select: {
                profile: { select: { firstName: true, lastName: true } },
              },
            },
          }
        : {}),
    },
  });
  const hasNext = rows.length > 25;
  return {
    rows: rows
      .slice(0, 25)
      .map((r) => ({
        ...r,
        currentDocument:
          isStaff || r.status === "COMPLETED" ? r.currentDocument : null,
        currentDocumentId:
          isStaff || r.status === "COMPLETED" ? r.currentDocumentId : null,
      })),
    next: hasNext ? rows[24].id : null,
    timezone: zone,
  };
}
export async function applicationDetail(
  a: ApplicationActor,
  id: string,
  raw: unknown = {},
) {
  uuid.parse(id);
  const q = z
      .object({ eventCursor: uuid.optional(), documentCursor: uuid.optional() })
      .strict()
      .parse(raw),
    isStaff = a.membership.role === "STAFF";
  if (isStaff) staff(a);
  else {
    studentAccess(a);
    if (q.documentCursor) throw new Denied();
  }
  return db.$transaction(async (tx) => {
    const app = await lockedApplication(tx, a, id);
    const display = await tx.application.findUniqueOrThrow({
      where: { id },
      select: appSelect,
    });
    let applicant: {
      name: string;
      status: string;
      currentGroups: string[];
      eligible: boolean;
    } | null = null;
    if (isStaff) {
      const m = await tx.universityMembership.findUniqueOrThrow({
        where: { id: app.membershipId },
        select: {
          profile: { select: { firstName: true, lastName: true } },
          status: true,
          role: true,
          user: { select: { active: true } },
          enrollments: {
            where: { endedAt: null, revokedAt: null },
            select: {
              group: {
                select: {
                  name: true,
                  active: true,
                  program: {
                    select: {
                      active: true,
                      faculty: { select: { active: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      applicant = {
        name: m.profile
          ? `${m.profile.lastName} ${m.profile.firstName}`
          : "Демо студент",
        status: m.status,
        currentGroups: m.enrollments.map((e) => e.group.name),
        eligible:
          m.user.active &&
          m.role === "STUDENT" &&
          m.status === "APPROVED" &&
          m.enrollments.length === 1 &&
          m.enrollments[0].group.active &&
          m.enrollments[0].group.program.active &&
          m.enrollments[0].group.program.faculty.active,
      };
    }
    const eventWhere: Prisma.ApplicationEventWhereInput = {
      applicationId: id,
      universityId: app.universityId,
      ...(!isStaff
        ? {
            OR: [
              {
                eventType: {
                  notIn: ["DOCUMENT_UPLOADED", "DOCUMENT_REPLACED"],
                },
              },
              ...(app.status === "COMPLETED"
                ? [
                    {
                      eventType: "DOCUMENT_REPLACED",
                      documentId: app.currentDocumentId,
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };
    if (
      q.eventCursor &&
      !(await tx.applicationEvent.findFirst({
        where: { ...eventWhere, id: q.eventCursor },
        select: { id: true },
      }))
    )
      throw new Denied(404);
    const events = await tx.applicationEvent.findMany({
      where: eventWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 26,
      ...(q.eventCursor ? { cursor: { id: q.eventCursor }, skip: 1 } : {}),
      select: {
        id: true,
        eventType: true,
        createdAt: true,
        fromStatus: true,
        toStatus: true,
        publicText: true,
        applicationVersion: true,
      },
    });
    if (
      q.documentCursor &&
      !(await tx.applicationDocument.findFirst({
        where: {
          id: q.documentCursor,
          applicationId: id,
          universityId: app.universityId,
        },
        select: { id: true },
      }))
    )
      throw new Denied(404);
    const documents = isStaff
      ? await tx.applicationDocument.findMany({
          where: { applicationId: id, universityId: app.universityId },
          select: docSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 26,
          ...(q.documentCursor
            ? { cursor: { id: q.documentCursor }, skip: 1 }
            : {}),
        })
      : [];
    return {
      ...display,
      currentDocument:
        isStaff || app.status === "COMPLETED" ? display.currentDocument : null,
      currentDocumentId:
        isStaff || app.status === "COMPLETED"
          ? display.currentDocumentId
          : null,
      applicant,
      events: events.slice(0, 25),
      nextEvent: events.length > 25 ? events[24].id : null,
      documents: documents.slice(0, 25),
      nextDocument: documents.length > 25 ? documents[24].id : null,
      timezone: a.membership.university.timezone,
    };
  });
}
export async function downloadApplicationDocument(
  a: ApplicationActor,
  id: string,
  documentId?: string,
) {
  uuid.parse(id);
  const isStaff = a.membership.role === "STAFF";
  if (isStaff) staff(a);
  else studentAccess(a);
  if (documentId) uuid.parse(documentId);
  return db.$transaction(async (tx) => {
    const app = await lockedApplication(tx, a, id);
    if (
      !isStaff &&
      (app.status !== "COMPLETED" || !app.currentDocumentId || documentId)
    )
      throw new Denied(404);
    const did = isStaff ? documentId : app.currentDocumentId;
    if (!did) throw new Denied(404);
    const doc = await tx.applicationDocument.findFirst({
      where: { id: did, applicationId: id, universityId: app.universityId },
      select: { ...docSelect, content: true },
    });
    if (!doc) throw new Denied(404);
    await audit(tx, a, id, "DOCUMENT_DOWNLOAD_AUTHORIZED", {
      documentId: doc.id,
      revision: doc.revision,
      byteSize: doc.byteSize,
      sha256: doc.sha256,
      actorRole: a.membership.role,
    });
    return {
      content: doc.content,
      headers: {
        "Content-Type": doc.mediaType,
        "Content-Disposition": `attachment; filename="${documentName(doc.id, doc.revision, doc.mediaType)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Accept-Ranges": "none",
      },
    };
  });
}
