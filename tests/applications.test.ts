import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor } from "../src/server/security";
import {
  createApplication,
  actOnApplication,
  saveApplicationDocument,
  applicationDetail,
  listApplications,
  downloadApplicationDocument,
  type ApplicationActor,
} from "../src/server/applications";
import { applicationHTTP } from "../src/server/application-http";
import { validateFile } from "../src/server/application-files";
import { changeMembership } from "../src/server/membership";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Dedicated test DB required");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
let staff: ApplicationActor,
  student: ApplicationActor,
  other: ApplicationActor,
  staffHeaders: Headers,
  studentHeaders: Headers,
  file: Awaited<ReturnType<typeof validateFile>>;
const cert = () => ({
  kind: "STUDY_CERTIFICATE" as const,
  operationId: randomUUID(),
  purpose: "Демо место предъявления",
  description: "Демо пояснение",
});
async function fixture(
  role: "STAFF" | "STUDENT",
  universityId = uni,
  groupId = "group-1",
) {
  const id = randomUUID(),
    email = `${id}@example.test`,
    password = randomUUID() + randomUUID();
  await db.user.create({
    data: {
      id,
      name: "Демо тест заявок",
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
          status: "APPROVED",
          ...(role === "STUDENT"
            ? {
                profile: {
                  create: { firstName: "Демо", lastName: "Заявитель" },
                },
                enrollments: {
                  create: { groupId, sourceId: "demo-fixture-" + randomUUID() },
                },
              }
            : {}),
        },
      },
    },
  });
  const login = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(login.status).toBe(200);
  const h = new Headers({
    origin,
    "content-type": "application/json",
    cookie: login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  return { a: await actor(h), h };
}
async function take(id: string) {
  const a = await db.application.findUniqueOrThrow({ where: { id } });
  return actOnApplication(staff, id, {
    action: "TAKE",
    operationId: randomUUID(),
    expectedVersion: a.version,
  });
}
async function upload(id: string, reason?: string, content = file) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  return saveApplicationDocument(
    staff,
    id,
    {
      operationId: randomUUID(),
      expectedVersion: app.version,
      expectedCurrentDocumentId: app.currentDocumentId,
      demoConfirmed: true,
      ...(reason ? { reason } : {}),
    },
    content,
  );
}
async function action(id: string, name: string, text?: string) {
  const app = await db.application.findUniqueOrThrow({ where: { id } });
  return actOnApplication(staff, id, {
    action: name,
    operationId: randomUUID(),
    expectedVersion: app.version,
    ...(text ? { text } : {}),
  });
}
function request(h: Headers, body?: unknown, query = "") {
  return new Request(origin + "/api/applications" + query, {
    headers: h,
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeAll(async () => {
  ({ a: staff, h: staffHeaders } = await fixture("STAFF"));
  ({ a: student, h: studentHeaders } = await fixture("STUDENT"));
  ({ a: other } = await fixture("STUDENT"));
  file = await validateFile(
    await readFile("demo/documents/demo-certificate.pdf"),
    "application/pdf",
  );
});
afterAll(async () => {
  await db.$disconnect();
});
it("real handlers enforce student ownership, CSRF, role/identity spoofing, stable lists and real idempotent submission", async () => {
  const d = {
    kind: "GENERAL_REQUEST",
    operationId: randomUUID(),
    subject: "Демо учебный вопрос",
    description: "Демо содержание обращения",
  };
  const results = await Promise.all([
    applicationHTTP(request(studentHeaders, d), "create"),
    applicationHTTP(request(studentHeaders, d), "create"),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await db.application.count({ where: { id: d.operationId } })).toBe(1);
  await expect(applicationDetail(other, d.operationId)).rejects.toMatchObject({
    status: 404,
  });
  expect(
    (
      await applicationHTTP(
        request(studentHeaders, d),
        "action",
        d.operationId,
        true,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await applicationHTTP(
        request(studentHeaders, {
          ...d,
          operationId: randomUUID(),
          membershipId: other.membership.id,
        }),
        "create",
      )
    ).status,
  ).toBe(400);
  const bad = new Headers(studentHeaders);
  bad.set("origin", "https://bad.example.test");
  expect((await applicationHTTP(request(bad, d), "create")).status).toBe(403);
  const response = await applicationHTTP(request(studentHeaders), "list");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(await response.json())).not.toMatch(
    /content|password|email|sessionId|actorId/,
  );
  const app = await applicationDetail(staff, d.operationId);
  expect(app.applicant?.eligible).toBe(true);
  await action(d.operationId, "REJECT", "Демо мотивированная причина отказа");
  await expect(take(d.operationId)).rejects.toMatchObject({ status: 409 });
});
it("normal requests complete without files; comments and concurrent status changes remain audited and immutable", async () => {
  const app = await createApplication(student, {
    kind: "GENERAL_REQUEST",
    operationId: randomUUID(),
    subject: "Демо обычная заявка",
    description: "Демо текст обычной заявки",
  });
  await expect(action(app.id, "COMPLETE", "Демо ответ")).rejects.toMatchObject({
    status: 409,
  });
  const input = {
    action: "TAKE",
    operationId: randomUUID(),
    expectedVersion: 1,
  };
  const rr = await Promise.allSettled([
    actOnApplication(staff, app.id, input),
    actOnApplication(staff, app.id, input),
  ]);
  expect(rr.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await action(app.id, "COMMENT", "Демо публичный комментарий");
  await action(app.id, "COMPLETE", "Демо вопрос решён");
  const mine = await applicationDetail(student, app.id);
  expect(mine).toMatchObject({
    status: "COMPLETED",
    responseText: "Демо вопрос решён",
    currentDocument: null,
    version: 4,
  });
  expect(mine.events).toHaveLength(4);
  const event = mine.events[0];
  await expect(
    db.applicationEvent.update({
      where: { id: event.id },
      data: { publicText: "rewrite" },
    }),
  ).rejects.toThrow();
  expect(await db.auditLog.count({ where: { targetId: app.id } })).toBe(4);
});
it("certificate completion needs real committed bytes; multipart upload and download preserve exact hash, replacement keeps immutable versions", async () => {
  const app = await createApplication(student, cert());
  await take(app.id);
  await expect(
    action(app.id, "COMPLETE", "Демо выдача справки"),
  ).rejects.toThrow(/загрузите/);
  const form = new FormData();
  form.append(
    "metadata",
    JSON.stringify({
      operationId: randomUUID(),
      expectedVersion: 2,
      expectedCurrentDocumentId: null,
      demoConfirmed: true,
    }),
  );
  form.append(
    "file",
    new File([new Uint8Array(file.content)], "demo.pdf", {
      type: "application/pdf",
    }),
  );
  const h = new Headers(staffHeaders);
  h.delete("content-type");
  const r = await applicationHTTP(
    new Request(origin + `/api/staff/applications/${app.id}/documents`, {
      method: "POST",
      headers: h,
      body: form,
    }),
    "upload",
    app.id,
    true,
  );
  expect(r.status).toBe(200);
  const first = await r.json();
  expect(first.document.byteSize).toBe(file.content.length);
  await expect(
    downloadApplicationDocument(student, app.id),
  ).rejects.toMatchObject({ status: 404 });
  expect((await applicationDetail(student, app.id)).currentDocument).toBeNull();
  await action(app.id, "COMPLETE", "Демо справка подготовлена");
  const downloaded = await downloadApplicationDocument(student, app.id);
  expect(createHash("sha256").update(downloaded.content).digest("hex")).toBe(
    file.sha256,
  );
  expect(
    Buffer.compare(Buffer.from(downloaded.content), Buffer.from(file.content)),
  ).toBe(0);
  expect(downloaded.headers["Content-Disposition"]).toMatch(
    /^attachment; filename="demo-certificate-/,
  );
  expect(downloaded.headers["X-Content-Type-Options"]).toBe("nosniff");
  await expect(
    downloadApplicationDocument(other, app.id),
  ).rejects.toMatchObject({ status: 404 });
  const next = await upload(app.id, "Демо исправленная версия документа");
  expect(next.document.revision).toBe(2);
  expect((await applicationDetail(student, app.id)).status).toBe("COMPLETED");
  expect((await applicationDetail(staff, app.id)).documents).toHaveLength(2);
  await expect(
    downloadApplicationDocument(student, app.id, first.document.id),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await downloadApplicationDocument(staff, app.id, first.document.id))
      .content.length,
  ).toBe(file.content.length);
  await expect(
    db.applicationDocument.update({
      where: { id: first.document.id },
      data: { sha256: "a".repeat(64) },
    }),
  ).rejects.toThrow();
  expect(
    await db.applicationDocument.count({ where: { applicationId: app.id } }),
  ).toBe(2);
  await expect(
    saveApplicationDocument(
      staff,
      app.id,
      {
        operationId: randomUUID(),
        expectedVersion: 3,
        expectedCurrentDocumentId: first.document.id,
        demoConfirmed: true,
        reason: "Демо устаревшая замена",
      },
      file,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("audit failure rolls back the document, current pointer, version and event in one real PostgreSQL transaction", async () => {
  const app = await createApplication(student, cert());
  await take(app.id);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION application_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='DOCUMENT_UPLOADED' THEN RAISE EXCEPTION 'probe'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER application_audit_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION application_audit_fail()',
  );
  try {
    await expect(upload(app.id)).rejects.toThrow();
    expect(
      await db.applicationDocument.count({ where: { applicationId: app.id } }),
    ).toBe(0);
    expect(
      await db.application.findUniqueOrThrow({ where: { id: app.id } }),
    ).toMatchObject({ version: 2, currentDocumentId: null });
    expect(
      await db.applicationEvent.count({ where: { applicationId: app.id } }),
    ).toBe(2);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER application_audit_fail ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION application_audit_fail()");
  }
});
it("history survives group transfer; revoke, inactive actors and foreign universities cannot obtain bytes or mutate, rejection remains possible", async () => {
  const app = await createApplication(student, cert());
  await take(app.id);
  await upload(app.id);
  await action(app.id, "COMPLETE", "Демо справка готова");
  const open = await createApplication(student, cert());
  let e = await db.groupMembership.findFirstOrThrow({
    where: {
      membershipId: student.membership.id,
      endedAt: null,
      revokedAt: null,
    },
  });
  await changeMembership(staff.user.id, uni, {
    action: "TRANSFER",
    membershipId: student.membership.id,
    expectedEnrollmentId: e.id,
    groupId: "group-2",
    reason: "Демо перевод",
  });
  const current = await actor(studentHeaders);
  expect(
    (await applicationDetail(current, app.id)).submittedGroupName,
  ).toContain("Демо-группа 1");
  expect(
    (await downloadApplicationDocument(current, app.id)).content.length,
  ).toBe(file.content.length);
  e = await db.groupMembership.findFirstOrThrow({
    where: {
      membershipId: student.membership.id,
      endedAt: null,
      revokedAt: null,
    },
  });
  await changeMembership(staff.user.id, uni, {
    action: "REVOKE",
    membershipId: student.membership.id,
    expectedEnrollmentId: e.id,
    reason: "Демо отзыв",
  });
  const revoked = await actor(studentHeaders);
  await expect(applicationDetail(revoked, app.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    downloadApplicationDocument(current, app.id),
  ).rejects.toMatchObject({ status: 403 });
  await expect(take(open.id)).rejects.toMatchObject({ status: 403 });
  await action(open.id, "REJECT", "Демо учебный доступ заявителя отозван");
  expect((await applicationDetail(staff, app.id)).documents).toHaveLength(1);
  // A stale actor object must not override a revoked server session.
  await db.session.delete({ where: { id: staff.sessionId } });
  await expect(
    action(open.id, "COMMENT", "Демо поздний ответ"),
  ).rejects.toMatchObject({ status: 401 });
  ({ a: staff, h: staffHeaders } = await fixture("STAFF"));
  const foreign = randomUUID();
  await db.university.create({
    data: { id: foreign, name: "Демо другой вуз", timezone: "Europe/Moscow" },
  });
  const outsider = await fixture("STAFF", foreign);
  await expect(applicationDetail(outsider.a, app.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    downloadApplicationDocument(
      outsider.a,
      app.id,
      (
        await db.applicationDocument.findFirstOrThrow({
          where: { applicationId: app.id },
        })
      ).id,
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("SQL itself refuses completed certificates without a document and references to another application's file", async () => {
  const owner = await fixture("STUDENT"),
    a = await createApplication(owner.a, cert()),
    b = await createApplication(owner.a, cert());
  await take(a.id);
  await take(b.id);
  const d = await upload(b.id);
  await expect(
    db.application.update({
      where: { id: a.id },
      data: {
        status: "COMPLETED",
        resolvedById: staff.user.id,
        resolvedAt: new Date(),
        responseText: "Демо ответ",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.application.update({
      where: { id: a.id },
      data: { currentDocumentId: d.document.id },
    }),
  ).rejects.toThrow();
});
it("physical byte quotas include old versions and serialise concurrent uploads at the exact membership boundary", async () => {
  const applicant = await fixture("STUDENT"),
    pdf = await readFile("demo/documents/demo-certificate.pdf"),
    tail = pdf.lastIndexOf("%%EOF"),
    large = Buffer.concat([
      pdf.subarray(0, tail),
      Buffer.alloc(3145728 - tail - 5, 32),
      Buffer.from("%%EOF"),
    ]);
  const validated = await validateFile(large, "application/pdf");
  expect(validated.content.length).toBe(3145728);
  const apps = await Promise.all([
    createApplication(applicant.a, cert()),
    createApplication(applicant.a, cert()),
    createApplication(applicant.a, cert()),
  ]);
  for (const a of apps) await take(a.id);
  for (let i = 0; i < 5; i++)
    await upload(
      apps[0].id,
      i ? "Демо очередная версия для проверки квоты" : undefined,
      validated,
    );
  await expect(
    upload(apps[0].id, "Демо шестая версия", validated),
  ).rejects.toThrow(/пять/);
  for (let i = 0; i < 4; i++)
    await upload(
      apps[1].id,
      i ? "Демо версия для проверки квоты" : undefined,
      validated,
    );
  const race = await Promise.allSettled([
    upload(apps[1].id, "Демо последняя версия", validated),
    upload(apps[2].id, undefined, validated),
  ]);
  expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const stored = await db.applicationDocument.aggregate({
    where: { application: { membershipId: applicant.a.membership.id } },
    _sum: { byteSize: true },
  });
  expect(stored._sum.byteSize).toBe(30 * 1024 * 1024);
  const still = await db.applicationDocument.count({
    where: { application: { membershipId: applicant.a.membership.id } },
  });
  expect(still).toBe(10);
}, 60000);
it("the university quota includes every retained version across memberships and serialises the final competing uploads", async () => {
  const universityId = randomUUID(),
    groupId = randomUUID(),
    previousStaff = staff;
  await db.university.create({
    data: {
      id: universityId,
      name: "Демо вуз квот",
      timezone: "Europe/Moscow",
      faculties: {
        create: {
          id: randomUUID(),
          name: "Демо факультет квот",
          programs: {
            create: {
              id: randomUUID(),
              name: "Демо направление квот",
              groups: { create: { id: groupId, name: "Демо группа квот" } },
            },
          },
        },
      },
    },
  });
  const quotaStaff = await fixture("STAFF", universityId);
  staff = quotaStaff.a;
  try {
    const pdf = await readFile("demo/documents/demo-certificate.pdf"),
      tail = pdf.lastIndexOf("%%EOF");
    const large = await validateFile(
      Buffer.concat([
        pdf.subarray(0, tail),
        Buffer.alloc(3145728 - tail - 5, 32),
        Buffer.from("%%EOF"),
      ]),
      "application/pdf",
    );
    let finalApps: { id: string }[] = [];
    for (let m = 0; m < 10; m++) {
      const applicant = await fixture("STUDENT", universityId, groupId);
      const apps = [];
      for (let j = 0; j < (m === 9 ? 3 : 2); j++) {
        const app = await createApplication(applicant.a, cert());
        await take(app.id);
        apps.push(app);
      }
      for (let j = 0; j < 2; j++)
        for (let v = 0; v < (m === 9 && j === 1 ? 4 : 5); v++)
          await upload(
            apps[j].id,
            v ? "Демо версия проверки общей квоты" : undefined,
            large,
          );
      if (m === 9) finalApps = apps;
    }
    const competing = await Promise.allSettled([
      upload(finalApps[1].id, "Демо последняя допустимая версия", large),
      upload(finalApps[2].id, undefined, large),
    ]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = competing.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(rejected.reason.message).toMatch(/Квота хранения/);
    expect(
      (
        await db.applicationDocument.aggregate({
          where: { universityId },
          _sum: { byteSize: true },
        })
      )._sum.byteSize,
    ).toBe(300 * 1024 * 1024);
    expect(
      await db.applicationDocument.count({ where: { universityId } }),
    ).toBe(100);
  } finally {
    staff = previousStaff;
  }
}, 120000);
it("open-case limits and scoped cursor pagination are enforced without leaking other applicants or accepting invalid dates", async () => {
  const applicant = await fixture("STUDENT");
  const apps = [];
  for (let n = 0; n < 10; n++)
    apps.push(await createApplication(applicant.a, cert()));
  await expect(createApplication(applicant.a, cert())).rejects.toMatchObject({
    status: 409,
  });
  for (const app of apps)
    await action(
      app.id,
      "REJECT",
      "Демо завершение тестового обращения отказом",
    );
  for (let n = 0; n < 16; n++) {
    const app = await createApplication(applicant.a, cert());
    await action(
      app.id,
      "REJECT",
      "Демо причина для проверки списка и страниц",
    );
  }
  const first = await listApplications(applicant.a, { status: "REJECTED" });
  expect(first.rows).toHaveLength(25);
  const second = await listApplications(applicant.a, {
    status: "REJECTED",
    cursor: first.next,
  });
  expect(second.rows).toHaveLength(1);
  expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(
    26,
  );
  await expect(
    listApplications(other, { cursor: first.rows[0].id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    listApplications(staff, { from: "2026-02-30" }),
  ).rejects.toThrow();
  await expect(
    listApplications(applicant.a, { from: "2026-01-01" }),
  ).rejects.toMatchObject({ status: 400 });
});
