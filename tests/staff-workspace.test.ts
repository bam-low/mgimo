import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor } from "../src/server/security";
import { changeStructure } from "../src/server/structure";
import {
  changeBuilder,
  type BuilderCommand,
} from "../src/server/semester-builder";
import { issueRegistrationTicket } from "../src/server/demo-identity";
import { register, decide } from "../src/server/enrollment";
import { changeMembership } from "../src/server/membership";
import {
  listNotifications,
  notificationDetail,
} from "../src/server/notifications";

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Isolated test DB required");
const universityId = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
async function login(email: string, password: string) {
  const response = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const headers = new Headers({
    cookie: response.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  return { a: await actor(headers), headers };
}
afterAll(() => db.$disconnect());
it("два курса → семестр со вторника → числитель → атомарная отмена и уведомления без дублей, IDOR и отзыв", async () => {
  const { a: staff } = await login(
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  const create = async (
    kind: "faculty" | "program" | "group",
    parentId?: string,
    course?: number,
  ) =>
    changeStructure(staff.user.id, universityId, {
      kind,
      name: "Демо учебный путь " + randomUUID().slice(0, 8),
      active: true,
      operationId: randomUUID(),
      ...(parentId ? { parentId } : {}),
      ...(course ? { course } : {}),
    });
  const f = await create("faculty"),
    p = await create("program", f.id);
  const groups = [
    await create("group", p.id, 1),
    await create("group", p.id, 2),
  ];
  const students: Awaited<ReturnType<typeof actor>>[] = [];
  for (const group of groups) {
    const identity = await register(
      {
        ticket: issueRegistrationTicket("staff-workspace"),
        universityId,
        facultyId: f.id,
        programId: p.id,
        groupId: group.id,
      },
      new Headers({ origin }),
      "staff-workspace",
    );
    const { a: student, headers } = await login(
      identity.email,
      identity.password,
    );
    await decide(
      staff.user.id,
      universityId,
      student.membership.requests[0].id,
      "APPROVED",
      "Демо прикрепление",
    );
    students.push(await actor(headers));
  }
  async function commit(command: BuilderCommand) {
    const preview = await changeBuilder(staff.user.id, universityId, {
      command,
      preview: true,
    });
    return changeBuilder(staff.user.id, universityId, {
      command,
      preview: false,
      token: preview.token,
      confirmed: true,
    });
  }
  const semesterId = randomUUID(),
    subjectId = randomUUID(),
    teacherId = randomUUID(),
    roomId = randomUUID();
  await db.subject.create({
    data: {
      id: subjectId,
      universityId,
      name: "Демо общая дисциплина " + subjectId,
    },
  });
  await commit({
    action: "TEACHER_CREATE",
    operationId: teacherId,
    name: "Демо преподаватель",
    subjectIds: [subjectId],
  });
  await commit({
    action: "ROOM_CREATE",
    operationId: roomId,
    building: "Демо корпус",
    number: roomId.slice(0, 8),
  });
  await commit({
    action: "SEMESTER_CREATE",
    operationId: semesterId,
    calendar: {
      name: "Демо вторник",
      start: "2037-09-01",
      end: "2037-09-30",
      anchor: "2037-08-31",
      exclusions: [],
    },
  });
  const rule = {
    subjectId,
    teacherId,
    roomId,
    groupIds: groups.map((g) => g.id),
    recurrence: "A" as const,
    weekday: 2,
    once: "2037-09-01",
    startTime: "09:00",
    endTime: "10:30",
  };
  const template = await commit({
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId,
    programId: p.id,
    rule,
  });
  expect(template.dates.map((d) => d.day)).toEqual([
    "2037-09-01",
    "2037-09-15",
    "2037-09-29",
  ]);
  const entries = await db.scheduleEntry.findMany({
    where: { templateId: template.id },
    orderBy: { startsAt: "asc" },
  });
  const command = {
    action: "OCCURRENCE_CANCEL" as const,
    id: entries[0].id,
    version: 1,
  };
  const result = await Promise.allSettled([commit(command), commit(command)]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const notices = await db.notification.findMany({
    where: {
      kind: "SCHEDULE_CANCELLED",
      cancellation: { entryId: entries[0].id },
    },
  });
  expect(notices).toHaveLength(2);
  expect(new Set(notices.map((n) => n.recipientMembershipId))).toEqual(
    new Set(students.map((s) => s.membership.id)),
  );
  expect(
    await db.scheduleEntry.count({
      where: { templateId: template.id, status: "SCHEDULED" },
    }),
  ).toBe(2);
  const first = notices.find(
    (n) => n.recipientMembershipId === students[0].membership.id,
  )!;
  const detail = await notificationDetail(students[0], first.id);
  expect(detail.notification.message).toContain("01.09.2037 · 09:00–10:30");
  expect(detail.notification.target.available).toBe(true);
  await expect(notificationDetail(students[1], first.id)).rejects.toMatchObject(
    { status: 404 },
  );
  const enrollment = await db.groupMembership.findFirstOrThrow({
    where: {
      membershipId: students[0].membership.id,
      endedAt: null,
      revokedAt: null,
    },
  });
  await changeMembership(staff.user.id, universityId, {
    action: "REVOKE",
    membershipId: students[0].membership.id,
    expectedEnrollmentId: enrollment.id,
    reason: "Демо отзыв",
  });
  expect(
    (await notificationDetail(students[0], first.id)).notification.target
      .available,
  ).toBe(false);
  expect(
    (await listNotifications(students[0])).items.some((n) => n.id === first.id),
  ).toBe(true);

  const folder = await mkdtemp(tmpdir() + "/campus-preview70-");
  try {
    const file = folder + "/records.json";
    await writeFile(
      file,
      JSON.stringify([{ kind: "group", id: groups[0].id }]),
    );
    const before = await db.studentGroup.count();
    const run = spawnSync(
      process.execPath,
      [
        "scripts/preview-academic-cleanup.mjs",
        "--university",
        universityId,
        "--records",
        file,
      ],
      { encoding: "utf8", env: process.env },
    );
    expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout);
    expect(report.mode).toBe("PREVIEW_ONLY");
    expect(report.records[0].physicalDeleteAllowed).toBe(false);
    expect(
      report.records[0].dependencies.some(
        (d: { table: string }) => d.table === "ScheduleGroup",
      ),
    ).toBe(true);
    expect(await db.studentGroup.count()).toBe(before);
    const denied = spawnSync(
      process.execPath,
      [
        "scripts/preview-academic-cleanup.mjs",
        "--university",
        "another-university",
        "--records",
        file,
      ],
      { encoding: "utf8", env: process.env },
    );
    expect(denied.status).toBe(1);
    expect(denied.stdout).toBe("");
  } finally {
    await rm(folder, { recursive: true });
  }

  await db.$executeRawUnsafe(
    `CREATE FUNCTION reject_workspace_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind = 'SCHEDULE_CANCELLED' THEN RAISE EXCEPTION 'fixture notification failure'; END IF; RETURN NEW; END; $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER reject_workspace_notification BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION reject_workspace_notification()',
  );
  try {
    await expect(
      commit({ action: "OCCURRENCE_CANCEL", id: entries[1].id, version: 1 }),
    ).rejects.toThrow();
    expect(
      (
        await db.scheduleEntry.findUniqueOrThrow({
          where: { id: entries[1].id },
        })
      ).status,
    ).toBe("SCHEDULED");
    expect(
      await db.scheduleCancellation.count({
        where: { entryId: entries[1].id },
      }),
    ).toBe(0);
    expect(
      await db.auditLog.count({
        where: { targetId: entries[1].id, action: "OCCURRENCE_CANCEL" },
      }),
    ).toBe(0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER reject_workspace_notification ON "Notification"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION reject_workspace_notification()");
  }
});
