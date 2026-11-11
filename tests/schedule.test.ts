import { staffRequestPage } from "../src/server/lists";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor } from "../src/server/security";
import { changeStructure } from "../src/server/structure";
import { changeLesson, readSchedule } from "../src/server/schedule";
import { POST as structure } from "../src/app/api/staff/structure/route";
import { POST as schedule } from "../src/app/api/staff/schedule/route";
import { GET as get } from "../src/app/api/schedule/route";
import { issueRegistrationTicket } from "../src/server/demo-identity";
import { register, decide } from "../src/server/enrollment";
import { changeMembership } from "../src/server/membership";
it("denies real foreign object IDs and inactive actors at both read and write boundaries", async () => {
  const uni = "schedule-foreign-" + randomUUID(),
    f = randomUUID(),
    p = randomUUID(),
    g = randomUUID(),
    id = randomUUID();
  await db.university.create({
    data: { id: uni, name: "Демо чужой вуз", timezone: "Europe/Moscow" },
  });
  await db.faculty.create({
    data: { id: f, name: "Демо факультет", universityId: uni },
  });
  await db.program.create({
    data: { id: p, name: "Демо программа", facultyId: f },
  });
  await db.studentGroup.create({
    data: { id: g, name: "Демо группа", programId: p },
  });
  await db.scheduleEntry.create({
    data: {
      id,
      groupId: g,
      title: "Демо чужое занятие",
      startsAt: new Date("2030-01-01T09:00:00Z"),
      endsAt: new Date("2030-01-01T10:00:00Z"),
    },
  });
  try {
    expect(
      (
        await schedule(
          req("/api/staff/schedule", staffHeaders, {
            action: "DELETE",
            id,
            version: 1,
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await structure(
          req("/api/staff/structure", staffHeaders, {
            kind: "group",
            id: g,
            version: 1,
            name: "Демо подмена",
            active: false,
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (await get(req("/api/schedule?groupId=" + g, staffHeaders))).status,
    ).toBe(403);
    expect(
      (await get(req("/api/schedule?groupId=" + g, studentHeaders))).status,
    ).toBe(403);
    await db.user.update({ where: { id: staffId }, data: { active: false } });
    expect(
      (await schedule(req("/api/staff/schedule", staffHeaders, lesson())))
        .status,
    ).toBe(403);
  } finally {
    await db.user.update({ where: { id: staffId }, data: { active: true } });
    await db.scheduleEntry.delete({ where: { id } });
    await db.studentGroup.delete({ where: { id: g } });
    await db.program.delete({ where: { id: p } });
    await db.faculty.delete({ where: { id: f } });
    await db.university.delete({ where: { id: uni } });
  }
});
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Dedicated test DB required");
const origin = process.env.BETTER_AUTH_URL!;
let staffId: string,
  staffHeaders: Headers,
  studentHeaders: Headers,
  facultyId: string,
  programId: string,
  groupId: string;
const created: string[] = [];
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
function req(path: string, headers: Headers, body?: unknown) {
  return new Request(origin + path, {
    headers,
    method: body ? "POST" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const lesson = () => ({
  action: "CREATE",
  groupId,
  title: "Демо-семинар " + randomUUID(),
  teacher: "Демо преподаватель",
  room: "Демо 101",
  day: "2027-02-10",
  start: "09:00",
  end: "10:30",
});
it("PostgreSQL itself rejects zero-length intervals and unknown schedule statuses", async () => {
  const base = {
    groupId,
    title: "Демо SQL constraint",
    startsAt: new Date("2031-01-01T09:00:00Z"),
  };
  await expect(
    db.scheduleEntry.create({ data: { ...base, endsAt: base.startsAt } }),
  ).rejects.toThrow();
  await expect(
    db.scheduleEntry.create({
      data: {
        ...base,
        endsAt: new Date("2031-01-01T10:00:00Z"),
        status: "UNKNOWN",
      },
    }),
  ).rejects.toThrow();
});
beforeAll(async () => {
  staffId = (
    await db.user.findUniqueOrThrow({ where: { email: "staff@example.test" } })
  ).id;
  staffHeaders = await login(
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  studentHeaders = await login(
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
  facultyId = (
    await changeStructure(staffId, "demo-university", {
      kind: "faculty",
      operationId: randomUUID(),
      name: "Демо новый факультет",
      active: true,
    })
  ).id;
  programId = (
    await changeStructure(staffId, "demo-university", {
      kind: "program",
      operationId: randomUUID(),
      parentId: facultyId,
      name: "Демо направление",
      active: true,
    })
  ).id;
  groupId = (
    await changeStructure(staffId, "demo-university", {
      kind: "group",
      operationId: randomUUID(),
      parentId: programId,
      name: "Демо новая группа",
      active: true,
    })
  ).id;
});
afterAll(async () => {
  for (const id of created) {
    const r = await db.enrollmentRequest.findFirst({
      where: { membershipId: id, status: "PENDING" },
    });
    if (r)
      await decide(
        staffId,
        "demo-university",
        r.id,
        "REJECTED",
        "Демо fixture завершена",
      );
  }
  await db.$disconnect();
});
it("STAFF creates structure with replay protection; student, CSRF, injection and foreign university mutations are denied", async () => {
  const input = {
    kind: "group",
    operationId: randomUUID(),
    parentId: programId,
    name: "Демо повтор",
    active: true,
  };
  const results = await Promise.all([
    structure(req("/api/staff/structure", staffHeaders, input)),
    structure(req("/api/staff/structure", staffHeaders, input)),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    (await structure(req("/api/staff/structure", studentHeaders, input)))
      .status,
  ).toBe(403);
  const bad = new Headers(staffHeaders);
  bad.set("origin", "https://bad.example.test");
  expect(
    (await schedule(req("/api/staff/schedule", bad, lesson()))).status,
  ).toBe(403);
  expect(
    (
      await schedule(
        req("/api/staff/schedule", staffHeaders, {
          ...lesson(),
          universityId: "other",
        }),
      )
    ).status,
  ).toBe(400);
  await expect(
    changeStructure(staffId, "wrong-university", {
      kind: "faculty",
      id: facultyId,
      version: 1,
      name: "Демо чужой",
      active: false,
    }),
  ).rejects.toThrow();
});
it("serializes overlapping/double submissions, permits adjacent intervals and rejects invalid dates and stale edits", async () => {
  const d = lesson();
  const r = await Promise.all([
    schedule(req("/api/staff/schedule", staffHeaders, d)),
    schedule(req("/api/staff/schedule", staffHeaders, d)),
  ]);
  expect(r.map((r) => r.status).sort()).toEqual([200, 409]);
  const id = (await r.find((r) => r.ok)!.json()).id;
  expect(
    (
      await schedule(
        req("/api/staff/schedule", staffHeaders, {
          ...d,
          start: "10:30",
          end: "12:00",
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await schedule(
        req("/api/staff/schedule", staffHeaders, { ...d, day: "2026-02-31" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await schedule(
        req("/api/staff/schedule", staffHeaders, { ...d, end: "08:00" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await schedule(
        req("/api/staff/schedule", staffHeaders, {
          ...d,
          action: "EDIT",
          id,
          version: 1,
          title: "Демо изменённое",
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await schedule(
        req("/api/staff/schedule", staffHeaders, {
          action: "CANCEL",
          id,
          version: 1,
        }),
      )
    ).status,
  ).toBe(409);
  await changeLesson(staffId, "demo-university", {
    action: "CANCEL",
    id,
    version: 2,
  });
  await changeLesson(staffId, "demo-university", {
    ...d,
    start: "09:00",
    end: "10:30",
  });
  await expect(
    changeLesson(staffId, "demo-university", {
      action: "RESTORE",
      id,
      version: 3,
    }),
  ).rejects.toThrow();
  await changeLesson(staffId, "demo-university", {
    action: "DELETE",
    id,
    version: 3,
  });
  expect(
    (await db.scheduleEntry.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("DELETED");
  expect(await db.auditLog.count({ where: { targetId: id } })).toBe(4);
});
it("new demo groups are selectable but deactivation closes study access and active registration, retaining history", async () => {
  const identity = await register(
    {
      ticket: issueRegistrationTicket("schedule"),
      universityId: "demo-university",
      facultyId,
      programId,
      groupId,
    },
    new Headers({ origin }),
    "schedule",
  );
  const h = await login(identity.email, identity.password);
  let a = await actor(h);
  created.push(a.membership.id);
  expect((await get(req("/api/schedule", h))).status).toBe(403);
  await decide(
    staffId,
    "demo-university",
    a.membership.requests[0].id,
    "REJECTED",
    "Демо отказ",
  );
  expect((await get(req("/api/schedule", h))).status).toBe(403);
  const { POST: retry } = await import("../src/app/api/enrollment/route");
  expect((await retry(req("/api/enrollment", h, { groupId }))).status).toBe(
    200,
  );
  a = await actor(h);
  await decide(
    staffId,
    "demo-university",
    a.membership.requests[0].id,
    "APPROVED",
    "Демо подтверждено",
  );
  expect(
    (await get(req("/api/schedule?view=week&day=2027-02-10", h))).status,
  ).toBe(200);
  expect((await get(req("/api/schedule?groupId=group-1", h))).status).toBe(403);
  await changeStructure(staffId, "demo-university", {
    kind: "faculty",
    id: facultyId,
    version: 1,
    name: "Демо новый факультет",
    active: false,
  });
  expect((await get(req("/api/schedule", h))).status).toBe(403);
  await expect(
    register(
      {
        ticket: issueRegistrationTicket("schedule"),
        universityId: "demo-university",
        facultyId,
        programId,
        groupId,
      },
      new Headers({ origin }),
      "schedule",
    ),
  ).rejects.toThrow();
  await changeStructure(staffId, "demo-university", {
    kind: "faculty",
    id: facultyId,
    version: 2,
    name: "Демо новый факультет",
    active: true,
  });
  a = await actor(h);
  const current = a.membership.enrollments[0];
  await changeMembership(staffId, "demo-university", {
    action: "TRANSFER",
    membershipId: a.membership.id,
    expectedEnrollmentId: current.id,
    groupId: "group-2",
    reason: "Демо перевод",
  });
  expect((await get(req("/api/schedule?groupId=" + groupId, h))).status).toBe(
    403,
  );
  expect(
    (await readSchedule(await actor(h), { view: "week", day: "2027-02-10" }))
      .groupId,
  ).toBe("group-2");
  a = await actor(h);
  await changeMembership(staffId, "demo-university", {
    action: "REVOKE",
    membershipId: a.membership.id,
    expectedEnrollmentId: a.membership.enrollments[0].id,
    reason: "Демо отзыв",
  });
  expect((await get(req("/api/schedule", h))).status).toBe(403);
});
it("rolls back schedule changes if immutable audit insertion cannot complete", async () => {
  await db.$executeRawUnsafe(
    `CREATE FUNCTION schedule_probe_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'probe'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER schedule_probe_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION schedule_probe_fail()`,
  );
  const d = { ...lesson(), day: "2027-02-12" };
  try {
    await expect(changeLesson(staffId, "demo-university", d)).rejects.toThrow();
    expect(await db.scheduleEntry.count({ where: { title: d.title } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER schedule_probe_fail ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION schedule_probe_fail()");
  }
});

it("deactivated program blocks approval but pending rejection remains available with truthful queue status", async () => {
  const identity = await register(
    {
      ticket: issueRegistrationTicket("schedule"),
      universityId: "demo-university",
      facultyId,
      programId,
      groupId,
    },
    new Headers({ origin }),
    "schedule",
  );
  const h = await login(identity.email, identity.password),
    a = await actor(h);
  created.push(a.membership.id);
  const program = await db.program.findUniqueOrThrow({
    where: { id: programId },
  });
  await changeStructure(staffId, "demo-university", {
    kind: "program",
    id: programId,
    version: program.version,
    name: program.name,
    active: false,
  });
  try {
    const staffActor = await actor(staffHeaders);
    let queue = await staffRequestPage(staffActor);
    while (
      !queue.items.some((r) => r.id === a.membership.requests[0].id) &&
      queue.next
    )
      queue = await staffRequestPage(staffActor, queue.next);
    const r = queue.items.find((r) => r.id === a.membership.requests[0].id);
    expect(r?.targetGroup.program.active).toBe(false);
    await expect(
      decide(
        staffId,
        "demo-university",
        a.membership.requests[0].id,
        "APPROVED",
        "Демо проверка",
      ),
    ).rejects.toThrow();
    await decide(
      staffId,
      "demo-university",
      a.membership.requests[0].id,
      "REJECTED",
      "Демо структура недоступна",
    );
    expect((await actor(h)).membership.status).toBe("REJECTED");
  } finally {
    await changeStructure(staffId, "demo-university", {
      kind: "program",
      id: programId,
      version: program.version + 1,
      name: program.name,
      active: true,
    });
  }
});
