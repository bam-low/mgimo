import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { verifyPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { GET, POST } from "../src/app/api/register/route";
import { POST as login } from "../src/app/api/auth/[...all]/route";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Dedicated *_test DB required");
const origin = process.env.BETTER_AUTH_URL!;
const header = "x-synthetic-test-ingress";
let source: string;
beforeEach(() => {
  vi.stubEnv("AUTH_TRUSTED_IP_HEADER", header);
  source = `2001:db8:${randomUUID().slice(0, 4)}::99`;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await db.$disconnect();
});
function request(body?: unknown, peer = source) {
  return new Request(origin + "/api/register", {
    method: body === undefined ? "GET" : "POST",
    headers: { origin, "content-type": "application/json", [header]: peer },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function choice() {
  const response = await GET(request());
  expect(response.status).toBe(200);
  const data = await response.json();
  expect("password" in data).toBe(false);
  expect("credentials" in data).toBe(false);
  expect(response.headers.get("cache-control")).toContain("no-store");
  return {
    ticket: data.ticket as string,
    universityId: "demo-university",
    facultyId: "faculty-1",
    programId: "program-1",
    groupId: "group-1",
  };
}
it("creates only synthetic identity and a hash, returns credentials only after coherent PENDING commit", async () => {
  const response = await POST(request(await choice()));
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const { credentials: c } = await response.json();
  expect(c.email.endsWith("@example.test")).toBe(true);
  expect(c.firstName).toBe("Демо");
  expect(c.lastName.startsWith("Студент ")).toBe(true);
  expect(c.password.length >= 32).toBe(true);
  const user = await db.user.findUniqueOrThrow({
    where: { email: c.email },
    include: {
      accounts: true,
      memberships: {
        include: { profile: true, requests: true, enrollments: true },
      },
    },
  });
  expect(user.accounts[0].password === c.password).toBe(false);
  expect(
    await verifyPassword({
      hash: user.accounts[0].password!,
      password: c.password,
    }),
  ).toBe(true);
  expect(JSON.stringify(user).includes(c.password)).toBe(false);
  expect(user.memberships[0].role).toBe("STUDENT");
  expect(user.memberships[0].status).toBe("PENDING");
  expect(user.memberships[0].profile?.firstName).toBe(c.firstName);
  expect(user.memberships[0].enrollments.length).toBe(0);
  expect(user.memberships[0].requests.length).toBe(1);
  const audit = await db.auditLog.findMany({
    where: { targetId: user.memberships[0].id },
  });
  expect(audit.length).toBe(1);
  expect(JSON.stringify(audit).includes(c.password)).toBe(false);
});
it("rejects all supplied identity/password/privilege fields before creating auth rows", async () => {
  const data = await choice(),
    before = await db.user.count();
  for (const extra of [
    { firstName: "Подставное" },
    { lastName: "Вымышленное" },
    { email: "forged@example.invalid" },
    { password: "Synthetic-" + randomUUID() },
    { role: "STAFF" },
    { userId: "foreign" },
  ]) {
    const response = await POST(request({ ...data, ...extra }));
    expect(response.status).toBe(400);
    expect("credentials" in (await response.json())).toBe(false);
  }
  expect(await db.user.count()).toBe(before);
});
it("one ticket is single use under concurrent POSTs; no credential replay or recovery", async () => {
  const data = await choice();
  const results = await Promise.all([POST(request(data)), POST(request(data))]);
  expect(results.filter((r) => r.status === 201).length).toBe(1);
  const failed = results.find((r) => r.status !== 201)!;
  expect("credentials" in (await failed.json())).toBe(false);
  const again = await POST(request(data));
  expect(again.status).toBe(409);
  expect("credentials" in (await again.json())).toBe(false);
  const email = `student-${data.ticket.split(".")[0]}@example.test`;
  expect(await db.user.count({ where: { email } })).toBe(1);
  expect(
    await db.universityMembership.count({ where: { user: { email } } }),
  ).toBe(1);
});
it("new tickets create distinct synthetic users and reject tampered, expired and source-swapped tickets", async () => {
  const data = await choice(),
    before = await db.user.count();
  expect(
    (
      await POST(
        request({
          ...data,
          ticket:
            data.ticket.slice(0, -1) + (data.ticket.endsWith("A") ? "B" : "A"),
        }),
      )
    ).status,
  ).toBe(400);
  expect((await POST(request(data, "192.0.2.200"))).status).toBe(400);
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60000);
  expect((await POST(request(data))).status).toBe(400);
  vi.restoreAllMocks();
  expect(await db.user.count()).toBe(before);
  const first = await POST(request(await choice()));
  const second = await POST(request(await choice()));
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const a = (await first.json()).credentials,
    b = (await second.json()).credentials;
  expect(a.email === b.email).toBe(false);
  expect(a.password === b.password).toBe(false);
});
it("blocks cross-site ticket issuance and non-demo login identities without echoing input", async () => {
  const cross = request();
  cross.headers.set("sec-fetch-site", "cross-site");
  expect((await GET(cross)).status).toBe(403);
  const response = await login(
    new Request(origin + "/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json", [header]: source },
      body: JSON.stringify({
        email: "forged@example.invalid",
        password: "Synthetic-" + randomUUID(),
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect((await response.text()).includes("forged")).toBe(false);
});
it("seed is repeatable, uses distinct private passwords, and cannot reset credentials or reopen revoked fixtures", async () => {
  function seed(env = process.env) {
    return spawnSync(process.execPath, ["prisma/seed.mjs"], {
      encoding: "utf8",
      timeout: 30000,
      env,
    });
  }
  const before = await db.account.findMany({
    where: {
      user: {
        email: {
          in: [
            "staff@example.test",
            "student1@example.test",
            "student2@example.test",
          ],
        },
      },
    },
    orderBy: { userId: "asc" },
  });
  expect(seed().status).toBe(0);
  expect(seed().status).toBe(0);
  const after = await db.account.findMany({
    where: { id: { in: before.map((a) => a.id) } },
    orderBy: { userId: "asc" },
  });
  expect(
    after.map((a) => a.password).join() ===
      before.map((a) => a.password).join(),
  ).toBe(true);
  const wrong = seed({ ...process.env, DEMO_STUDENT1_PASSWORD: randomUUID() });
  expect(wrong.status).toBe(1);
  expect(
    [
      process.env.DEMO_STAFF_PASSWORD,
      process.env.DEMO_STUDENT1_PASSWORD,
      process.env.DEMO_STUDENT2_PASSWORD,
    ].some(
      (p) => p && ((wrong.stdout ?? "") + (wrong.stderr ?? "")).includes(p),
    ),
  ).toBe(false);
  const enrollment = await db.groupMembership.findFirstOrThrow({
    where: {
      membership: { user: { email: "student1@example.test" } },
      endedAt: null,
    },
  });
  await db.groupMembership.update({
    where: { id: enrollment.id },
    data: { endedAt: new Date(), revokedAt: new Date() },
  });
  try {
    expect(seed().status).toBe(1);
    expect(
      (
        await db.groupMembership.findUniqueOrThrow({
          where: { id: enrollment.id },
        })
      ).endedAt !== null,
    ).toBe(true);
  } finally {
    await db.groupMembership.update({
      where: { id: enrollment.id },
      data: { endedAt: enrollment.endedAt, revokedAt: enrollment.revokedAt },
    });
  }
  const group = await db.studentGroup.findUniqueOrThrow({
    where: { id: "group-1" },
  });
  await db.studentGroup.update({
    where: { id: group.id },
    data: { name: "Подставная структура" },
  });
  try {
    expect(seed().status).toBe(1);
    expect(
      (await db.studentGroup.findUniqueOrThrow({ where: { id: group.id } }))
        .name,
    ).toBe("Подставная структура");
  } finally {
    await db.studentGroup.update({
      where: { id: group.id },
      data: { name: group.name },
    });
  }
  const memberships = await db.universityMembership.findMany({
    where: {
      user: {
        email: { in: ["student1@example.test", "student2@example.test"] },
      },
    },
    include: { enrollments: { where: { endedAt: null, revokedAt: null } } },
  });
  expect(memberships.length).toBe(2);
  expect(memberships.every((m) => m.status === "APPROVED")).toBe(true);
  expect(new Set(memberships.map((m) => m.enrollments[0].groupId)).size).toBe(
    2,
  );
});
