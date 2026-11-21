import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor, Denied } from "../src/server/security";
import {
  changeBuilder,
  type BuilderCommand,
} from "../src/server/semester-builder";
import {
  importSchedule,
  importTemplate,
  parseCsv,
} from "../src/server/schedule-import";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Требуется изолированная тестовая БД");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!;
type A = Awaited<ReturnType<typeof actor>>;
const tag = randomUUID().slice(0, 6);
const names = {
  g1: `Импорт ${tag} 1`,
  g2: `Импорт ${tag} 2`,
  subject: `Импортная дисциплина ${tag}`,
  teacher: `Импортный преподаватель ${tag}`,
  building: `Корпус ${tag}`,
};
const facultyId = randomUUID(),
  programId = randomUUID(),
  subjectId = randomUUID(),
  semesterId = randomUUID(),
  teacherId = randomUUID(),
  roomId = randomUUID();
let staff: A, student: A, foreign: A;

async function fixture(role: string, universityId = uni) {
  const id = randomUUID(),
    password = randomUUID() + randomUUID(),
    email = id + "@example.test";
  await db.user.create({
    data: {
      id,
      name: "Демо импорт",
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
  const r = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return actor(new Headers({ origin, cookie }));
}
async function commit(command: BuilderCommand) {
  const p = await changeBuilder(staff.user.id, uni, { command, preview: true });
  return changeBuilder(staff.user.id, uni, {
    command,
    preview: false,
    token: p.token,
    confirmed: true,
  });
}
const HEADER =
  "Группы;Дисциплина;День недели;Начало;Конец;Повторение;Дата (только для однократного занятия);Преподаватель;Корпус;Аудитория";
const line = (o: Partial<Record<string, string>> = {}) =>
  [
    o.groups ?? names.g1,
    o.subject ?? names.subject,
    o.day ?? "Пн",
    o.start ?? "09:00",
    o.end ?? "10:30",
    o.repeat ?? "каждую неделю",
    o.date ?? "",
    o.teacher ?? names.teacher,
    o.building ?? names.building,
    o.room ?? "1",
  ].join(";");
const csv = (...rows: string[]) => "﻿" + [HEADER, ...rows].join("\r\n");
const templates = () => db.scheduleTemplate.count({ where: { semesterId } });

beforeAll(async () => {
  staff = await fixture("STAFF");
  student = await fixture("STUDENT");
  const foreignUni = randomUUID();
  await db.university.create({
    data: {
      id: foreignUni,
      name: "Чужой вымышленный вуз",
      timezone: "Europe/Moscow",
    },
  });
  foreign = await fixture("STAFF", foreignUni);
  await db.faculty.create({
    data: { id: facultyId, universityId: uni, name: "Импорт факультет " + tag },
  });
  await db.program.create({
    data: { id: programId, facultyId, name: "Импорт направление " + tag },
  });
  await db.studentGroup.createMany({
    data: [
      { id: randomUUID(), programId, name: names.g1 },
      { id: randomUUID(), programId, name: names.g2 },
    ],
  });
  await db.subject.create({
    data: { id: subjectId, universityId: uni, name: names.subject },
  });
  await commit({
    action: "TEACHER_CREATE",
    operationId: teacherId,
    name: names.teacher,
    subjectIds: [subjectId],
  });
  await commit({
    action: "ROOM_CREATE",
    operationId: roomId,
    building: names.building,
    number: "1",
  });
  await commit({
    action: "SEMESTER_CREATE",
    operationId: semesterId,
    calendar: {
      name: "Импорт семестр " + tag,
      start: "2035-02-05",
      end: "2035-03-04",
      anchor: "2035-02-05",
      exclusions: [],
    },
  });
});
afterAll(() => db.$disconnect());

it("CSV: точка с запятой и запятая, кавычки, BOM, пустые строки", () => {
  expect(parseCsv('﻿a;b\r\n"x;1";"он сказал ""да"""\r\n\r\n')).toEqual([
    ["a", "b"],
    ["x;1", 'он сказал "да"'],
  ]);
  expect(parseCsv("a,b\n1,2")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
});

it("Только сотрудник своего вуза; шаблон содержит заголовки", async () => {
  await expect(
    importSchedule(student, { semesterId, csv: csv(line()), confirm: false }),
  ).rejects.toBeInstanceOf(Denied);
  await expect(
    importSchedule(foreign, { semesterId, csv: csv(line()), confirm: false }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(importTemplate(student)).rejects.toBeInstanceOf(Denied);
  const template = await importTemplate(staff);
  expect(template.startsWith("﻿" + HEADER)).toBe(true);
  // Старый заголовок «Дата» тоже принимается.
  const legacy = await importSchedule(staff, {
    semesterId,
    confirm: false,
    csv: csv(line()).replace("Дата (только для однократного занятия)", "Дата"),
  });
  expect(legacy.error).toBeUndefined();
});

it("Предпросмотр ничего не пишет и находит ошибки, включая конфликт между строками файла", async () => {
  const before = await templates();
  const r = await importSchedule(staff, {
    semesterId,
    confirm: false,
    csv: csv(
      line(),
      line({
        groups: `${names.g1}, ${names.g2}`,
        start: "09:30",
        end: "11:00",
      }),
      line({ teacher: "Нет такого преподавателя" }),
      line({ day: "Вт", repeat: "однократно", date: "31.02.2035" }),
      line({ day: "Ср", repeat: "числитель", start: "12:00", end: "11:00" }),
      line({
        groups: names.g2,
        day: "Чт",
        repeat: "однократно",
        date: "15.02.2035",
      }),
    ),
  });
  expect(r.published).toBe(false);
  expect(await templates()).toBe(before);
  const status = r.rows.map((x) => x.status);
  expect(status).toEqual(["new", "error", "error", "error", "error", "new"]);
  expect(r.rows[1].message).toMatch(/Конфликт/);
  expect(r.rows[2].message).toMatch(/не найден/);
  expect(r.rows[3].message).toMatch(/дата/);
  expect(r.rows[4].message).toMatch(/позже начала/);
  expect(r.rows[0].lessons).toBe(4);
  expect(r.rows[5].lessons).toBe(1);
  expect(r.lessons).toBe(5);
  expect(r.errors).toBe(4);
});

it("Публикация — всё или ничего; повторная загрузка помечает строки как существующие", async () => {
  const before = await templates();
  const bad = await importSchedule(staff, {
    semesterId,
    confirm: true,
    csv: csv(line({ day: "Пт" }), line({ day: "Пт", room: "999" })),
  });
  expect(bad.published).toBe(false);
  expect(bad.error).toMatch(/Публикация отменена/);
  expect(await templates()).toBe(before);
  const good = csv(
    line({ day: "Пт" }),
    line({ groups: names.g2, day: "Пт", start: "11:00", end: "12:30" }),
  );
  const ok = await importSchedule(staff, {
    semesterId,
    confirm: true,
    csv: good,
  });
  expect(ok.published).toBe(true);
  expect(ok.created).toBe(2);
  expect(await templates()).toBe(before + 2);
  expect(
    await db.auditLog.count({
      where: { actorId: staff.user.id, action: "TEMPLATE_CREATE" },
    }),
  ).toBeGreaterThanOrEqual(2);
  const again = await importSchedule(staff, {
    semesterId,
    confirm: false,
    csv: good,
  });
  expect(again.rows.map((x) => x.status)).toEqual(["exists", "exists"]);
  expect(again.created).toBe(0);
});

it("Неверные заголовки и слишком большой файл отклоняются понятным сообщением", async () => {
  const r = await importSchedule(staff, {
    semesterId,
    confirm: false,
    csv: "Группа;Предмет\nА;Б",
  });
  expect(r.error).toMatch(/нет колонок/);
  const many = csv(...Array.from({ length: 201 }, () => line()));
  expect(
    (await importSchedule(staff, { semesterId, confirm: false, csv: many }))
      .error,
  ).toMatch(/Не более 200/);
});
