import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor } from "../src/server/security";
import {
  changeGrade,
  changeSubject,
  readGrades,
  gradeRoster,
} from "../src/server/grades";
import { POST } from "../src/app/api/staff/grades/route";
import { GET } from "../src/app/api/grades/route";
import { hashPassword } from "better-auth/crypto";
import { changeMembership } from "../src/server/membership";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Isolated test DB required");
const origin = process.env.BETTER_AUTH_URL!;
let staffId: string,
  mid: string,
  subjectId: string,
  sh: Headers,
  uh: Headers,
  other: Headers;
const made: string[] = [];
async function login(email: string, password: string) {
  const r = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(r.status).toBe(200);
  return new Headers({
    origin,
    "content-type": "application/json",
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
}
function req(h: Headers, body?: unknown, query = "") {
  return new Request(origin + "/api/grades" + query, {
    method: body ? "POST" : "GET",
    headers: h,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function input() {
  return {
    action: "CREATE",
    operationId: randomUUID(),
    membershipId: mid,
    groupId: "group-1",
    subjectId,
    issuedOn: "2026-11-07",
    result: { kind: "MARK", mark: 5 },
  };
}
beforeAll(async () => {
  sh = await login("staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
  uh = await login(
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
  other = await login(
    "student2@example.test",
    process.env.DEMO_STUDENT2_PASSWORD!,
  );
  const sa = await actor(sh),
    ua = await actor(uh);
  staffId = sa.user.id;
  mid = ua.membership.id;
  subjectId = (
    await changeSubject(staffId, "demo-university", {
      action: "CREATE",
      operationId: randomUUID(),
      name: "Демо исследовательская практика",
    })
  ).id;
});
afterAll(async () => {
  await db.grade.deleteMany({ where: { subjectId } });
  await db.subject.delete({ where: { id: subjectId } });
  await db.$disconnect();
});
it("creates once under concurrent retry; real routes isolate personal DTO and deny student writes", async () => {
  const d = input();
  const rr = await Promise.all([POST(req(sh, d)), POST(req(sh, d))]);
  expect(rr.map((r) => r.status).sort()).toEqual([200, 409]);
  made.push(d.operationId);
  expect((await POST(req(uh, input()))).status).toBe(403);
  const mine = await GET(req(uh));
  expect(mine.headers.get("cache-control")).toBe("private, no-store");
  expect(
    (await mine.json()).rows.some(
      (r: { id: string }) => r.id === d.operationId,
    ),
  ).toBe(true);
  expect(
    (await (await GET(req(other))).json()).rows.some(
      (r: { id: string }) => r.id === d.operationId,
    ),
  ).toBe(false);
  expect(
    (await GET(req(other, undefined, "?membershipId=" + mid))).status,
  ).toBe(403);
  expect(
    (await GET(req(other, undefined, "?cursor=" + d.operationId))).status,
  ).toBe(404);
  expect(
    (
      await POST(
        req(new Headers({ "content-type": "application/json" }), input()),
      )
    ).status,
  ).toBe(403);
});
it("validates calendar dates, result types, values and foreign or inactive IDs on actual handlers", async () => {
  for (const result of [
    { kind: "MARK", mark: 0 },
    { kind: "MARK", mark: 1 },
    { kind: "MARK", mark: 6 },
    { kind: "MARK", mark: 2.5 },
    { kind: "MARK", mark: "5" },
    { kind: "MARK", credit: "PASSED" },
    { kind: "CREDIT", credit: "5" },
    { kind: "CREDIT", credit: "PASSED", mark: 5 },
  ])
    expect((await POST(req(sh, { ...input(), result }))).status).toBe(400);
  for (const issuedOn of [
    "2026-02-31",
    "31.02.2026",
    "2026/11/07",
    "1999-01-01",
  ])
    expect((await POST(req(sh, { ...input(), issuedOn }))).status).toBe(400);
  for (const patch of [
    { subjectId: randomUUID() },
    { membershipId: randomUUID() },
  ])
    expect((await POST(req(sh, { ...input(), ...patch }))).status).toBe(403);
  for (const credit of ["PASSED", "FAILED"]) {
    const d = { ...input(), result: { kind: "CREDIT", credit } };
    expect((await POST(req(sh, d))).status).toBe(200);
    made.push(d.operationId);
  }
  const subject = await db.subject.findUniqueOrThrow({
    where: { id: subjectId },
  });
  await changeSubject(staffId, "demo-university", {
    action: "EDIT",
    id: subjectId,
    version: subject.version,
    name: subject.name,
    active: false,
  });
  expect((await POST(req(sh, input()))).status).toBe(403);
  expect(
    (await readGrades(await actor(uh))).rows.some(
      (r) => r.subjectId === subjectId,
    ),
  ).toBe(true);
  await changeSubject(staffId, "demo-university", {
    action: "EDIT",
    id: subjectId,
    version: subject.version + 1,
    name: subject.name,
    active: true,
  });
});
it("edits once, requires reasons, retains old/new audit, voids without deleting", async () => {
  const grade = made[0];
  const edit = {
    action: "EDIT",
    id: grade,
    version: 1,
    subjectId,
    issuedOn: "2026-11-08",
    result: { kind: "MARK", mark: 4 },
    reason: "Демо исправление",
  };
  expect((await POST(req(sh, { ...edit, reason: "" }))).status).toBe(400);
  const rr = await Promise.all([POST(req(sh, edit)), POST(req(sh, edit))]);
  expect(rr.map((r) => r.status).sort()).toEqual([200, 409]);
  const audit = await db.auditLog.findFirstOrThrow({
    where: { targetId: grade, action: "GRADE_EDIT" },
  });
  const details = JSON.parse(audit.reason!);
  expect(details.before.mark).toBe(5);
  expect(details.after.mark).toBe(4);
  expect(details.reason).toBe("Демо исправление");
  expect(
    (
      await POST(
        req(sh, {
          action: "VOID",
          id: grade,
          version: 2,
          reason: "Демо ошибочная запись",
        }),
      )
    ).status,
  ).toBe(200);
  expect(await db.grade.findUnique({ where: { id: grade } })).toMatchObject({
    voided: true,
    version: 3,
  });
  expect(
    (await readGrades(await actor(uh))).rows.some((r) => r.id === grade),
  ).toBe(false);
  expect(
    (await readGrades(await actor(sh), { membershipId: mid })).rows.some(
      (r) => r.id === grade,
    ),
  ).toBe(true);
  expect((await POST(req(sh, edit))).status).toBe(409);
});
it("keeps personal grades across transfer and blocks revoked/inactive/PENDING/REJECTED access and writes", async () => {
  const enrollment = await db.groupMembership.findFirstOrThrow({
    where: { membershipId: mid, endedAt: null, revokedAt: null },
  });
  const target = enrollment.groupId === "group-1" ? "group-2" : "group-1";
  let current = enrollment;
  try {
    await changeMembership(staffId, "demo-university", {
      action: "TRANSFER",
      membershipId: mid,
      expectedEnrollmentId: current.id,
      groupId: target,
      reason: "Демо перевод",
    });
    current = await db.groupMembership.findFirstOrThrow({
      where: { membershipId: mid, endedAt: null, revokedAt: null },
    });
    expect(
      (await readGrades(await actor(uh))).rows.some(
        (r) => r.subjectId === subjectId,
      ),
    ).toBe(true);
    await db.studentGroup.update({
      where: { id: target },
      data: { active: false },
    });
    expect((await GET(req(uh))).status).toBe(403);
    expect((await POST(req(sh, input()))).status).toBe(403);
    await db.studentGroup.update({
      where: { id: target },
      data: { active: true },
    });
    for (const status of ["PENDING", "REJECTED"]) {
      await db.universityMembership.update({
        where: { id: mid },
        data: { status },
      });
      expect((await GET(req(uh))).status).toBe(403);
      expect((await POST(req(sh, input()))).status).toBe(403);
    }
    await db.universityMembership.update({
      where: { id: mid },
      data: { status: "APPROVED" },
    });
    await changeMembership(staffId, "demo-university", {
      action: "REVOKE",
      membershipId: mid,
      expectedEnrollmentId: current.id,
      reason: "Демо отзыв",
    });
    expect((await GET(req(uh))).status).toBe(403);
    expect((await POST(req(sh, input()))).status).toBe(403);
    expect(
      await db.grade.count({ where: { membershipId: mid, subjectId } }),
    ).toBe(made.length);
  } finally {
    await db.universityMembership.update({
      where: { id: mid },
      data: { status: "APPROVED" },
    });
    await db.studentGroup.update({
      where: { id: target },
      data: { active: true },
    });
    const active = await db.groupMembership.findFirst({
      where: { membershipId: mid, endedAt: null, revokedAt: null },
    });
    if (active)
      await changeMembership(staffId, "demo-university", {
        action: "TRANSFER",
        membershipId: mid,
        expectedEnrollmentId: active.id,
        groupId: enrollment.groupId,
        reason: "Демо завершение проверки",
      });
    else
      await db.groupMembership.create({
        data: {
          membershipId: mid,
          groupId: enrollment.groupId,
          sourceId: "test-restore-" + randomUUID(),
        },
      });
  }
});
it("foreign STAFF and disabled actors cannot read or mutate another university", async () => {
  const uni = randomUUID(),
    user = randomUUID(),
    password = randomUUID(),
    email = randomUUID() + "@example.test";
  await db.university.create({
    data: { id: uni, name: "Демо чужой вуз", timezone: "Europe/Moscow" },
  });
  await db.user.create({
    data: {
      id: user,
      name: "Демо другой сотрудник",
      email,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: user,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
      memberships: {
        create: { universityId: uni, role: "STAFF", status: "APPROVED" },
      },
    },
  });
  try {
    const h = await login(email, password);
    expect((await POST(req(h, input()))).status).toBe(403);
    expect((await GET(req(h, undefined, "?membershipId=" + mid))).status).toBe(
      404,
    );
    await db.user.update({ where: { id: staffId }, data: { active: false } });
    expect((await POST(req(sh, input()))).status).toBe(403);
  } finally {
    await db.user.update({ where: { id: staffId }, data: { active: true } });
    await db.universityMembership.deleteMany({ where: { userId: user } });
    await db.user.delete({ where: { id: user } });
    await db.university.delete({ where: { id: uni } });
  }
});
it("database enforces values and cross-university references; audit failure rolls back the grade", async () => {
  const foreign = randomUUID();
  await db.university.create({
    data: {
      id: foreign,
      name: "Вымышленный другой вуз",
      timezone: "Europe/Moscow",
    },
  });
  const fs = await db.subject.create({
    data: { universityId: foreign, name: "Демо чужая дисциплина" },
  });
  try {
    expect((await POST(req(sh, { ...input(), subjectId: fs.id }))).status).toBe(
      403,
    );
    const base = {
      id: randomUUID(),
      universityId: "demo-university",
      membershipId: mid,
      subjectId,
      issuedOn: new Date("2026-11-07"),
      authorId: staffId,
      kind: "MARK",
      mark: 5,
    };
    await expect(
      db.grade.create({ data: { ...base, mark: 6 } }),
    ).rejects.toThrow();
    await expect(
      db.grade.create({ data: { ...base, subjectId: fs.id } }),
    ).rejects.toThrow();
    // Use a real transaction failure at immutable audit, rather than a mocked ORM.
    const d = input();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_grade_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'GRADE_%' THEN RAISE EXCEPTION 'test audit refusal'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER reject_grade_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_grade_audit()`,
    );
    try {
      await expect(
        changeGrade(staffId, "demo-university", d),
      ).rejects.toThrow();
      expect(
        await db.grade.findUnique({ where: { id: d.operationId } }),
      ).toBeNull();
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER reject_grade_audit ON "AuditLog"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION reject_grade_audit()");
    }
  } finally {
    await db.subject.delete({ where: { id: fs.id } });
    await db.university.delete({ where: { id: foreign } });
  }
});
it("paginates stable personal results and scoped staff audit without duplicates", async () => {
  for (let i = 0; i < 26; i++) {
    const d = { ...input(), issuedOn: "2026-11-09" };
    await changeGrade(staffId, "demo-university", d);
    made.push(d.operationId);
  }
  const a = await actor(uh),
    first = await readGrades(a);
  expect(first.rows).toHaveLength(25);
  expect(first.next).not.toBeNull();
  const second = await readGrades(a, { cursor: first.next! });
  expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(
    first.rows.length + second.rows.length,
  );
  const grade = first.rows[0];
  // Synthetic immutable audit fixtures exercise pagination, never overwrite history.
  await db.auditLog.createMany({
    data: Array.from({ length: 101 }, () => ({
      actorId: staffId,
      universityId: "demo-university",
      targetId: grade.id,
      action: "GRADE_EDIT",
      reason: JSON.stringify({
        membershipId: mid,
        reason: "Демо пагинация",
        before: null,
        after: null,
      }),
    })),
  });
  const sa = await actor(sh),
    history = await readGrades(sa, { membershipId: mid });
  expect(history.events).toHaveLength(100);
  expect(history.nextAudit).not.toBeNull();
  const older = await readGrades(sa, {
    membershipId: mid,
    auditCursor: history.nextAudit!,
  });
  expect(older.events.length).toBeGreaterThan(0);
  expect(
    new Set([...history.events, ...older.events].map((e) => e.id)).size,
  ).toBe(history.events.length + older.events.length);
  await expect(
    readGrades(sa, { membershipId: mid, auditCursor: randomUUID() }),
  ).rejects.toMatchObject({ status: 404 });
});
it("subject directory supports rename, deactivate, restore and stale-version denial through real API", async () => {
  const { POST: writeSubject } = await import(
    "../src/app/api/staff/subjects/route"
  );
  const d = {
    action: "CREATE",
    operationId: randomUUID(),
    name: "Демо отдельная дисциплина",
  };
  const created = await writeSubject(req(sh, d));
  expect(created.status).toBe(200);
  const sid = (await created.json()).id;
  try {
    expect(
      (await writeSubject(req(uh, { ...d, operationId: randomUUID() }))).status,
    ).toBe(403);
    expect((await writeSubject(req(sh, d))).status).toBe(409);
    const edit = {
      action: "EDIT",
      id: sid,
      version: 1,
      name: "Демо переименованная дисциплина",
      active: true,
    };
    expect((await writeSubject(req(sh, edit))).status).toBe(200);
    expect((await writeSubject(req(sh, edit))).status).toBe(409);
    expect(await db.subject.findUnique({ where: { id: sid } })).toMatchObject({
      name: edit.name,
      active: true,
      version: 2,
    });
    expect(
      (await writeSubject(req(sh, { ...edit, version: 2, active: false })))
        .status,
    ).toBe(200);
    expect(
      (await writeSubject(req(sh, { ...input(), subjectId: sid }))).status,
    ).toBe(400);
    expect((await POST(req(sh, { ...input(), subjectId: sid }))).status).toBe(
      403,
    );
    expect(
      (await writeSubject(req(sh, { ...edit, version: 3, active: true })))
        .status,
    ).toBe(200);
    expect(await db.subject.findUnique({ where: { id: sid } })).toMatchObject({
      active: true,
      version: 4,
    });
    expect(await db.auditLog.count({ where: { targetId: sid } })).toBe(4);
  } finally {
    await db.subject.delete({ where: { id: sid } });
  }
});

it("новый результат требует группу, отвергает чужого студента и ограничивает список выбранной группой", async () => {
  const a = await actor(sh),
    otherMembership = (await actor(other)).membership.id;
  const empty = await gradeRoster(a);
  expect(empty.rows).toEqual([]);
  const roster = await gradeRoster(a, { groupId: "group-1" });
  expect(roster.rows.some((r) => r.id === mid)).toBe(true);
  expect(roster.rows.some((r) => r.id === otherMembership)).toBe(false);
  await expect(
    gradeRoster(a, { groupId: "group-1", cursor: otherMembership }),
  ).rejects.toMatchObject({ status: 404 });
  expect((await POST(req(sh, { ...input(), groupId: undefined }))).status).toBe(
    400,
  );
  for (const patch of [
    { groupId: "group-2" },
    { membershipId: otherMembership },
  ]) {
    const command = { ...input(), ...patch };
    expect((await POST(req(sh, command))).status).toBe(409);
    expect(await db.grade.count({ where: { id: command.operationId } })).toBe(
      0,
    );
    expect(
      await db.auditLog.count({ where: { targetId: command.operationId } }),
    ).toBe(0);
  }
});

it("перевод после открытия формы блокирует устаревшую группу, но сохраняет личную историю и исправления", async () => {
  const baseline = { ...input(), issuedOn: "2026-11-18" };
  expect((await POST(req(sh, baseline))).status).toBe(200);
  const before = await readGrades(await actor(uh));
  expect(before.rows.some((r) => r.id === baseline.operationId)).toBe(true);
  const current = await db.groupMembership.findFirstOrThrow({
    where: { membershipId: mid, endedAt: null, revokedAt: null },
  });
  const stale = input();
  try {
    await changeMembership(staffId, "demo-university", {
      action: "TRANSFER",
      membershipId: mid,
      expectedEnrollmentId: current.id,
      groupId: "group-2",
      reason: "Демо проверка устаревшей формы",
    });
    expect((await POST(req(sh, stale))).status).toBe(409);
    expect(await db.grade.count({ where: { id: stale.operationId } })).toBe(0);
    expect((await readGrades(await actor(uh))).rows).toEqual(before.rows);
    const newGrade = { ...input(), groupId: "group-2", issuedOn: "2026-11-18" };
    expect((await POST(req(sh, newGrade))).status).toBe(200);
    const edit = {
      action: "EDIT",
      id: newGrade.operationId,
      version: 1,
      subjectId,
      issuedOn: "2026-11-18",
      result: { kind: "MARK", mark: 4 },
      reason: "Демо исправление после перевода",
    };
    expect((await POST(req(sh, edit))).status).toBe(200);
    expect(
      (await readGrades(await actor(uh))).rows.find(
        (r) => r.id === newGrade.operationId,
      )?.mark,
    ).toBe(4);
    expect(
      (await gradeRoster(await actor(sh), { history: true })).rows.some(
        (r) => r.id === mid,
      ),
    ).toBe(true);
  } finally {
    const next = await db.groupMembership.findFirstOrThrow({
      where: { membershipId: mid, endedAt: null, revokedAt: null },
    });
    await changeMembership(staffId, "demo-university", {
      action: "TRANSFER",
      membershipId: mid,
      expectedEnrollmentId: next.id,
      groupId: current.groupId,
      reason: "Демо завершение проверки устаревшей формы",
    });
  }
});
