import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { register, decide } from "../src/server/enrollment";
import { issueRegistrationTicket } from "../src/server/demo-identity";
import { changeMembership } from "../src/server/membership";
import { actor, studentAccess } from "../src/server/security";
import { ownRequestPage, staffRequestPage } from "../src/server/lists";
import { pageSize } from "../src/lib/pagination";
import { POST as operate } from "../src/app/api/staff/membership/route";
import { POST as retry } from "../src/app/api/enrollment/route";
import { GET as group } from "../src/app/api/group/route";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Dedicated *_test DB required");
const origin = process.env.BETTER_AUTH_URL!;
const source = "foundation";
let staffId: string, staffHeaders: Headers;
const created: string[] = [];
async function login(email: string, password: string) {
  const r = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  if (!r.ok) throw Error("Private fixture login failed");
  return new Headers({
    origin,
    "content-type": "application/json",
    cookie: r.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
  });
}
async function student(approved = true) {
  const identity = await register(
    {
      ticket: issueRegistrationTicket(source),
      universityId: "demo-university",
      facultyId: "faculty-1",
      programId: "program-1",
      groupId: "group-1",
    },
    new Headers({ origin }),
    source,
  );
  const headers = await login(identity.email, identity.password);
  let a = await actor(headers);
  created.push(a.membership.id);
  if (approved) {
    await decide(
      staffId,
      "demo-university",
      a.membership.requests[0].id,
      "APPROVED",
      "Демонстрационная проверка",
    );
    a = await actor(headers);
  }
  return { a, headers };
}
const post = (headers: Headers, body: unknown) =>
  operate(
    new Request(origin + "/api/staff/membership", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
beforeAll(async () => {
  staffId = (
    await db.user.findUniqueOrThrow({ where: { email: "staff@example.test" } })
  ).id;
  staffHeaders = await login(
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
});
afterAll(async () => {
  // Resolve only this file's pending fixtures through the real audited operation.
  for (const membershipId of created) {
    const r = await db.enrollmentRequest.findFirst({
      where: { membershipId, status: "PENDING" },
    });
    if (r)
      await decide(
        staffId,
        "demo-university",
        r.id,
        "REJECTED",
        "Завершение тестовой проверки",
      );
  }
  await db.$disconnect();
});
it("HTTP STAFF transfer/revoke/resubmission are atomic, audited and deny stale group access", async () => {
  const { a, headers } = await student();
  const old = studentAccess(a);
  const base = {
    membershipId: a.membership.id,
    expectedEnrollmentId: old.id,
    reason: "Демонстрационный перевод",
    action: "TRANSFER",
    groupId: "group-2",
  };
  expect((await post(headers, base)).status).toBe(403);
  const noOrigin = new Headers(staffHeaders);
  noOrigin.delete("origin");
  expect((await post(noOrigin, base)).status).toBe(403);
  expect((await post(staffHeaders, { ...base, role: "STAFF" })).status).toBe(
    400,
  );
  expect(
    (await post(staffHeaders, { ...base, groupId: "group-1" })).status,
  ).toBe(409);
  const result = await Promise.all([
    post(staffHeaders, base),
    post(staffHeaders, base),
  ]);
  expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (await group(new Request(origin + "/api/group?id=group-1", { headers })))
      .status,
  ).toBe(403);
  expect(
    (await group(new Request(origin + "/api/group?id=group-2", { headers })))
      .status,
  ).toBe(200);
  const current = studentAccess(await actor(headers));
  const event = await db.auditLog.findUniqueOrThrow({
    where: { id: current.sourceId },
  });
  expect(event).toMatchObject({
    actorId: staffId,
    universityId: "demo-university",
    targetId: a.membership.id,
    action: "TRANSFERRED",
    oldGroupId: "group-1",
    newGroupId: "group-2",
    reason: base.reason,
  });
  expect(
    await db.enrollmentRequest.count({
      where: { membershipId: a.membership.id },
    }),
  ).toBe(1);
  expect(
    (await db.groupMembership.findUniqueOrThrow({ where: { id: old.id } }))
      .endedAt,
  ).not.toBeNull();
  const revoke = {
    action: "REVOKE",
    membershipId: a.membership.id,
    expectedEnrollmentId: current.id,
    reason: "Демонстрационный отзыв",
  };
  expect((await post(staffHeaders, revoke)).status).toBe(200);
  expect((await post(staffHeaders, revoke)).status).toBe(409);
  const revoked = await actor(headers);
  expect(revoked.membership.status).toBe("APPROVED");
  expect(() => studentAccess(revoked)).toThrow();
  expect(revoked.membership.requests[0].status).toBe("APPROVED");
  const attempt = () =>
    retry(
      new Request(origin + "/api/enrollment", {
        method: "POST",
        headers,
        body: JSON.stringify({ groupId: "group-2" }),
      }),
    );
  expect((await attempt()).status).toBe(403);
  const allow = {
    action: "ALLOW_RESUBMISSION",
    membershipId: a.membership.id,
    reason: "Повторная проверка разрешена",
  };
  expect((await post(staffHeaders, allow)).status).toBe(200);
  expect((await post(staffHeaders, allow)).status).toBe(409);
  expect((await attempt()).status).toBe(200);
  const pending = await actor(headers);
  expect(pending.membership.id).toBe(a.membership.id);
  expect(pending.membership.status).toBe("PENDING");
  expect(
    await db.enrollmentRequest.count({
      where: { membershipId: a.membership.id },
    }),
  ).toBe(2);
  expect(
    await db.auditLog.count({
      where: { targetId: a.membership.id, action: "REVOKED" },
    }),
  ).toBe(1);
});
it("rejects inactive, wrong-scope, non-approved and same-group operations without writes", async () => {
  const { a, headers } = await student();
  const e = studentAccess(a);
  const data = {
    action: "TRANSFER",
    membershipId: a.membership.id,
    expectedEnrollmentId: e.id,
    groupId: "group-2",
    reason: "Тест",
  };
  const before = await db.auditLog.count({
    where: { targetId: a.membership.id },
  });
  await expect(
    changeMembership(staffId, "foreign-university", data),
  ).rejects.toThrow();
  await db.studentGroup.update({
    where: { id: "group-2" },
    data: { active: false },
  });
  try {
    await expect(
      changeMembership(staffId, "demo-university", data),
    ).rejects.toThrow();
  } finally {
    await db.studentGroup.update({
      where: { id: "group-2" },
      data: { active: true },
    });
  }
  await db.user.update({ where: { id: staffId }, data: { active: false } });
  try {
    await expect(
      changeMembership(staffId, "demo-university", data),
    ).rejects.toThrow();
    await expect(actor(staffHeaders)).rejects.toThrow();
  } finally {
    await db.user.update({ where: { id: staffId }, data: { active: true } });
  }
  await db.user.update({ where: { id: a.user.id }, data: { active: false } });
  try {
    await expect(actor(headers)).rejects.toThrow();
  } finally {
    await db.user.update({ where: { id: a.user.id }, data: { active: true } });
  }
  const pending = await student(false);
  await expect(
    changeMembership(staffId, "demo-university", {
      ...data,
      membershipId: pending.a.membership.id,
    }),
  ).rejects.toThrow();
  expect(
    await db.auditLog.count({ where: { targetId: a.membership.id } }),
  ).toBe(before);
  expect(studentAccess(await actor(headers)).id).toBe(e.id);
});
it("audit insertion failure rolls back both sides of a transfer", async () => {
  const { a, headers } = await student();
  const e = studentAccess(a);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION foundation_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback probe'; END; $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER foundation_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION foundation_fail_audit()',
  );
  try {
    await expect(
      changeMembership(staffId, "demo-university", {
        action: "TRANSFER",
        membershipId: a.membership.id,
        expectedEnrollmentId: e.id,
        groupId: "group-2",
        reason: "Проверка отката",
      }),
    ).rejects.toThrow();
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER foundation_fail_audit ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION foundation_fail_audit()");
  }
  expect(studentAccess(await actor(headers)).id).toBe(e.id);
  expect(
    await db.groupMembership.count({
      where: { membershipId: a.membership.id },
    }),
  ).toBe(1);
});
it("a real APPROVED STAFF from a different university cannot mutate the target", async () => {
  const { a } = await student();
  const e = studentAccess(a),
    uni = "scope-" + randomUUID();
  const email = "scope-" + randomUUID() + "@example.test",
    password = randomUUID();
  const signup = await auth.api.signUpEmail({
    headers: new Headers({ origin }),
    body: { email, password, name: "Демо Иной Сотрудник" },
    asResponse: true,
  });
  if (!signup.ok) throw Error("Synthetic scope fixture unavailable");
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await db.university.create({
    data: {
      id: uni,
      name: "Вымышленный тестовый контекст",
      timezone: "Etc/UTC",
    },
  });
  const m = await db.universityMembership.create({
    data: {
      userId: user.id,
      universityId: uni,
      role: "STAFF",
      status: "APPROVED",
    },
  });
  try {
    const h = await login(email, password);
    expect(
      (
        await post(h, {
          action: "REVOKE",
          membershipId: a.membership.id,
          expectedEnrollmentId: e.id,
          reason: "Недопустимый контекст",
        })
      ).status,
    ).toBe(403);
    expect(
      await db.auditLog.count({
        where: { targetId: a.membership.id, action: "REVOKED" },
      }),
    ).toBe(0);
  } finally {
    await db.universityMembership.delete({ where: { id: m.id } });
    await db.session.deleteMany({ where: { userId: user.id } });
    await db.account.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    await db.university.delete({ where: { id: uni } });
  }
});
it("the actual partial unique indexes reject a second active enrollment and pending request", async () => {
  const { a } = await student();
  await expect(
    db.groupMembership.create({
      data: {
        membershipId: a.membership.id,
        groupId: "group-2",
        sourceId: "forbidden-duplicate",
      },
    }),
  ).rejects.toThrow();
  const p = await student(false);
  await expect(
    db.enrollmentRequest.create({
      data: { membershipId: p.a.membership.id, targetGroupId: "group-2" },
    }),
  ).rejects.toThrow();
});
it("bounded history pages use stable ordering and reject another membership's cursor", async () => {
  const { a, headers } = await student(false),
    other = await student(false);
  const prefix = "page-" + randomUUID();
  await db.enrollmentRequest.createMany({
    data: Array.from({ length: pageSize + 5 }, (_, i) => ({
      id: prefix + "-" + i,
      membershipId: a.membership.id,
      targetGroupId: "group-1",
      status: "REJECTED",
      createdAt: new Date(Date.now() - 100000 - i),
    })),
  });
  try {
    const live = await actor(headers);
    expect(live.membership.requests).toHaveLength(1);
    const first = await ownRequestPage(live);
    expect(first.items).toHaveLength(pageSize);
    expect(first.next).toBeTruthy();
    const second = await ownRequestPage(live, first.next);
    expect(
      new Set([...first.items, ...second.items].map((x) => x.id)).size,
    ).toBe(pageSize + 6);
    await expect(
      ownRequestPage(live, other.a.membership.requests[0].id),
    ).rejects.toThrow();
    const queue = await staffRequestPage(await actor(staffHeaders));
    expect(queue.items.length).toBeLessThanOrEqual(pageSize);
    await expect(staffRequestPage(live)).rejects.toThrow();
  } finally {
    await db.enrollmentRequest.deleteMany({
      where: { id: { startsWith: prefix } },
    });
  }
});
