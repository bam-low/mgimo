import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor, Denied } from "../src/server/security";
import { readDebts, setDebtHidden } from "../src/server/debts";
import {
  changeAnnouncement,
  markAnnouncementRead,
  staffAnnouncements,
  studentAnnouncements,
} from "../src/server/announcements";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Требуется изолированная тестовая БД");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
type A = Awaited<ReturnType<typeof actor>>;
let student: A, classmate: A, otherGroup: A, staff: A, foreignStaff: A;
let subjectId: string;

async function fixture(
  role = "STUDENT",
  universityId = uni,
  groupId = "group-1",
) {
  const id = randomUUID(),
    password = randomUUID() + randomUUID(),
    email = id + "@example.test";
  await db.user.create({
    data: {
      id,
      name: "Демо долги и объявления",
      email,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
      memberships: {
        create: {
          universityId,
          role,
          status: "APPROVED",
          ...(role === "STUDENT"
            ? { enrollments: { create: { groupId, sourceId: randomUUID() } } }
            : {}),
        },
      },
    },
  });
  const r = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(r.status).toBe(200);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return actor(new Headers({ origin, cookie }));
}

async function grade(
  a: A,
  result: { mark?: number; credit?: string },
  issuedOn: string,
  extra: { voided?: boolean } = {},
) {
  const id = randomUUID();
  await db.grade.create({
    data: {
      id,
      universityId: uni,
      membershipId: a.membership.id,
      subjectId,
      kind: result.mark ? "MARK" : "CREDIT",
      mark: result.mark ?? null,
      credit: result.credit ?? null,
      issuedOn: new Date(issuedOn),
      authorId: staff.user.id,
      ...extra,
    },
  });
  return id;
}

const denied = async (p: Promise<unknown>, status?: number) => {
  const e = await p.then(
    () => null,
    (err) => err,
  );
  expect(e).toBeInstanceOf(Denied);
  if (status) expect((e as Denied).status).toBe(status);
};

beforeAll(async () => {
  student = await fixture();
  classmate = await fixture();
  otherGroup = await fixture("STUDENT", uni, "group-2");
  staff = await fixture("STAFF");
  const foreignUni = randomUUID();
  await db.university.create({
    data: {
      id: foreignUni,
      name: "Другой вымышленный вуз",
      timezone: "Europe/Moscow",
    },
  });
  foreignStaff = await fixture("STAFF", foreignUni);
  subjectId = randomUUID();
  await db.subject.create({
    data: {
      id: subjectId,
      universityId: uni,
      name: "Вымышленная дисциплина " + subjectId.slice(0, 6),
    },
  });
});
afterAll(() => db.$disconnect());

it("«Можно исправить»: только свои действующие «2» и «незачёт», поздняя положительная оценка снимает долг", async () => {
  const two = await grade(student, { mark: 2 }, "2026-10-01");
  const failedCredit = await grade(student, { credit: "FAILED" }, "2026-10-02");
  await grade(student, { mark: 2 }, "2026-10-03", { voided: true });
  await grade(classmate, { mark: 2 }, "2026-10-01");
  let debts = await readDebts(student);
  expect(debts.open.map((d) => d.id).sort()).toEqual(
    [two, failedCredit].sort(),
  );
  expect(debts.hidden).toEqual([]);
  // Позже по той же дисциплине поставили 4 — долг «2» от 01.10 и незачёт от 02.10 уходят.
  await grade(student, { mark: 4 }, "2026-10-10");
  debts = await readDebts(student);
  expect(debts.open).toEqual([]);
  // Более ранняя положительная оценка долг не снимает.
  const lateTwo = await grade(student, { mark: 2 }, "2026-10-20");
  debts = await readDebts(student);
  expect(debts.open.map((d) => d.id)).toEqual([lateTwo]);
});

it("Скрыть долг может только сам студент; отметка не меняет оценку и возвращается", async () => {
  const id = await grade(classmate, { credit: "FAILED" }, "2026-11-01");
  await denied(setDebtHidden(student, { gradeId: id, hidden: true }), 404);
  await denied(setDebtHidden(staff, { gradeId: id, hidden: true }));
  await setDebtHidden(classmate, { gradeId: id, hidden: true });
  let debts = await readDebts(classmate);
  expect(debts.open.some((d) => d.id === id)).toBe(false);
  expect(debts.hidden.some((d) => d.id === id)).toBe(true);
  expect((await db.grade.findUnique({ where: { id } }))?.voided).toBe(false);
  // Повторное скрытие не создаёт дубль.
  await setDebtHidden(classmate, { gradeId: id, hidden: true });
  expect(await db.gradeDismissal.count({ where: { gradeId: id } })).toBe(1);
  await setDebtHidden(classmate, { gradeId: id, hidden: false });
  debts = await readDebts(classmate);
  expect(debts.open.some((d) => d.id === id)).toBe(true);
  // Положительную оценку скрыть нельзя.
  const good = await grade(classmate, { mark: 5 }, "2026-11-02");
  await denied(setDebtHidden(classmate, { gradeId: good, hidden: true }), 404);
});

const create = async (a: A, data: Record<string, unknown>) =>
  (await changeAnnouncement(a, {
    action: "CREATE",
    operationId: randomUUID(),
    title: "Вымышленное объявление",
    body: "Только демонстрационный текст.",
    term: "3",
    ...data,
  })) as { id: string; expiresAt: string | null };

it("Объявления видят только адресаты: вуз, свой факультет, направление и группа", async () => {
  const all = await create(staff, {
    scope: "UNIVERSITY",
    title: "Для всех " + randomUUID(),
  });
  const faculty1 = await create(staff, {
    scope: "FACULTY",
    targetId: "faculty-1",
  });
  const program1 = await create(staff, {
    scope: "PROGRAM",
    targetId: "program-1",
  });
  const group1 = await create(staff, {
    scope: "GROUP",
    targetId: "group-1",
    term: "NONE",
  });
  const group2 = await create(staff, { scope: "GROUP", targetId: "group-2" });
  const mine = (await studentAnnouncements(student)).items.map((n) => n.id);
  expect(mine).toEqual(
    expect.arrayContaining([all.id, faculty1.id, program1.id, group1.id]),
  );
  expect(mine).not.toContain(group2.id);
  const theirs = (await studentAnnouncements(otherGroup)).items.map(
    (n) => n.id,
  );
  expect(theirs).toContain(all.id);
  expect(theirs).toContain(group2.id);
  expect(theirs).not.toContain(group1.id);
  expect(theirs).not.toContain(faculty1.id);
  expect(group1.expiresAt).toBeNull();
  expect(new Date(all.expiresAt!).getTime() - Date.now()).toBeGreaterThan(
    2.9 * 86400000,
  );
  // Чужой вуз не видит и не может адресовать нашу структуру.
  expect(
    (await staffAnnouncements(foreignStaff)).items.map((n) => n.id),
  ).not.toContain(all.id);
  await denied(
    create(foreignStaff, { scope: "GROUP", targetId: "group-1" }),
    404,
  );
  await denied(
    changeAnnouncement(foreignStaff, { action: "DELETE", id: all.id }),
    404,
  );
});

it("Студент не публикует; повтор запроса не создаёт дубль; цель обязана соответствовать уровню", async () => {
  await denied(create(student, { scope: "UNIVERSITY" }));
  await denied(studentAnnouncements(staff));
  const operationId = randomUUID();
  const body = {
    action: "CREATE",
    operationId,
    scope: "UNIVERSITY",
    title: "Повтор",
    body: "Текст",
    term: "1",
  };
  const first = await changeAnnouncement(staff, body);
  const second = await changeAnnouncement(staff, body);
  expect(second.id).toBe(first.id);
  expect(await db.announcement.count({ where: { id: operationId } })).toBe(1);
  await denied(
    create(staff, { scope: "UNIVERSITY", targetId: "group-1" }),
    400,
  );
  await denied(create(staff, { scope: "GROUP" }), 400);
  await expect(
    create(staff, { scope: "UNIVERSITY", term: "7" }),
  ).rejects.toThrow();
  const audit = await db.auditLog.findFirst({
    where: { targetId: first.id, action: "ANNOUNCEMENT_CREATED" },
  });
  expect(audit?.actorId).toBe(staff.user.id);
});

it("Истёкшие объявления не показываются и удаляются из БД; удаление пишется в аудит", async () => {
  const expired = await create(staff, {
    scope: "UNIVERSITY",
    title: "Истекло",
  });
  await db.announcement.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  expect(
    (await studentAnnouncements(student)).items.map((n) => n.id),
  ).not.toContain(expired.id);
  expect(
    await db.announcement.findUnique({ where: { id: expired.id } }),
  ).toBeNull();
  const gone = await create(staff, { scope: "UNIVERSITY", title: "Удалить" });
  await changeAnnouncement(staff, { action: "DELETE", id: gone.id });
  expect(
    await db.announcement.findUnique({ where: { id: gone.id } }),
  ).toBeNull();
  expect(
    await db.auditLog.count({
      where: { targetId: gone.id, action: "ANNOUNCEMENT_DELETED" },
    }),
  ).toBe(1);
  await denied(
    changeAnnouncement(staff, { action: "DELETE", id: gone.id }),
    404,
  );
});

it("«Прочитано» убирает объявление только с главной этого студента и только видимое ему", async () => {
  const notice = await create(staff, {
    scope: "GROUP",
    targetId: "group-1",
    title: "Прочитать " + randomUUID(),
  });
  const foreignGroup = await create(staff, {
    scope: "GROUP",
    targetId: "group-2",
  });
  const home = async (a: A) =>
    (await studentAnnouncements(a, { unreadOnly: true })).items.map(
      (n) => n.id,
    );
  expect(await home(student)).toContain(notice.id);
  await markAnnouncementRead(student, { id: notice.id });
  await markAnnouncementRead(student, { id: notice.id });
  expect(await home(student)).not.toContain(notice.id);
  expect(
    (await studentAnnouncements(student)).items.map((n) => n.id),
  ).toContain(notice.id);
  expect(await home(classmate)).toContain(notice.id);
  expect(
    await db.announcementRead.count({ where: { announcementId: notice.id } }),
  ).toBe(1);
  await denied(markAnnouncementRead(student, { id: foreignGroup.id }), 404);
  await denied(markAnnouncementRead(staff, { id: notice.id }));
  // Удаление объявления удаляет и отметки.
  await changeAnnouncement(staff, { action: "DELETE", id: notice.id });
  expect(
    await db.announcementRead.count({ where: { announcementId: notice.id } }),
  ).toBe(0);
});
