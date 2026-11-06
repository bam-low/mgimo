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
});
