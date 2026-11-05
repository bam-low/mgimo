import { test, expect } from "@playwright/test";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import { db } from "../../src/server/db";
const origin = process.env.BETTER_AUTH_URL!;
function call(
  path: string,
  source: string,
  body?: unknown,
  cookie = "",
  authorization = "",
) {
  return new Promise<{ status: number; cookies: string[]; body: string }>(
    (resolve, reject) => {
      const text = body === undefined ? undefined : JSON.stringify(body);
      const request = httpRequest(
        new URL(path, origin),
        {
          localAddress: source,
          family: 4,
          method: body === undefined ? "GET" : "POST",
          headers: {
            origin,
            "content-type": "application/json",
            cookie,
            authorization,
            "x-forwarded-for": randomUUID(),
            "x-vercel-forwarded-for":
              "192.0.2." + Math.ceil(Math.random() * 200),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (c) => chunks.push(c));
          response.on("end", () =>
            resolve({
              status: response.statusCode!,
              cookies: response.headers["set-cookie"] ?? [],
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      request.on("error", reject);
      request.end(text);
    },
  );
}
test("real generated Functions retain source limits, isolation, logout and guarded idle cleanup", async () => {
  if (!process.env.DATABASE_URL?.split("?")[0].endsWith("_test"))
    throw Error("Dedicated *_test DB required");
  const a = "127.0.0.2",
    b = "127.0.0.3";
  const data = {
    firstName: "Тест",
    lastName: "Вымышленный",
    email: randomUUID() + "@example.test",
    password: "Synthetic-" + randomUUID(),
    universityId: "demo-university",
    facultyId: "faculty-1",
    programId: "program-1",
    groupId: "group-1",
  };
  expect((await call("/api/register", a, data)).status).toBe(202);
  for (let i = 0; i < 10; i++)
    expect(
      (
        await call("/api/auth/sign-in/email", a, {
          email: data.email,
          password: data.password + "wrong",
        })
      ).status,
    ).toBe(401);
  expect(
    (
      await call("/api/auth/sign-in/email", a, {
        email: data.email,
        password: data.password,
      })
    ).status,
  ).toBe(429);
  const ok = await call("/api/auth/sign-in/email", b, {
    email: data.email,
    password: data.password,
  });
  expect(ok.status).toBe(200);
  const cookie = ok.cookies.map((c) => c.split(";")[0]).join("; ");
  expect((await call("/api/group", b, undefined, cookie)).status).toBe(403); // PENDING.
  expect(
    (
      await call(
        "/api/staff/decision",
        b,
        { requestId: "foreign", status: "APPROVED", reason: "Нельзя" },
        cookie,
      )
    ).status,
  ).toBe(403);
  if (!process.env.DEMO_STAFF_PASSWORD)
    throw Error("Synthetic STAFF secret required");
  const staff = await call("/api/auth/sign-in/email", "127.0.0.4", {
    email: "staff@example.test",
    password: process.env.DEMO_STAFF_PASSWORD,
  });
  expect(staff.status).toBe(200);
  const staffCookie = staff.cookies.map((c) => c.split(";")[0]).join("; ");
  const first = await db.enrollmentRequest.findFirstOrThrow({
    where: { membership: { user: { email: data.email } } },
  });
  expect(
    (
      await call(
        "/api/staff/decision",
        "127.0.0.4",
        {
          requestId: first.id,
          status: "REJECTED",
          reason: "Вымышленная проверка",
        },
        staffCookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (await call("/api/enrollment", b, { groupId: "group-2" }, cookie)).status,
  ).toBe(200);
  const second = await db.enrollmentRequest.findFirstOrThrow({
    where: { membership: { user: { email: data.email } }, status: "PENDING" },
  });
  expect(second.id).not.toBe(first.id);
  expect(
    (
      await call(
        "/api/staff/decision",
        "127.0.0.4",
        {
          requestId: second.id,
          status: "APPROVED",
          reason: "Вымышленная проверка",
        },
        staffCookie,
      )
    ).status,
  ).toBe(200);
  expect((await call("/api/group", b, undefined, cookie)).status).toBe(200);
  expect(
    (await call("/api/group?id=group-1", b, undefined, cookie)).status,
  ).toBe(403);
  expect(
    (await db.enrollmentRequest.findUniqueOrThrow({ where: { id: first.id } }))
      .status,
  ).toBe("REJECTED");
  expect(
    await db.auditLog.count({
      where: { targetId: { in: [first.id, second.id] } },
    }),
  ).toBeGreaterThanOrEqual(3);
  await db.$disconnect();
  for (let i = 0; i < 21; i++) await call("/api/auth/sign-in/email", a, {});
  expect((await call("/api/auth/sign-in/email", a, {})).status).toBe(429);
  expect((await call("/api/auth/sign-out", a, {}, cookie)).status).toBe(200);
  expect((await call("/api/group", b, undefined, cookie)).status).toBe(401);
  for (let i = 0; i < 41; i++) await call("/api/register", a, {});
  expect((await call("/api/register", a, {})).status).toBe(429);
  expect(
    (
      await call("/api/register", b, {
        ...data,
        email: randomUUID() + "@example.test",
      })
    ).status,
  ).toBe(202);
  expect((await call("/api/internal/rate-cleanup", a)).status).toBe(401);
  if (!process.env.CRON_SECRET) throw Error("Test cron secret required");
  expect(
    (
      await call(
        "/api/internal/rate-cleanup",
        a,
        undefined,
        "",
        "Bearer " + process.env.CRON_SECRET,
      )
    ).status,
  ).toBe(200);
});
