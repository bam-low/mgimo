import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor } from "../src/server/security";
import {
  changeBuilder,
  builderWeek,
  type BuilderCommand,
} from "../src/server/semester-builder";
import { changeLesson, readSchedule } from "../src/server/schedule";
import { POST, GET } from "../src/app/api/staff/schedule/builder/route";
import type { Calendar, Rule } from "../src/lib/semester";
import { dayKey } from "../src/lib/schedule-time";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Isolated test DB required");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
const facultyId = randomUUID(),
  programId = randomUUID(),
  groups = [randomUUID(), randomUUID(), randomUUID()],
  otherProgram = randomUUID(),
  otherGroup = randomUUID(),
  subjectId = randomUUID();
const teachers = [randomUUID(), randomUUID()],
  rooms = [randomUUID(), randomUUID()];
const calendar: Calendar = {
  name: "Демо свободный учебный цикл " + randomUUID(),
  start: "2034-02-01",
  end: "2034-03-31",
  anchor: "2034-01-30",
  exclusions: [
    { from: "2034-02-13", to: "2034-02-13", reason: "Демо исключение" },
  ],
};
const semesterId = randomUUID();
const rule: Rule = {
  subjectId,
  teacherId: teachers[0],
  roomId: rooms[0],
  groupIds: [groups[0]],
  recurrence: "EVERY",
  weekday: 1,
  once: "2034-02-06",
  startTime: "09:00",
  endTime: "10:30",
};
let staffId: string, sh: Headers, uh: Headers;
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
async function preview(command: BuilderCommand) {
  return changeBuilder(staffId, uni, { command, preview: true });
}
async function commit(command: BuilderCommand) {
  const p = await preview(command);
  return changeBuilder(staffId, uni, {
    command,
    preview: false,
    token: p.token,
    confirmed: true,
  });
}
function create(r: Partial<Rule> = {}, sid = semesterId): BuilderCommand {
  return {
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId: sid,
    programId,
    rule: { ...rule, ...r },
  };
}
function req(h: Headers, body?: unknown, query = "") {
  return new Request(origin + "/api/staff/schedule/builder" + query, {
    method: body ? "POST" : "GET",
    headers: h,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
beforeAll(async () => {
  sh = await login("staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
  uh = await login(
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
  staffId = (await actor(sh)).user.id;
  await db.faculty.create({
    data: { id: facultyId, universityId: uni, name: "Демо конструктор" },
  });
  await db.program.create({
    data: { id: programId, facultyId, name: "Демо направление конструктора" },
  });
  await db.program.create({
    data: { id: otherProgram, facultyId, name: "Демо другое направление" },
  });
  await db.studentGroup.createMany({
    data: groups
      .map((id, i) => ({ id, programId, name: `Демо К-${i + 1}` }))
      .concat([
        {
          id: otherGroup,
          programId: otherProgram,
          name: "Демо другое направление",
        },
      ]),
  });
  await db.subject.create({
    data: {
      id: subjectId,
      universityId: uni,
      name: "Демо семестровая дисциплина",
    },
  });
  for (const operationId of teachers)
    await commit({
      action: "TEACHER_CREATE",
      operationId,
      name: "Демо преподаватель " + operationId.slice(0, 4),
      subjectIds: [subjectId],
    });
  for (const operationId of rooms)
    await commit({
      action: "ROOM_CREATE",
      operationId,
      building: "Демо корпус",
      number: operationId.slice(0, 8),
    });
  await commit({
    action: "SEMESTER_CREATE",
    operationId: semesterId,
    calendar,
  });
});
afterAll(async () => {
  await db.$disconnect();
});
it("publishes actual semester dates, previews excluded slots and uses the same Subject as grades", async () => {
  const d = create(),
    p = await preview(d);
  expect(p.dates.map((e) => e.day)).toEqual([
    "2034-02-06",
    "2034-02-20",
    "2034-02-27",
    "2034-03-06",
    "2034-03-13",
    "2034-03-20",
    "2034-03-27",
  ]);
  expect(p.skipped).toEqual(["2034-02-13"]);
  expect(
    await db.scheduleTemplate.findUnique({ where: { id: p.id } }),
  ).toBeNull();
  await commit(d);
  expect(
    await db.scheduleEntry.count({ where: { templateId: p.id, subjectId } }),
  ).toBe(7);
  await expect(commit(d)).rejects.toMatchObject({ status: 409 });
  // Adjacent intervals are legal, identical subject with different resources/groups is legal.
  await commit(
    create({ groupIds: [groups[1]], teacherId: teachers[1], roomId: rooms[1] }),
  );
  await commit(create({ startTime: "10:30", endTime: "11:00" }));
});
it("globally checks teacher/room across programs and atomic group conflicts on every generated date", async () => {
  for (const patch of [
    { groupIds: [groups[2]], teacherId: teachers[0], roomId: rooms[1] },
    { groupIds: [groups[2]], teacherId: teachers[1], roomId: rooms[0] },
    { groupIds: [groups[0]], teacherId: null, roomId: null },
  ]) {
    const d = create(patch);
    await expect(commit(d)).rejects.toMatchObject({ status: 409 });
    expect(
      await db.scheduleTemplate.findUnique({
        where: { id: "operationId" in d ? d.operationId : "" },
      }),
    ).toBeNull();
  }
  await expect(
    commit({
      ...create({ groupIds: [otherGroup], roomId: null }),
      programId: otherProgram,
    } as BuilderCommand),
  ).rejects.toThrow(/преподаватель/);
  await expect(
    commit(create({ groupIds: [otherGroup] })),
  ).rejects.toMatchObject({ status: 400 });
});
it("one shared occurrence is read once by each group, both builder modes agree; legacy writers cannot bypass its locks", async () => {
  const d = create({
      recurrence: "ONCE",
      once: "2034-02-07",
      groupIds: groups,
    }),
    p = await commit(d);
  const entries = await db.scheduleEntry.findMany({
    where: { templateId: p.id },
  });
  expect(entries).toHaveLength(1);
  expect(
    await db.scheduleGroup.count({
      where: { entryId: entries[0].id, active: true },
    }),
  ).toBe(3);
  const staff = await actor(sh);
  for (const groupId of groups) {
    const r = await readSchedule(staff, { groupId, day: "2034-02-07" });
    expect(r.lessons.map((e) => e.id)).toEqual([entries[0].id]);
    const w = await builderWeek(uni, {
      semesterId,
      programId,
      from: "2034-02-06",
      groupId,
    });
    expect(w.entries.filter((e) => e.id === entries[0].id)).toHaveLength(1);
    await expect(
      changeLesson(staffId, uni, {
        action: "CREATE",
        groupId,
        title: "Демо пересечение",
        teacher: "",
        room: "",
        day: "2034-02-07",
        start: "09:15",
        end: "10:00",
      }),
    ).rejects.toMatchObject({ status: 409 });
  }
  await expect(
    changeLesson(staffId, uni, {
      action: "CANCEL",
      id: entries[0].id,
      version: 1,
    }),
  ).rejects.toThrow(/конструкторе/);
  await commit({ action: "OCCURRENCE_CANCEL", id: entries[0].id, version: 1 });
  for (const groupId of groups)
    expect(
      (await readSchedule(staff, { groupId, day: "2034-02-07" })).lessons[0]
        .status,
    ).toBe("CANCELLED");
  const replacement = await commit(
    create({ recurrence: "ONCE", once: "2034-02-07" }),
  );
  await expect(
    commit({ action: "OCCURRENCE_RESTORE", id: entries[0].id, version: 2 }),
  ).rejects.toMatchObject({ status: 409 });
  const replacementEntry = await db.scheduleEntry.findFirstOrThrow({
    where: { templateId: replacement.id },
  });
  await commit({
    action: "OCCURRENCE_DELETE",
    id: replacementEntry.id,
    version: 1,
  });
  await commit({ action: "OCCURRENCE_RESTORE", id: entries[0].id, version: 2 });
  const base = {
    action: "DETACH" as const,
    id: entries[0].id,
    version: 3,
    operationId: randomUUID(),
    groupId: groups[2],
    day: "2034-02-07",
    subjectId,
    teacherId: teachers[0],
    roomId: rooms[0],
    startTime: "09:00",
    endTime: "10:30",
  };
  await expect(commit(base)).rejects.toMatchObject({ status: 409 });
  expect(
    await db.scheduleGroup.count({
      where: { entryId: entries[0].id, active: true },
    }),
  ).toBe(3);
  await commit({ ...base, startTime: "13:00", endTime: "14:30" });
  expect(
    await db.scheduleGroup.count({
      where: { entryId: entries[0].id, active: true },
    }),
  ).toBe(2);
  expect(
    await db.scheduleEntry.findUniqueOrThrow({
      where: { id: base.operationId },
    }),
  ).toMatchObject({ sourceEntryId: entries[0].id, manual: true });
  expect(
    await db.auditLog.count({
      where: { targetId: entries[0].id, action: "OCCURRENCE_DETACH" },
    }),
  ).toBe(1);
});
it("rechecks preview at commit, serialises two concurrent batches and rejects replay and stale versions", async () => {
  const one = create({
      recurrence: "ONCE",
      once: "2034-02-08",
      teacherId: null,
      roomId: null,
    }),
    two = create({
      recurrence: "ONCE",
      once: "2034-02-08",
      teacherId: null,
      roomId: null,
    });
  const [p1, p2] = await Promise.all([preview(one), preview(two)]);
  const result = await Promise.allSettled([
    changeBuilder(staffId, uni, {
      command: one,
      preview: false,
      token: p1.token,
      confirmed: true,
    }),
    changeBuilder(staffId, uni, {
      command: two,
      preview: false,
      token: p2.token,
      confirmed: true,
    }),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.scheduleEntry.count({
      where: { templateId: { in: [p1.id, p2.id] } },
    }),
  ).toBe(1);
  const noConfirm = create({
    recurrence: "ONCE",
    once: "2034-02-09",
    teacherId: null,
    roomId: null,
  });
  await expect(
    changeBuilder(staffId, uni, {
      command: noConfirm,
      preview: false,
      token: (await preview(noConfirm)).token,
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("future regeneration preserves past, moved single slots and manual cancellations; invalidating manual entries blocks calendar edits", async () => {
  const s = randomUUID(),
    c: Calendar = {
      name: "Демо ручные исключения " + s,
      start: "2024-01-01",
      end: "2036-01-31",
      anchor: "2024-01-01",
      exclusions: [],
    };
  await commit({ action: "SEMESTER_CREATE", operationId: s, calendar: c });
  const p = await commit(
    create(
      {
        groupIds: [groups[2]],
        recurrence: "A",
        weekday: 7,
        teacherId: null,
        roomId: null,
        startTime: "16:00",
        endTime: "17:00",
      },
      s,
    ),
  );
  const all = await db.scheduleEntry.findMany({
      where: { templateId: p.id },
      orderBy: { startsAt: "asc" },
    }),
    past = all.find((e) => e.startsAt < new Date())!,
    future = all.filter((e) => e.startsAt > new Date());
  const moved = future[0],
    canceled = future[1];
  const day = dayKey(moved.startsAt, "Europe/Moscow");
  await commit({
    action: "OCCURRENCE_EDIT",
    id: moved.id,
    version: 1,
    day,
    subjectId,
    teacherId: null,
    roomId: null,
    startTime: "18:00",
    endTime: "19:00",
  });
  await commit({ action: "OCCURRENCE_CANCEL", id: canceled.id, version: 1 });
  await commit({
    action: "TEMPLATE_FUTURE",
    id: p.id,
    version: 1,
    from: dayKey(new Date(), "Europe/Moscow"),
    rule: {
      ...rule,
      groupIds: [groups[2]],
      recurrence: "A",
      weekday: 7,
      teacherId: null,
      roomId: null,
      startTime: "14:00",
      endTime: "15:00",
    },
  });
  expect(
    await db.scheduleEntry.findUniqueOrThrow({ where: { id: past.id } }),
  ).toEqual(past);
  expect(
    await db.scheduleEntry.findUniqueOrThrow({ where: { id: moved.id } }),
  ).toMatchObject({ version: 2, manual: true });
  expect(
    await db.scheduleEntry.findUniqueOrThrow({ where: { id: canceled.id } }),
  ).toMatchObject({ status: "CANCELLED", version: 2 });
  expect(
    await db.scheduleEntry.count({
      where: { templateId: p.id, slotDay: moved.slotDay, status: "SCHEDULED" },
    }),
  ).toBe(1);
  const edit: BuilderCommand = {
    action: "SEMESTER_EDIT",
    id: s,
    version: 1,
    calendar: {
      ...c,
      exclusions: [{ from: day, to: day, reason: "Демо новый выходной" }],
    },
  };
  await expect(commit(edit)).rejects.toThrow(/Ручное занятие/);
  await commit({ action: "OCCURRENCE_CANCEL", id: moved.id, version: 2 });
  await commit(edit);
  expect(
    await db.scheduleEntry.findUniqueOrThrow({ where: { id: past.id } }),
  ).toEqual(past);
  await commit({ ...edit, version: 2, calendar: c });
  expect(
    await db.scheduleEntry.count({
      where: { templateId: p.id, slotDay: moved.slotDay, status: "SCHEDULED" },
    }),
  ).toBe(0);
  expect(
    await db.scheduleEntry.count({
      where: {
        templateId: p.id,
        slotDay: canceled.slotDay,
        status: "SCHEDULED",
      },
    }),
  ).toBe(0);
});
it("arbitrary years, overlapping semesters and duplicate names are explicit; real API denies CSRF, role spoofing, foreign IDs and extra fields", async () => {
  const c: Calendar = {
      name: "Демо цикл 2140 " + randomUUID(),
      start: "2140-02-01",
      end: "2140-03-05",
      anchor: "2140-02-01",
      exclusions: [],
    },
    sid = randomUUID();
  await commit({ action: "SEMESTER_CREATE", operationId: sid, calendar: c });
  await commit(
    create(
      { recurrence: "ONCE", once: "2140-02-02", teacherId: null, roomId: null },
      sid,
    ),
  );
  expect(
    (
      await readSchedule(await actor(sh), {
        groupId: groups[0],
        day: "2140-02-02",
      })
    ).lessons,
  ).toHaveLength(1);
  await expect(
    commit({
      action: "SEMESTER_CREATE",
      operationId: randomUUID(),
      calendar: { ...c, name: ` ${c.name.toUpperCase()} ` },
    }),
  ).rejects.toThrow(/названием/);
  expect(
    (
      await preview({
        action: "SEMESTER_CREATE",
        operationId: randomUUID(),
        calendar: { ...c, name: c.name + " другой" },
      })
    ).warnings.join(),
  ).toMatch(/пересекается/);
  const command = create({ recurrence: "ONCE", once: "2034-02-10" });
  expect((await POST(req(uh, { command, preview: true }))).status).toBe(403);
  const bad = new Headers(sh);
  bad.set("origin", "https://bad.example.test");
  expect((await POST(req(bad, { command, preview: true }))).status).toBe(403);
  expect(
    (
      await POST(
        req(sh, {
          command: { ...command, universityId: "other" },
          preview: true,
        }),
      )
    ).status,
  ).toBe(400);
  expect((await GET(req(uh))).status).toBe(403);
  const r = await GET(req(sh));
  expect(r.status).toBe(200);
  expect(r.headers.get("cache-control")).toBe("private, no-store");
  expect(JSON.stringify(await r.json())).not.toMatch(
    /password|email|membership|session/,
  );
  await expect(
    commit(create({ subjectId: randomUUID() })),
  ).rejects.toMatchObject({ status: 400 });
  await expect(commit(create({}, randomUUID()))).rejects.toMatchObject({
    status: 404,
  });
  await db.user.update({ where: { id: staffId }, data: { active: false } });
  try {
    await expect(preview(command)).rejects.toMatchObject({ status: 403 });
  } finally {
    await db.user.update({ where: { id: staffId }, data: { active: true } });
  }
});
it("audit insertion failure rolls the entire batch back, including template and group links", async () => {
  const command = create({ recurrence: "ONCE", once: "2034-02-11" }),
    p = await preview(command);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION semester_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='OCCURRENCE_PUBLISH' THEN RAISE EXCEPTION 'test refusal'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER semester_audit_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION semester_audit_fail()',
  );
  try {
    await expect(
      changeBuilder(staffId, uni, {
        command,
        preview: false,
        token: p.token,
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(
      await db.scheduleTemplate.findUnique({ where: { id: p.id } }),
    ).toBeNull();
    expect(await db.scheduleEntry.count({ where: { templateId: p.id } })).toBe(
      0,
    );
    expect(await db.templateGroup.count({ where: { templateId: p.id } })).toBe(
      0,
    );
    expect(await db.auditLog.count({ where: { targetId: p.id } })).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER semester_audit_fail ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION semester_audit_fail()");
  }
});
it("calendar regeneration retains different effective rules before/after a future cutoff; notes alone never rewrite occurrences", async () => {
  const sid = randomUUID(),
    c: Calendar = {
      name: "Демо периоды правил " + sid,
      start: "2040-01-01",
      end: "2040-02-29",
      anchor: "2040-01-02",
      exclusions: [],
    };
  await commit({ action: "SEMESTER_CREATE", operationId: sid, calendar: c });
  const r: Rule = {
    ...rule,
    groupIds: [groups[2]],
    teacherId: null,
    roomId: null,
    weekday: 2,
    startTime: "19:00",
    endTime: "20:00",
  };
  const template = await commit(create(r, sid));
  await commit({
    action: "TEMPLATE_FUTURE",
    id: template.id,
    version: 1,
    from: "2040-02-01",
    rule: { ...r, startTime: "20:00", endTime: "21:00" },
  });
  const old = await db.scheduleEntry.findMany({
    where: { templateId: template.id },
    orderBy: { id: "asc" },
  });
  await commit({
    action: "SEMESTER_EDIT",
    id: sid,
    version: 1,
    calendar: { ...c, name: c.name + " уточнение" },
  });
  expect(
    await db.scheduleEntry.findMany({
      where: { templateId: template.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(old);
  await commit({
    action: "SEMESTER_EDIT",
    id: sid,
    version: 2,
    calendar: { ...c, end: "2040-03-31" },
  });
  const active = await db.scheduleEntry.findMany({
    where: { templateId: template.id, status: "SCHEDULED" },
    orderBy: { startsAt: "asc" },
  });
  expect(
    active
      .filter((e) => e.slotDay! < "2040-02-01")
      .every((e) => e.startsAt.getUTCHours() === 16),
  ).toBe(true);
  expect(
    active
      .filter((e) => e.slotDay! >= "2040-02-01")
      .every((e) => e.startsAt.getUTCHours() === 17),
  ).toBe(true);
  expect(new Set(active.map((e) => e.slotDay)).size).toBe(active.length);
});
it("resource lifecycle, strict university references, stale versions and student shared-occurrence DTO are enforced", async () => {
  const foreign = randomUUID(),
    room = randomUUID(),
    subj = randomUUID(),
    teacher = randomUUID();
  await db.university.create({
    data: { id: foreign, name: "Демо внешний вуз", timezone: "Europe/Moscow" },
  });
  await db.subject.create({
    data: { id: subj, universityId: foreign, name: "Демо внешняя дисциплина" },
  });
  await db.teacher.create({
    data: {
      id: teacher,
      universityId: foreign,
      name: "Демо внешний преподаватель",
    },
  });
  await db.room.create({
    data: {
      id: room,
      universityId: foreign,
      building: "Демо внешний",
      number: "101",
      nameKey: "external",
    },
  });
  try {
    for (const patch of [
      { subjectId: subj },
      { teacherId: teacher },
      { roomId: room },
    ])
      await expect(
        commit(create({ recurrence: "ONCE", once: "2034-02-14", ...patch })),
      ).rejects.toMatchObject({ status: 400 });
    await expect(
      commit({
        action: "TEACHER_CREATE",
        operationId: randomUUID(),
        name: "Демо подмена",
        subjectIds: [subj],
      }),
    ).rejects.toMatchObject({ status: 403 });
    const cancelledTemplate = await commit(
      create({ recurrence: "ONCE", once: "2034-02-21" }),
    );
    const cancelled = await db.scheduleEntry.findFirstOrThrow({
      where: { templateId: cancelledTemplate.id },
    });
    await commit({ action: "OCCURRENCE_CANCEL", id: cancelled.id, version: 1 });
    const cancelledEdit = {
      action: "OCCURRENCE_EDIT" as const,
      id: cancelled.id,
      version: 2,
      day: "2034-02-21",
      startTime: "09:00",
      endTime: "10:30",
      subjectId,
      teacherId: teachers[0],
      roomId: rooms[0],
    };
    for (const patch of [
      { subjectId: subj },
      { teacherId: teacher },
      { roomId: room },
    ]) {
      expect(
        (
          await POST(
            req(sh, { command: { ...cancelledEdit, ...patch }, preview: true }),
          )
        ).status,
      ).toBe(400);
    }
    expect(
      await db.scheduleEntry.findUniqueOrThrow({ where: { id: cancelled.id } }),
    ).toMatchObject({
      version: 2,
      status: "CANCELLED",
      subjectId,
      teacherId: teachers[0],
      roomId: rooms[0],
    });
    await commit({
      ...cancelledEdit,
      teacherId: teachers[1],
      roomId: rooms[1],
    });
    const namedTeacher = await db.teacher.findUniqueOrThrow({
      where: { id: teachers[1] },
    });
    expect(
      await db.scheduleEntry.findUniqueOrThrow({ where: { id: cancelled.id } }),
    ).toMatchObject({
      version: 3,
      status: "CANCELLED",
      teacher: namedTeacher.name,
      teacherId: teachers[1],
      roomId: rooms[1],
    });
    const t = await db.teacher.findUniqueOrThrow({
      where: { id: teachers[0] },
    });
    const edit: BuilderCommand = {
      action: "TEACHER_EDIT",
      id: t.id,
      version: t.version,
      name: t.name + " уточнение",
      active: false,
      subjectIds: [subjectId],
    };
    await commit(edit);
    await expect(commit(edit)).rejects.toMatchObject({ status: 409 });
    await expect(
      commit(create({ recurrence: "ONCE", once: "2034-02-14" })),
    ).rejects.toMatchObject({ status: 400 });
    await commit({ ...edit, version: t.version + 1, active: true });
    const a = await actor(uh),
      groupId = a.membership.enrollments[0].groupId,
      g = await db.studentGroup.findUniqueOrThrow({ where: { id: groupId } });
    const s = randomUUID(),
      calendar: Calendar = {
        name: "Демо студент " + s,
        start: "2044-01-01",
        end: "2044-01-31",
        anchor: "2043-12-28",
        exclusions: [],
      };
    await commit({ action: "SEMESTER_CREATE", operationId: s, calendar });
    const template = await commit({
      action: "TEMPLATE_CREATE",
      operationId: randomUUID(),
      semesterId: s,
      programId: g.programId,
      rule: {
        ...rule,
        recurrence: "ONCE",
        once: "2044-01-12",
        groupIds: [groupId],
        teacherId: null,
        roomId: null,
      },
    });
    const mine = await readSchedule(a, { day: "2044-01-12" });
    expect(mine.lessons).toHaveLength(1);
    expect(mine.lessons[0].id).toContain(template.id);
    expect(JSON.stringify(mine)).not.toMatch(
      /groupIds|templateId|subjectId|teacherId|roomId/,
    );
    await expect(
      readSchedule(a, { day: "2044-01-12", groupId: groups[0] }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      db.scheduleEntry.create({
        data: {
          id: randomUUID(),
          universityId: uni,
          groupId: groups[0],
          semesterId,
          subjectId: subj,
          title: "Демо FK",
          startsAt: new Date("2044-01-12T06:00:00Z"),
          endsAt: new Date("2044-01-12T07:00:00Z"),
          slotDay: "2044-01-12",
        },
      }),
    ).rejects.toThrow();
  } finally {
    await db.room.delete({ where: { id: room } });
    await db.teacher.delete({ where: { id: teacher } });
    await db.subject.delete({ where: { id: subj } });
    await db.university.delete({ where: { id: foreign } });
  }
});

it("counts excluded occurrences from different templates separately while deduplicating the excluded date list", async () => {
  const p = await preview({
    action: "SEMESTER_EDIT",
    id: semesterId,
    version: 1,
    calendar: {
      ...calendar,
      end: "2034-04-07",
      exclusions: [...calendar.exclusions, ...calendar.exclusions],
    },
  });
  expect(p.skipped).toEqual(["2034-02-13"]);
  expect(p.skippedCount).toBe(3);
});

it("reuses explicit lecture/seminar assignments, binds preview versions and preserves published snapshots", async () => {
  const assignmentId = randomUUID();
  const a: BuilderCommand = {
    action: "ASSIGNMENT_CREATE",
    operationId: assignmentId,
    programId,
    subjectId,
    kind: "LECTURE",
    groups: groups
      .slice(0, 2)
      .map((groupId) => ({ groupId, teacherId: teachers[0] })),
  };
  await commit(a);
  const rule = {
    subjectId,
    teacherId: teachers[0],
    roomId: rooms[0],
    groupIds: groups.slice(0, 2),
    recurrence: "B" as const,
    weekday: 3,
    once: "2040-09-04",
    startTime: "17:00",
    endTime: "18:00",
  };
  const sid = randomUUID();
  await commit({
    action: "SEMESTER_CREATE",
    operationId: sid,
    calendar: {
      name: "Демо каталог " + sid,
      start: "2040-09-04",
      end: "2040-09-30",
      anchor: "2040-09-03",
      exclusions: [],
    },
  });
  const placement: BuilderCommand = {
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId: sid,
    programId,
    assignment: { id: assignmentId, version: 1 },
    rule,
  };
  const p = await preview(placement);
  expect(p.dates.length).toBeGreaterThan(0);
  expect(p.dates[0].groups).toHaveLength(2);
  await expect(
    preview({ ...placement, rule: { ...rule, groupIds: [groups[0]] } }),
  ).rejects.toMatchObject({ status: 409 });
  await changeBuilder(staffId, uni, {
    command: placement,
    preview: false,
    token: p.token,
    confirmed: true,
  });
  const snapshots = await db.scheduleEntry.findMany({
    where: { templateId: placement.operationId },
    orderBy: { id: "asc" },
  });
  const stale = {
    ...placement,
    operationId: randomUUID(),
    rule: { ...rule, startTime: "19:00", endTime: "20:00" },
  };
  const stalePreview = await preview(stale);
  await commit({
    action: "ASSIGNMENT_EDIT",
    id: assignmentId,
    version: 1,
    active: true,
    programId,
    subjectId,
    kind: "LECTURE",
    groups: [{ groupId: groups[0], teacherId: teachers[1] }],
  });
  await expect(
    changeBuilder(staffId, uni, {
      command: stale,
      preview: false,
      token: stalePreview.token,
      confirmed: true,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await db.scheduleEntry.findMany({
      where: { templateId: placement.operationId },
      orderBy: { id: "asc" },
    }),
  ).toEqual(snapshots);
  const seminar = randomUUID();
  await commit({
    action: "ASSIGNMENT_CREATE",
    operationId: seminar,
    programId,
    subjectId,
    kind: "SEMINAR",
    groups: [
      { groupId: groups[0], teacherId: teachers[0] },
      { groupId: groups[1], teacherId: teachers[1] },
    ],
  });
  const seminarPlacement: BuilderCommand = {
    ...placement,
    operationId: randomUUID(),
    assignment: { id: seminar, version: 1, groupId: groups[1] },
    rule: {
      ...rule,
      groupIds: [groups[1]],
      teacherId: teachers[1],
      startTime: "20:00",
      endTime: "21:00",
    },
  };
  await commit(seminarPlacement);
  expect(
    await db.scheduleGroup.count({
      where: {
        entry: { templateId: seminarPlacement.operationId },
        groupId: groups[0],
      },
    }),
  ).toBe(0);
  const edits: BuilderCommand = {
    action: "ASSIGNMENT_EDIT",
    id: seminar,
    version: 1,
    active: true,
    programId,
    subjectId,
    kind: "SEMINAR",
    groups: [{ groupId: groups[0], teacherId: teachers[1] }],
  };
  const q = await preview(edits);
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      changeBuilder(staffId, uni, {
        command: edits,
        preview: false,
        token: q.token,
        confirmed: true,
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.teachingAssignmentGroup.count({
      where: { assignmentId, groupId: groups[2] },
    }),
  ).toBe(0);
});

it("assignment commands enforce STAFF, same-origin, university scope, active links and audit rollback", async () => {
  const operationId = randomUUID();
  const command: BuilderCommand = {
    action: "ASSIGNMENT_CREATE",
    operationId,
    programId,
    subjectId,
    kind: "LECTURE",
    groups: [{ groupId: groups[0], teacherId: teachers[0] }],
  };
  expect((await POST(req(uh, { command, preview: true }))).status).toBe(403);
  const cross = new Headers(sh);
  cross.set("origin", "https://foreign.invalid");
  expect((await POST(req(cross, { command, preview: true }))).status).toBe(403);
  const foreignUniversity = randomUUID(),
    foreignSubject = randomUUID();
  await db.university.create({
    data: {
      id: foreignUniversity,
      name: "Демо чужой контекст",
      timezone: "Europe/Moscow",
    },
  });
  await db.subject.create({
    data: {
      id: foreignSubject,
      universityId: foreignUniversity,
      name: "Демо чужая дисциплина",
    },
  });
  await expect(
    preview({ ...command, subjectId: foreignSubject }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    preview({
      ...command,
      groups: [{ groupId: otherGroup, teacherId: teachers[0] }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  const unrelated = randomUUID();
  await commit({
    action: "TEACHER_CREATE",
    operationId: unrelated,
    name: "Демо без назначения",
    subjectIds: [],
  });
  await expect(
    preview({
      ...command,
      groups: [{ groupId: groups[0], teacherId: unrelated }],
    }),
  ).rejects.toMatchObject({ status: 400 });
  // A valid independent assignment must roll back only because of the deliberate audit failure.
  const own = randomUUID();
  await db.subject.create({
    data: { id: own, universityId: uni, name: "Демо атомарное назначение" },
  });
  await commit({
    action: "TEACHER_EDIT",
    id: unrelated,
    version: 1,
    active: true,
    name: "Демо без назначения",
    subjectIds: [own],
  });
  const atomic: BuilderCommand = {
    ...command,
    subjectId: own,
    groups: [{ groupId: groups[0], teacherId: unrelated }],
  };
  const p = await preview(atomic);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION assignment_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ASSIGNMENT_CREATE' THEN RAISE EXCEPTION 'test refusal'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER assignment_audit_fail BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION assignment_audit_fail()',
  );
  try {
    await expect(
      changeBuilder(staffId, uni, {
        command: atomic,
        preview: false,
        token: p.token,
        confirmed: true,
      }),
    ).rejects.toThrow();
    expect(
      await db.teachingAssignment.count({ where: { id: operationId } }),
    ).toBe(0);
    expect(
      await db.teachingAssignmentGroup.count({
        where: { assignmentId: operationId },
      }),
    ).toBe(0);
    expect(await db.auditLog.count({ where: { targetId: operationId } })).toBe(
      0,
    );
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER assignment_audit_fail ON "AuditLog"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION assignment_audit_fail()");
  }
});
