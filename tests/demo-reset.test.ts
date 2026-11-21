import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { inventory, applyReset, setPasswords } from "../ops/vps/demo-reset.mjs";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Требуется изолированная тестовая БД");
const origin = process.env.BETTER_AUTH_URL!;
let client: pg.Client;
const junkUser = randomUUID();

async function signIn(email: string, password: string) {
  const r = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  return r.status;
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // Немного «мусора» разработки: лишний аккаунт, дисциплина, оценка, объявление.
  await db.user.create({
    data: {
      id: junkUser,
      name: "Лишний тестовый",
      email: junkUser + "@example.test",
      memberships: {
        create: {
          universityId: "demo-university",
          role: "STUDENT",
          status: "APPROVED",
          profile: { create: { firstName: "Лишний", lastName: "Тест" } },
          enrollments: {
            create: { groupId: "group-1", sourceId: randomUUID() },
          },
        },
      },
    },
  });
  const staff = await db.user.findUniqueOrThrow({
    where: { email: "staff@example.test" },
  });
  const student = await db.universityMembership.findFirstOrThrow({
    where: { user: { email: "student1@example.test" } },
  });
  const subjectId = randomUUID();
  await db.subject.create({
    data: {
      id: subjectId,
      universityId: "demo-university",
      name: "Мусорная дисциплина " + subjectId,
    },
  });
  await db.grade.create({
    data: {
      id: randomUUID(),
      universityId: "demo-university",
      membershipId: student.id,
      subjectId,
      kind: "MARK",
      mark: 2,
      issuedOn: new Date("2026-11-01"),
      authorId: staff.id,
    },
  });
  await db.announcement.create({
    data: {
      id: randomUUID(),
      universityId: "demo-university",
      scope: "UNIVERSITY",
      title: "Старое объявление",
      body: "Удалится",
      authorId: staff.id,
    },
  });
});
afterAll(async () => {
  // Вернуть пароли из окружения, чтобы остальные тесты входили как раньше.
  await setPasswords(client, [
    process.env.DEMO_STAFF_PASSWORD!,
    process.env.DEMO_STUDENT1_PASSWORD!,
    process.env.DEMO_STUDENT2_PASSWORD!,
  ]);
  await client.end();
  await db.$disconnect();
});

it("Очистка демо: устаревший код не срабатывает; остаются вуз, структура и демо-аккаунты; триггеры и аудит целы", async () => {
  const before = (await inventory(client)) as {
    counts: Record<string, number>;
    keep: string[];
    code: string;
  };
  expect(before.counts.Grade).toBeGreaterThan(0);
  expect(before.counts["User (кроме демо-аккаунтов)"]).toBeGreaterThan(0);
  expect(before.keep).toEqual(
    expect.arrayContaining(["staff@example.test", "student1@example.test"]),
  );
  const audit = await db.auditLog.count();
  await expect(applyReset(client, "00000000")).rejects.toThrow(/STOP/);
  expect(await db.user.findUnique({ where: { id: junkUser } })).not.toBeNull();

  await applyReset(client, before.code);
  const after = (await inventory(client)) as { counts: Record<string, number> };
  for (const [k, n] of Object.entries(after.counts))
    expect([k, n]).toEqual([k, 0]);
  expect(await db.user.findUnique({ where: { id: junkUser } })).toBeNull();
  expect(
    await db.studentGroup.count({
      where: { id: { in: ["group-1", "group-2"] } },
    }),
  ).toBe(2);
  expect(await db.university.count()).toBe(1);
  const s1 = await db.user.findUniqueOrThrow({
    where: { email: "student1@example.test" },
    include: { memberships: { include: { profile: true, enrollments: true } } },
  });
  expect(s1.name).toBe("Студент 1");
  expect(s1.memberships[0].profile).toMatchObject({
    firstName: "Студент",
    lastName: "1",
  });
  expect(s1.memberships[0].enrollments.length).toBeGreaterThan(0);
  expect(await db.auditLog.count()).toBeGreaterThanOrEqual(audit);
  const triggers = await client.query(
    "SELECT count(*) FROM pg_trigger WHERE tgname = ANY($1) AND tgenabled = 'O'",
    [
      [
        "immutable_notification_delete",
        "immutable_application_document",
        "immutable_application_event",
        "immutable_cancellation",
        "immutable_audit",
      ],
    ],
  );
  expect(Number(triggers.rows[0].count)).toBe(5);
});

it("Пароли демо-аккаунтов: проверка длины, новый пароль работает, старые сессии закрыты", async () => {
  await expect(
    setPasswords(client, ["short", "short", "short"]),
  ).rejects.toThrow(/12/);
  const fresh = ["Kampus-Staff-01", "Kampus-Student-1", "Kampus-Student-2"];
  expect(await setPasswords(client, fresh)).toBeGreaterThanOrEqual(2);
  expect(await signIn("student1@example.test", "Kampus-Student-1")).toBe(200);
  expect(
    await signIn("student1@example.test", process.env.DEMO_STUDENT1_PASSWORD!),
  ).not.toBe(200);
  expect(await signIn("staff@example.test", "Kampus-Staff-01")).toBe(200);
});
