import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor } from "../src/server/security";
import { decide } from "../src/server/enrollment";
import { changeMembership } from "../src/server/membership";
import {
  createApplication,
  actOnApplication,
  saveApplicationDocument,
  downloadApplicationDocument,
} from "../src/server/applications";
import { validateFile } from "../src/server/application-files";
import {
  listNotifications,
  notificationDetail,
  notificationCount,
  readNotification,
} from "../src/server/notifications";
import { notificationHTTP } from "../src/server/notification-http";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Требуется изолированная тестовая БД");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
type A = Awaited<ReturnType<typeof actor>>;
let student: A, staff: A, other: A, foreign: A, h: Headers;
async function fixture(role = "STUDENT", universityId = uni, pending = false) {
  const id = randomUUID(),
    password = randomUUID() + randomUUID(),
    email = id + "@example.test";
  await db.user.create({
    data: {
      id,
      name: "Демо уведомления",
      email,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
      memberships: {
        create: {
          universityId,
          role,
          status: pending ? "PENDING" : "APPROVED",
          ...(role === "STUDENT" && !pending
            ? {
                enrollments: {
                  create: { groupId: "group-1", sourceId: randomUUID() },
                },
              }
            : {}),
        },
      },
    },
  });
  const r = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(r.status).toBe(200);
  const headers = new Headers({
    origin,
    "content-type": "application/json",
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  return { a: await actor(headers), h: headers };
}
async function create(a = student, kind = "GENERAL_REQUEST") {
  return createApplication(a, {
    kind,
    operationId: randomUUID(),
    ...(kind === "GENERAL_REQUEST"
      ? {
          subject: "Демонстрационное обращение",
          description: "Вымышленный вопрос для проверки уведомлений",
        }
      : { purpose: "Демонстрационное предъявление", description: "" }),
  });
}
async function act(id: string, action: string, text?: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  return actOnApplication(staff, id, {
    action,
    operationId: randomUUID(),
    expectedVersion: app.version,
    ...(text ? { text } : {}),
  });
}
async function notice(applicationId: string) {
  return db.notification.findFirstOrThrow({
    where: { applicationId },
    orderBy: { createdAt: "desc" },
  });
}
async function upload(id: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  return saveApplicationDocument(
    staff,
    id,
    {
      operationId: randomUUID(),
      expectedVersion: app.version,
      expectedCurrentDocumentId: app.currentDocumentId,
      demoConfirmed: true,
      ...(app.currentDocumentId
        ? { reason: "Демонстрационная замена версии" }
        : {}),
    },
    await validateFile(
      await readFile("demo/documents/demo-certificate.pdf"),
      "application/pdf",
    ),
  );
}
beforeAll(async () => {
  ({ a: student, h } = await fixture());
  ({ a: staff } = await fixture("STAFF"));
  ({ a: other } = await fixture());
  const universityId = randomUUID();
  await db.university.create({
    data: {
      id: universityId,
      name: "Другой вымышленный вуз",
      timezone: "Europe/Moscow",
    },
  });
  ({ a: foreign } = await fixture("STUDENT", universityId, true));
});
afterAll(() => db.$disconnect());
it("решения прикрепления атомарны; отказ виден без учебного доступа, старый запрос не ведёт к новому", async () => {
  const { a } = await fixture("STUDENT", uni, true),
    req = await db.enrollmentRequest.create({
      data: { membershipId: a.membership.id, targetGroupId: "group-1" },
    });
  await decide(
    staff.user.id,
    uni,
    req.id,
    "REJECTED",
    "Вымышленный мотивированный отказ",
  );
  const rows = (await listNotifications(a)).items;
  expect(rows).toHaveLength(1);
  expect(rows[0].kind).toBe("ENROLLMENT_REJECTED");
  expect(rows[0].target).toEqual({ available: true, href: "/cabinet" });
  await expect(
    decide(staff.user.id, uni, req.id, "APPROVED", "Повтор"),
  ).rejects.toBeDefined();
  expect((await listNotifications(a)).items).toHaveLength(1);
  await db.enrollmentRequest.create({
    data: {
      membershipId: a.membership.id,
      targetGroupId: "group-1",
      createdAt: new Date(Date.now() + 1000),
    },
  });
  expect((await notificationDetail(a, rows[0].id)).notification.target).toEqual(
    { available: false, reasonCode: "PREVIOUS_ENROLLMENT" },
  );
  const pending = await fixture("STUDENT", uni, true),
    request = await db.enrollmentRequest.create({
      data: { membershipId: pending.a.membership.id, targetGroupId: "group-1" },
    });
  const outcomes = await Promise.allSettled([
    decide(staff.user.id, uni, request.id, "APPROVED", "Демо"),
    decide(staff.user.id, uni, request.id, "REJECTED", "Демо"),
  ]);
  expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.notification.count({ where: { enrollmentRequestId: request.id } }),
  ).toBe(1);
});
it("идемпотентное конкурентное прочтение, scoped list/detail/count/cursor и CSRF", async () => {
  const app = await create();
  await act(app.id, "TAKE");
  const n = await notice(app.id),
    before = (await notificationCount(student)).count;
  const results = await Promise.all(
    Array.from({ length: 6 }, () => readNotification(student, n.id, {})),
  );
  expect(new Set(results.map((r) => r.readAt?.toISOString())).size).toBe(1);
  expect(
    await db.auditLog.count({
      where: { targetId: n.id, action: "NOTIFICATION_READ" },
    }),
  ).toBe(1);
  expect((await notificationCount(student)).count).toBe(before - 1);
  for (const a of [other, foreign]) {
    await expect(notificationDetail(a, n.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(readNotification(a, n.id, {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(listNotifications(a, { cursor: n.id })).rejects.toMatchObject({
      status: 404,
    });
    expect((await notificationCount(a)).count).toBe(0);
  }
  await expect(listNotifications(staff)).rejects.toMatchObject({ status: 403 });
  const bad = new Headers(h);
  bad.set("origin", "https://foreign.invalid");
  expect(
    (
      await notificationHTTP(
        new Request(origin + "/api/notifications/" + n.id + "/read", {
          method: "POST",
          headers: bad,
          body: "{}",
        }),
        "read",
        n.id,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await notificationHTTP(
        new Request(origin + "/api/notifications", { headers: h }),
        "list",
      )
    ).headers.get("cache-control"),
  ).toBe("private, no-store");
  await expect(
    readNotification(student, n.id, { readAt: "2000-01-01" }),
  ).rejects.toBeDefined();
  expect(
    (await listNotifications(student, { filter: "unread" })).items.some(
      (x) => x.id === n.id,
    ),
  ).toBe(false);
  await expect(
    db.notification.update({ where: { id: n.id }, data: { readAt: null } }),
  ).rejects.toBeDefined();
  await expect(
    db.notification.update({
      where: { id: n.id },
      data: { kind: "APPLICATION_COMPLETED" },
    }),
  ).rejects.toBeDefined();
  await expect(
    db.notification.delete({ where: { id: n.id } }),
  ).rejects.toBeDefined();
});
it("готовность только после файла и COMPLETE; замена готового документа даёт одно новое сообщение", async () => {
  const app = await create(student, "STUDY_CERTIFICATE");
  expect(
    await db.notification.count({ where: { applicationId: app.id } }),
  ).toBe(0);
  await act(app.id, "TAKE");
  await expect(act(app.id, "COMPLETE", "Демо готово")).rejects.toBeDefined();
  await upload(app.id);
  expect(
    await db.notification.count({ where: { applicationId: app.id } }),
  ).toBe(1);
  await act(app.id, "COMMENT", "Вымышленный комментарий");
  expect(
    await db.notification.count({ where: { applicationId: app.id } }),
  ).toBe(1);
  await act(app.id, "COMPLETE", "Демонстрационный документ готов");
  const ready = await notice(app.id);
  expect(ready.kind).toBe("CERTIFICATE_READY");
  await upload(app.id);
  expect(
    await db.notification.count({ where: { applicationId: app.id } }),
  ).toBe(3);
  expect((await notice(app.id)).kind).toBe("CERTIFICATE_UPDATED");
  expect(
    (await notificationDetail(student, ready.id)).notification.notice,
  ).toContain("текущая");
  const content = await downloadApplicationDocument(student, app.id);
  expect(content.content.length).toBeGreaterThan(100);
});
it("ошибка записи Notification и её аудита откатывает domain/event/версию", async () => {
  for (const audit of [false, true]) {
    const app = await create();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION notification_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${audit ? "IF NEW.action='NOTIFICATION_CREATED' THEN" : ""} RAISE EXCEPTION 'notification test'; ${audit ? "END IF; RETURN NEW;" : ""} END $$`,
    );
    const table = audit ? "AuditLog" : "Notification";
    await db.$executeRawUnsafe(
      `CREATE TRIGGER notification_failure_probe BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION notification_failure_probe()`,
    );
    try {
      await expect(act(app.id, "TAKE")).rejects.toBeDefined();
      expect(
        (await db.application.findUniqueOrThrow({ where: { id: app.id } }))
          .status,
      ).toBe("SUBMITTED");
      expect(
        await db.applicationEvent.count({ where: { applicationId: app.id } }),
      ).toBe(1);
      expect(
        await db.notification.count({ where: { applicationId: app.id } }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER notification_failure_probe ON "${table}"`,
      );
      await db.$executeRawUnsafe("DROP FUNCTION notification_failure_probe()");
    }
  }
});
it("ошибка уведомления откатывает одобрение/группу; отказ аудита откатывает прочтение", async () => {
  const pending = await fixture("STUDENT", uni, true),
    req = await db.enrollmentRequest.create({
      data: { membershipId: pending.a.membership.id, targetGroupId: "group-1" },
    });
  const readApp = await create();
  await act(readApp.id, "TAKE");
  await db.$executeRawUnsafe(
    "CREATE FUNCTION notification_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('NOTIFICATION_CREATED','NOTIFICATION_READ') THEN RAISE EXCEPTION 'notification test'; END IF; RETURN NEW; END $$",
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER notification_failure_probe BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION notification_failure_probe()',
  );
  try {
    await expect(
      decide(staff.user.id, uni, req.id, "APPROVED", "Демо"),
    ).rejects.toBeDefined();
    expect(
      (await db.enrollmentRequest.findUniqueOrThrow({ where: { id: req.id } }))
        .status,
    ).toBe("PENDING");
    expect(
      await db.groupMembership.count({
        where: { membershipId: pending.a.membership.id },
      }),
    ).toBe(0);
    const n = await db.notification.findFirstOrThrow({
      where: { recipientMembershipId: student.membership.id, readAt: null },
    });
    await expect(readNotification(student, n.id, {})).rejects.toBeDefined();
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt,
    ).toBeNull();
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER notification_failure_probe ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION notification_failure_probe()");
  }
});
it("перевод/отзыв сохраняют общую ленту и прочтение, закрывая заявки/файлы; старый Actor не обходит guard", async () => {
  const { a } = await fixture(),
    app = await create(a, "STUDY_CERTIFICATE");
  await act(app.id, "TAKE");
  await upload(app.id);
  await act(app.id, "COMPLETE", "Демо готово");
  const n = await notice(app.id);
  await readNotification(a, n.id, {});
  let gm = await db.groupMembership.findFirstOrThrow({
    where: { membershipId: a.membership.id, endedAt: null },
  });
  await changeMembership(staff.user.id, uni, {
    action: "TRANSFER",
    membershipId: a.membership.id,
    expectedEnrollmentId: gm.id,
    groupId: "group-2",
    reason: "Демо перевод",
  });
  expect(
    (await notificationDetail(a, n.id)).notification.target.available,
  ).toBe(true);
  gm = await db.groupMembership.findFirstOrThrow({
    where: { membershipId: a.membership.id, endedAt: null },
  });
  await Promise.all([
    changeMembership(staff.user.id, uni, {
      action: "REVOKE",
      membershipId: a.membership.id,
      expectedEnrollmentId: gm.id,
      reason: "Демо отзыв",
    }),
    readNotification(a, n.id, {}),
  ]);
  const d = (await notificationDetail(a, n.id)).notification;
  expect(d.target).toEqual({
    available: false,
    reasonCode: "STUDY_ACCESS_CLOSED",
  });
  expect(d.readAt).not.toBeNull();
  expect(JSON.stringify(d)).not.toContain(app.id);
  await expect(downloadApplicationDocument(a, app.id)).rejects.toBeDefined();
  expect((await listNotifications(a)).items).toHaveLength(2);
  await db.session.delete({ where: { id: a.sessionId } });
  await expect(notificationCount(a)).rejects.toMatchObject({ status: 401 });
});
it("FK запрещает чужого владельца и вуз; стабильная пагинация и фильтр не раскрывают чужой cursor", async () => {
  const app = await create();
  await act(app.id, "TAKE");
  const n = await notice(app.id);
  for (const recipientMembershipId of [
    other.membership.id,
    foreign.membership.id,
  ])
    await expect(
      db.notification.create({
        data: { ...n, id: randomUUID(), recipientMembershipId },
      }),
    ).rejects.toBeDefined();
  for (let i = 0; i < 14; i++) {
    const a = await create();
    await act(a.id, "TAKE");
    await act(a.id, "COMPLETE", "Демо ответ");
  }
  const page = await listNotifications(student);
  expect(page.items).toHaveLength(25);
  expect(page.next).toBeDefined();
  await readNotification(student, page.next!, {});
  const unreadAfterReadAnchor = await listNotifications(student, {
    filter: "unread",
    cursor: page.next,
  });
  expect(unreadAfterReadAnchor.items.every((n) => n.readAt === null)).toBe(
    true,
  );
  const next = await listNotifications(student, { cursor: page.next });
  expect(next.items.length).toBeGreaterThan(0);
  expect(next.items.some((n) => page.items.some((p) => p.id === n.id))).toBe(
    false,
  );
  expect(
    (await listNotifications(student, { cursor: "%%%" })).items.map(
      (n) => n.id,
    ),
  ).toEqual(page.items.map((n) => n.id));
  const normal = await create();
  await act(normal.id, "REJECT", "Мотивированный вымышленный отказ");
  expect((await notice(normal.id)).kind).toBe("APPLICATION_REJECTED");
});

it("отказ уведомления откатывает COMPLETE и замену справки, сохраняя прежние байты/указатель", async () => {
  for (const replace of [false, true]) {
    const app = await create(student, "STUDY_CERTIFICATE");
    await act(app.id, "TAKE");
    await upload(app.id);
    if (replace)
      await act(app.id, "COMPLETE", "Демонстрационный документ готов");
    const before = await db.application.findUniqueOrThrow({
        where: { id: app.id },
      }),
      events = await db.applicationEvent.count({
        where: { applicationId: app.id },
      }),
      notices = await db.notification.count({
        where: { applicationId: app.id },
      });
    await db.$executeRawUnsafe(
      "CREATE FUNCTION notification_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='NOTIFICATION_CREATED' THEN RAISE EXCEPTION 'notification test'; END IF; RETURN NEW; END $$",
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER notification_failure_probe BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION notification_failure_probe()',
    );
    try {
      await expect(
        replace ? upload(app.id) : act(app.id, "COMPLETE", "Демо готово"),
      ).rejects.toBeDefined();
      expect(
        await db.application.findUniqueOrThrow({ where: { id: app.id } }),
      ).toEqual(before);
      expect(
        await db.applicationDocument.count({
          where: { applicationId: app.id },
        }),
      ).toBe(1);
      expect(
        await db.applicationEvent.count({ where: { applicationId: app.id } }),
      ).toBe(events);
      expect(
        await db.notification.count({ where: { applicationId: app.id } }),
      ).toBe(notices);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER notification_failure_probe ON "AuditLog"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION notification_failure_probe()");
    }
  }
});
