import { POST as gradeWrite } from "../../src/app/api/staff/grades/route";
import { POST as subjectWrite } from "../../src/app/api/staff/subjects/route";
import { GET as gradeRead } from "../../src/app/api/grades/route";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { applicationHTTP } from "../../src/server/application-http";
import { POST as structureWrite } from "../../src/app/api/staff/structure/route";
import { POST as scheduleWrite } from "../../src/app/api/staff/schedule/route";
import { GET as scheduleRead } from "../../src/app/api/schedule/route";
// Spawned only against an authenticated limited role on a dedicated *_test DB.
import { it, expect, afterAll } from "vitest";
import { db } from "../../src/server/db";
import {
  GET as ticket,
  POST as register,
} from "../../src/app/api/register/route";
import { POST as auth } from "../../src/app/api/auth/[...all]/route";
import { POST as decision } from "../../src/app/api/staff/decision/route";
import { POST as membershipAction } from "../../src/app/api/staff/membership/route";
import { POST as retry } from "../../src/app/api/enrollment/route";
import { GET as group } from "../../src/app/api/group/route";
const url = new URL(process.env.DATABASE_URL!);
if (
  url.username !== "campus_runtime" ||
  !url.pathname.endsWith("_test") ||
  process.env.CAMPUS_LIMITED_PROBE !== "yes"
)
  throw Error("Dedicated limited-role probe required");
const origin = process.env.BETTER_AUTH_URL!;
function req(path: string, body?: unknown, cookie = "") {
  return new Request(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie,
      "x-limited-probe": "192.0.2.44",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(email: string, password: string) {
  const response = await auth(
    req("/api/auth/sign-in/email", { email, password }),
  );
  expect(response.status).toBe(200);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
afterAll(async () => {
  await db.$disconnect();
});
it("full server workflow runs under limited credentials, retains audit and revokes DB session", async () => {
  const current = await db.$queryRaw<
    { name: string }[]
  >`SELECT session_user AS name`;
  expect(current[0].name).toBe("campus_runtime");
  const t = await ticket(req("/api/register"));
  expect(t.status).toBe(200);
  const response = await register(
    req("/api/register", {
      ticket: (await t.json()).ticket,
      universityId: "demo-university",
      facultyId: "faculty-1",
      programId: "program-1",
      groupId: "group-1",
    }),
  );
  expect(response.status).toBe(201);
  const credentials = (await response.json()).credentials;
  const cookie = await login(credentials.email, credentials.password);
  expect((await group(req("/api/group", undefined, cookie))).status).toBe(403);
  const member = await db.universityMembership.findFirstOrThrow({
    where: { user: { email: credentials.email } },
    include: { requests: true },
  });
  const staff = await login(
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  expect(
    (
      await decision(
        req(
          "/api/staff/decision",
          {
            requestId: member.requests[0].id,
            status: "REJECTED",
            reason: "Вымышленная проверка",
          },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (await retry(req("/api/enrollment", { groupId: "group-1" }, cookie)))
      .status,
  ).toBe(200);
  const pending = await db.enrollmentRequest.findFirstOrThrow({
    where: { membershipId: member.id, status: "PENDING" },
  });
  expect(
    (
      await decision(
        req(
          "/api/staff/decision",
          {
            requestId: pending.id,
            status: "APPROVED",
            reason: "Вымышленная проверка",
          },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (await group(req("/api/group?id=group-1", undefined, cookie))).status,
  ).toBe(200);
  expect(
    (await group(req("/api/group?id=group-2", undefined, cookie))).status,
  ).toBe(403);
  expect(
    await db.enrollmentRequest.count({ where: { membershipId: member.id } }),
  ).toBe(2);
  expect(
    await db.auditLog.count({
      where: {
        targetId: { in: [member.id, member.requests[0].id, pending.id] },
      },
    }),
  ).toBe(4);
  const activeEnrollment = await db.groupMembership.findFirstOrThrow({
    where: { membershipId: member.id, endedAt: null, revokedAt: null },
  });
  expect(
    (
      await membershipAction(
        req(
          "/api/staff/membership",
          {
            action: "TRANSFER",
            membershipId: member.id,
            expectedEnrollmentId: activeEnrollment.id,
            groupId: "group-2",
            reason: "Вымышленный перевод",
          },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (await group(req("/api/group?id=group-1", undefined, cookie))).status,
  ).toBe(403);
  const moved = await db.groupMembership.findFirstOrThrow({
    where: { membershipId: member.id, endedAt: null, revokedAt: null },
  });
  expect(
    (
      await membershipAction(
        req(
          "/api/staff/membership",
          {
            action: "REVOKE",
            membershipId: member.id,
            expectedEnrollmentId: moved.id,
            reason: "Вымышленный отзыв",
          },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  expect((await group(req("/api/group", undefined, cookie))).status).toBe(403);
  expect(
    (
      await membershipAction(
        req(
          "/api/staff/membership",
          {
            action: "ALLOW_RESUBMISSION",
            membershipId: member.id,
            reason: "Вымышленное разрешение",
          },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (await retry(req("/api/enrollment", { groupId: "group-1" }, cookie)))
      .status,
  ).toBe(200);
  expect((await auth(req("/api/auth/sign-out", {}, cookie))).status).toBe(200);
  expect((await group(req("/api/group", undefined, cookie))).status).toBe(401);
  // New feature writes and reads must also work with the exact limited SQL policy.
  const createdGroup = await structureWrite(
    req(
      "/api/staff/structure",
      {
        kind: "group",
        operationId: randomUUID(),
        parentId: "program-1",
        name: "Демо limited группа",
        active: true,
      },
      staff,
    ),
  );
  expect(createdGroup.status).toBe(200);
  const newGroup = (await createdGroup.json()).id;
  const lesson = await scheduleWrite(
    req(
      "/api/staff/schedule",
      {
        action: "CREATE",
        groupId: "group-1",
        title: "Демо limited занятие",
        teacher: "",
        room: "",
        day: "2030-06-03",
        start: "09:00",
        end: "10:30",
      },
      staff,
    ),
  );
  expect(lesson.status).toBe(200);
  const lessonId = (await lesson.json()).id;
  const seedCookie = await login(
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
  const applicationId = randomUUID();
  expect(
    (
      await applicationHTTP(
        req(
          "/api/applications",
          {
            kind: "STUDY_CERTIFICATE",
            operationId: applicationId,
            purpose: "Демо limited справка",
            description: "",
          },
          seedCookie,
        ),
        "create",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await applicationHTTP(
        req(
          `/api/staff/applications/${applicationId}/actions`,
          { action: "TAKE", operationId: randomUUID(), expectedVersion: 1 },
          staff,
        ),
        "action",
        applicationId,
        true,
      )
    ).status,
  ).toBe(200);
  const sample = await readFile("demo/documents/demo-certificate.pdf"),
    multipart = new FormData();
  multipart.append(
    "metadata",
    JSON.stringify({
      operationId: randomUUID(),
      expectedVersion: 2,
      expectedCurrentDocumentId: null,
      demoConfirmed: true,
    }),
  );
  multipart.append(
    "file",
    new File([sample], "demo.pdf", { type: "application/pdf" }),
  );
  expect(
    (
      await applicationHTTP(
        new Request(
          origin + `/api/staff/applications/${applicationId}/documents`,
          {
            method: "POST",
            headers: { origin, cookie: staff },
            body: multipart,
          },
        ),
        "upload",
        applicationId,
        true,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await applicationHTTP(
        req(
          `/api/staff/applications/${applicationId}/actions`,
          {
            action: "COMPLETE",
            operationId: randomUUID(),
            expectedVersion: 3,
            text: "Демо справка готова",
          },
          staff,
        ),
        "action",
        applicationId,
        true,
      )
    ).status,
  ).toBe(200);
  const delivered = await applicationHTTP(
    req(`/api/applications/${applicationId}/document`, undefined, seedCookie),
    "download",
    applicationId,
  );
  expect(delivered.status).toBe(200);
  expect(Buffer.from(await delivered.arrayBuffer()).equals(sample)).toBe(true);
  const gs = await subjectWrite(
    req(
      "/api/staff/subjects",
      {
        action: "CREATE",
        operationId: randomUUID(),
        name: "Демо limited дисциплина",
      },
      staff,
    ),
  );
  expect(gs.status).toBe(200);
  const subjectId = (await gs.json()).id;
  const seedMember = await db.universityMembership.findFirstOrThrow({
    where: { user: { email: "student1@example.test" } },
  });
  const gd = {
    action: "CREATE",
    operationId: randomUUID(),
    membershipId: seedMember.id,
    groupId: "group-1",
    subjectId,
    issuedOn: "2026-11-07",
    result: { kind: "MARK", mark: 5 },
  };
  expect(
    (await gradeWrite(req("/api/staff/grades", gd, seedCookie))).status,
  ).toBe(403);
  expect((await gradeWrite(req("/api/staff/grades", gd, staff))).status).toBe(
    200,
  );
  expect((await gradeWrite(req("/api/staff/grades", gd, staff))).status).toBe(
    409,
  );
  const gr = await gradeRead(req("/api/grades", undefined, seedCookie));
  expect(gr.status).toBe(200);
  expect(
    (await gr.json()).rows.some((r: { id: string }) => r.id === gd.operationId),
  ).toBe(true);
  expect(
    (
      await gradeRead(
        req("/api/grades?membershipId=" + member.id, undefined, seedCookie),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await gradeWrite(
        req(
          "/api/staff/grades",
          {
            action: "VOID",
            id: gd.operationId,
            version: 1,
            reason: "Демо аннулирование",
          },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  const read = await scheduleRead(
    req("/api/schedule?day=2030-06-03", undefined, seedCookie),
  );
  expect(read.status).toBe(200);
  expect(
    (await read.json()).lessons.some((l: { id: string }) => l.id === lessonId),
  ).toBe(true);
  expect(
    (
      await scheduleWrite(
        req(
          "/api/staff/schedule",
          { action: "DELETE", id: lessonId, version: 1 },
          seedCookie,
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await scheduleRead(
        req("/api/schedule?groupId=" + newGroup, undefined, seedCookie),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await scheduleWrite(
        req(
          "/api/staff/schedule",
          { action: "CANCEL", id: lessonId, version: 1 },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await scheduleWrite(
        req(
          "/api/staff/schedule",
          { action: "DELETE", id: lessonId, version: 2 },
          staff,
        ),
      )
    ).status,
  ).toBe(200);
});
