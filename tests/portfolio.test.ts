import { beforeAll, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor, Denied } from "../src/server/security";
import { validateFile } from "../src/server/application-files";
import { listNotifications } from "../src/server/notifications";
import {
  createPortfolioItem,
  actOnOwnPortfolio,
  decidePortfolio,
  studentPortfolio,
  staffPortfolioQueue,
  staffPortfolioStudents,
  staffStudentPortfolio,
  portfolioFile,
} from "../src/server/portfolio";
import { POST as uploadRoute } from "../src/app/api/portfolio/route";
import { addDays, dayKey } from "../src/lib/schedule-time";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Требуется изолированная тестовая БД");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
type A = Awaited<ReturnType<typeof actor>>;
let student: A, classmate: A, staff: A, foreignStaff: A, studentHeaders: Headers;
let pdf: Awaited<ReturnType<typeof validateFile>>;

async function fixture(role: "STUDENT" | "STAFF", universityId = uni) {
  const id = randomUUID(),
    email = `${id}@example.test`,
    password = randomUUID() + randomUUID();
  await db.user.create({
    data: {
      id,
      name: "Демо портфолио " + id.slice(0, 4),
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
            ? {
                enrollments: {
                  create: { groupId: "group-1", sourceId: randomUUID() },
                },
              }
            : {}),
        },
      },
    },
  });
  const login = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(login.status).toBe(200);
  const h = new Headers({
    origin,
    cookie: login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  });
  return { a: await actor(h), h };
}
const denied = async (p: Promise<unknown>, status?: number) => {
  const e = await p.then(
    () => null,
    (err) => err,
  );
  expect(e).toBeInstanceOf(Denied);
  if (status) expect((e as Denied).status).toBe(status);
};
function meta(a: A, extra: Record<string, unknown> = {}) {
  return {
    operationId: randomUUID(),
    mode: "PENDING",
    category: "STUDY",
    eventDate: dayKey(new Date(), a.membership.university.timezone),
    activity: "PRIZE",
    comment: "",
    title: "Вымышленная олимпиада по алгоритмам",
    format: "IN_PERSON",
    eventType: "OLYMPIAD",
    rulesUrl: "https://example.test/rules",
    participants: "UP_TO_100",
    eventUrl: "",
    level: "UNIVERSITY",
    organizers: [{ type: "EDUCATION", name: "Демо-университет" }],
    demoConfirmed: true,
    ...extra,
  };
}
const version = async (id: string) =>
  (await db.portfolioItem.findUniqueOrThrow({ where: { id } })).version;

beforeAll(async () => {
  ({ a: student, h: studentHeaders } = await fixture("STUDENT"));
  ({ a: classmate } = await fixture("STUDENT"));
  ({ a: staff } = await fixture("STAFF"));
  const foreignUni = randomUUID();
  await db.university.create({
    data: { id: foreignUni, name: "Другой вымышленный вуз", timezone: "Europe/Moscow" },
  });
  ({ a: foreignStaff } = await fixture("STAFF", foreignUni));
  pdf = await validateFile(
    await readFile("demo/documents/demo-certificate.pdf"),
    "application/pdf",
  );
});

it("работа «Только для вас» не видна деканату и чужим, удаляется только владельцем", async () => {
  const item = await createPortfolioItem(student, meta(student, { mode: "PRIVATE" }), pdf);
  expect(item.status).toBe("PRIVATE");
  expect((await studentPortfolio(student)).items.map((i) => i.id)).toContain(item.id);
  expect((await staffPortfolioQueue(staff)).items.map((i) => i.id)).not.toContain(item.id);
  expect((await staffStudentPortfolio(staff, student.membership.id)).map((i) => i.id)).not.toContain(item.id);
  await denied(portfolioFile(staff, item.id), 404);
  await denied(portfolioFile(classmate, item.id), 404);
  const own = await portfolioFile(student, item.id);
  expect(createHash("sha256").update(own.content).digest("hex")).toBe(pdf.sha256);
  expect(own.headers["Content-Disposition"]).toMatch(/^attachment; filename="portfolio-/);
  await denied(actOnOwnPortfolio(classmate, { action: "DELETE", id: item.id, expectedVersion: 1 }), 404);
  await denied(decidePortfolio(staff, { action: "APPROVE", id: item.id, expectedVersion: 1, comment: "" }), 404);
  await denied(actOnOwnPortfolio(student, { action: "DELETE", id: item.id, expectedVersion: 5 }), 409);
  expect(await actOnOwnPortfolio(student, { action: "DELETE", id: item.id, expectedVersion: 1 })).toEqual({ id: item.id, deleted: true });
  expect(await db.portfolioItem.findUnique({ where: { id: item.id } })).toBeNull();
});

it("дата мероприятия: сегодня по календарю вуза — можно, завтра — нельзя; повтор операции не создаёт дубль", async () => {
  const today = dayKey(new Date(), student.membership.university.timezone);
  await denied(createPortfolioItem(student, meta(student, { eventDate: addDays(today, 1) }), pdf), 400);
  const m = meta(student, { eventDate: today, mode: "PRIVATE" });
  await createPortfolioItem(student, m, pdf);
  await denied(createPortfolioItem(student, m, pdf), 409);
  await denied(createPortfolioItem(student, meta(student, { rulesUrl: "javascript:alert(1)" }), pdf), 400);
  await denied(createPortfolioItem(student, meta(student, { demoConfirmed: false }), pdf), 400);
  await denied(createPortfolioItem(staff, meta(staff), pdf), 403);
});

it("загрузка через маршрут принимает только PDF и требует свой источник запроса", async () => {
  async function send(file: File, h = studentHeaders, metadata = meta(student)) {
    const form = new FormData();
    form.append("metadata", JSON.stringify(metadata));
    form.append("file", file);
    return uploadRoute(new Request(origin + "/api/portfolio", { method: "POST", headers: h, body: form }));
  }
  const png = await readFile("demo/documents/demo-certificate.png");
  expect((await send(new File([png], "demo.png", { type: "image/png" }))).status).toBe(415);
  const foreign = new Headers(studentHeaders);
  foreign.set("origin", "https://attacker.example.test");
  expect((await send(new File([new Uint8Array(pdf.content)], "demo.pdf", { type: "application/pdf" }), foreign)).status).toBe(403);
  const ok = await send(new File([new Uint8Array(pdf.content)], "demo.pdf", { type: "application/pdf" }));
  expect(ok.status).toBe(200);
  const body = await ok.json();
  expect(body.status).toBe("PENDING");
  expect((await staffPortfolioQueue(staff)).items.map((i) => i.id)).toContain(body.id);
});

it("модерация: отклонение с причиной, повторная отправка, подтверждение и уведомления студенту", async () => {
  const item = await createPortfolioItem(student, meta(student, { title: "Вымышленный хакатон кампуса" }), pdf);
  expect(item.status).toBe("PENDING");
  const queued = (await staffPortfolioQueue(staff)).items.find((i) => i.id === item.id);
  expect(queued?.student.name).toBe(student.user.name);
  expect(queued?.student.group).toBeTruthy();
  await denied(portfolioFile(foreignStaff, item.id), 404);
  await denied(decidePortfolio(foreignStaff, { action: "APPROVE", id: item.id, expectedVersion: 1, comment: "" }), 404);
  await denied(decidePortfolio(student, { action: "APPROVE", id: item.id, expectedVersion: 1, comment: "" }), 403);
  await denied(decidePortfolio(staff, { action: "REJECT", id: item.id, expectedVersion: 1, comment: "" }), 400);
  await denied(decidePortfolio(staff, { action: "REJECT", id: item.id, expectedVersion: 9, comment: "Нет подписи" }), 409);
  const rejected = await decidePortfolio(staff, {
    action: "REJECT",
    id: item.id,
    expectedVersion: 1,
    comment: "Нужен диплом с печатью организатора",
  });
  expect(rejected.status).toBe("REJECTED");
  expect(rejected.reviewComment).toBe("Нужен диплом с печатью организатора");
  await denied(decidePortfolio(staff, { action: "APPROVE", id: item.id, expectedVersion: rejected.version, comment: "" }), 409);
  await denied(actOnOwnPortfolio(student, { action: "DELETE", id: item.id, expectedVersion: rejected.version }), 409);
  let notes = (await listNotifications(student)).items.filter((n) => n.kind.startsWith("PORTFOLIO"));
  expect(notes[0]).toMatchObject({
    kind: "PORTFOLIO_REJECTED",
    title: "Достижение отклонено деканатом",
    target: { available: true, href: "/portfolio" },
  });
  expect(notes[0].message).toContain("Вымышленный хакатон кампуса");
  expect((await listNotifications(classmate)).items.some((n) => n.kind.startsWith("PORTFOLIO"))).toBe(false);

  const again = await actOnOwnPortfolio(student, { action: "SUBMIT", id: item.id, expectedVersion: rejected.version });
  expect(again).toMatchObject({ status: "PENDING", reviewComment: null });
  const approved = await decidePortfolio(staff, { action: "APPROVE", id: item.id, expectedVersion: await version(item.id), comment: "" });
  expect(approved.status).toBe("APPROVED");
  await denied(actOnOwnPortfolio(student, { action: "SUBMIT", id: item.id, expectedVersion: approved.version }), 409);
  notes = (await listNotifications(student)).items.filter((n) => n.kind.startsWith("PORTFOLIO"));
  expect(notes.map((n) => n.kind).slice(0, 2)).toEqual(["PORTFOLIO_APPROVED", "PORTFOLIO_REJECTED"]);
  const keys = await db.notification.findMany({ where: { portfolioItemId: item.id }, select: { sourceKey: true } });
  expect(keys.map((k) => k.sourceKey).sort()).toEqual([`portfolio:${item.id}:1`, `portfolio:${item.id}:2`]);

  const visible = await staffStudentPortfolio(staff, student.membership.id);
  expect(visible.find((i) => i.id === item.id)?.status).toBe("APPROVED");
  expect(visible.every((i) => i.status !== "PRIVATE")).toBe(true);
  const row = (await staffPortfolioStudents(staff)).find((s) => s.id === student.membership.id);
  expect(row?.items).toBeGreaterThan(0);
  await denied(staffStudentPortfolio(foreignStaff, student.membership.id), 404);
  await denied(staffStudentPortfolio(staff, staff.membership.id), 404);
});

it("ограничения БД: скрытая работа без проверяющего, уведомление только со своим ключом", async () => {
  const item = await createPortfolioItem(classmate, meta(classmate, { mode: "PRIVATE" }), pdf);
  await expect(
    db.portfolioItem.update({ where: { id: item.id }, data: { reviewerId: staff.user.id } }),
  ).rejects.toThrow();
  await expect(
    db.notification.create({
      data: {
        universityId: uni,
        recipientMembershipId: classmate.membership.id,
        kind: "PORTFOLIO_APPROVED",
        portfolioItemId: item.id,
        sourceKey: `portfolio:${item.id}:x`,
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.notification.create({
      data: {
        universityId: uni,
        recipientMembershipId: student.membership.id,
        kind: "PORTFOLIO_APPROVED",
        portfolioItemId: item.id,
        sourceKey: `portfolio:${item.id}:1`,
      },
    }),
  ).rejects.toThrow();
});

it("не больше 20 работ у одного студента", async () => {
  const { a } = await fixture("STUDENT");
  await db.portfolioItem.createMany({
    data: Array.from({ length: 20 }, () => ({
      id: randomUUID(),
      universityId: uni,
      membershipId: a.membership.id,
      status: "PRIVATE",
      category: "SPORT",
      activity: "PARTICIPATION",
      eventDate: new Date("2026-10-01T00:00:00Z"),
      title: "Вымышленный забег",
      format: "IN_PERSON",
      eventType: "COMPETITION",
      participants: "UNKNOWN",
      level: "OTHER",
      organizers: [],
      byteSize: pdf.content.length,
      sha256: pdf.sha256,
      content: new Uint8Array(pdf.content),
    })),
  });
  await denied(createPortfolioItem(a, meta(a), pdf), 409);
});
