import { beforeAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/server/db";
import { auth } from "../src/server/auth";
import { actor, Denied } from "../src/server/security";
import { changeBuilder, type BuilderCommand } from "../src/server/semester-builder";
import { changeLesson, readSchedule } from "../src/server/schedule";
import { listNotifications } from "../src/server/notifications";
import { isMove } from "../src/server/notification-events";
import { changeExam, studentSession, nextExam } from "../src/server/session";
import {
  changeDeadline,
  studentDeadlines,
  markDeadline,
  ensureDeadlineReminders,
} from "../src/server/deadlines";
import { dayKey } from "../src/lib/schedule-time";
import { deadlineLeft } from "../src/lib/deadlines";
import { countdownLabel } from "../src/lib/session";
if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw Error("Требуется изолированная тестовая БД");
const uni = "demo-university",
  origin = process.env.BETTER_AUTH_URL!,
  zone = "Europe/Moscow";
type A = Awaited<ReturnType<typeof actor>>;
const facultyId = randomUUID(),
  programId = randomUUID(),
  groupA = randomUUID(),
  groupB = randomUUID(),
  subjectId = randomUUID(),
  semesterId = randomUUID();
const teachers = [randomUUID(), randomUUID()],
  rooms = [randomUUID(), randomUUID()];
let staff: A, foreignStaff: A, s1: A, s2: A;

async function fixture(role: "STUDENT" | "STAFF", universityId = uni, groupId = groupA) {
  const id = randomUUID(),
    email = `${id}@example.test`,
    password = randomUUID() + randomUUID();
  await db.user.create({
    data: {
      id,
      name: "Демо сессия " + id.slice(0, 4),
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
  const login = await auth.api.signInEmail({
    headers: new Headers({ origin }),
    body: { email, password },
    asResponse: true,
  });
  expect(login.status).toBe(200);
  return actor(
    new Headers({
      origin,
      cookie: login.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; "),
    }),
  );
}
const denied = async (p: Promise<unknown>, status?: number, text?: RegExp) => {
  const e = await p.then(
    () => null,
    (err) => err,
  );
  expect(e).toBeInstanceOf(Denied);
  if (status) expect((e as Denied).status).toBe(status);
  if (text) expect((e as Denied).message).toMatch(text);
};
async function commit(command: BuilderCommand) {
  const p = await changeBuilder(staff.user.id, uni, { command, preview: true });
  return changeBuilder(staff.user.id, uni, {
    command,
    preview: false,
    token: p.token,
    confirmed: true,
  });
}
const kinds = async (a: A, prefix: string) =>
  (await listNotifications(a)).items.filter((n) => n.kind.startsWith(prefix));

beforeAll(async () => {
  await db.faculty.create({ data: { id: facultyId, universityId: uni, name: "Демо факультет сессии" } });
  await db.program.create({ data: { id: programId, facultyId, name: "Демо направление сессии" } });
  await db.studentGroup.createMany({
    data: [
      { id: groupA, programId, name: "Демо С-1" },
      { id: groupB, programId, name: "Демо С-2" },
    ],
  });
  await db.subject.create({ data: { id: subjectId, universityId: uni, name: "Демо дисциплина сессии" } });
  staff = await fixture("STAFF");
  const foreignUni = randomUUID();
  await db.university.create({ data: { id: foreignUni, name: "Другой вымышленный вуз", timezone: zone } });
  foreignStaff = await fixture("STAFF", foreignUni);
  s1 = await fixture("STUDENT", uni, groupA);
  s2 = await fixture("STUDENT", uni, groupB);
  for (const operationId of teachers)
    await commit({
      action: "TEACHER_CREATE",
      operationId,
      name: "Демо преподаватель " + operationId.slice(0, 4),
      subjectIds: [subjectId],
    });
  for (const operationId of rooms)
    await commit({ action: "ROOM_CREATE", operationId, building: "Демо корпус", number: operationId.slice(0, 8) });
  await commit({
    action: "SEMESTER_CREATE",
    operationId: semesterId,
    calendar: {
      name: "Демо семестр сессии " + randomUUID(),
      start: "2036-04-01",
      end: "2036-05-31",
      anchor: "2036-03-31",
      exclusions: [],
    },
  });
  // Пары группы С-1 по понедельникам 09:00–10:30.
  await commit({
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId,
    programId,
    rule: {
      subjectId,
      teacherId: teachers[0],
      roomId: rooms[0],
      groupIds: [groupA],
      recurrence: "EVERY",
      weekday: 1,
      once: "2036-04-07",
      startTime: "09:00",
      endTime: "10:30",
    },
  });
});

it("перенос: только смена даты, времени, аудитории или преподавателя", () => {
  const base = { startsAt: new Date(1), endsAt: new Date(2), room: "101", teacher: "А" };
  expect(isMove(base, { ...base })).toBe(false);
  expect(isMove(base, { ...base, startsAt: new Date(0) })).toBe(true);
  expect(isMove(base, { ...base, room: "205" })).toBe(true);
  expect(isMove(base, { ...base, teacher: "Б" })).toBe(true);
});

it("перенос пары в конструкторе: «было → стало» студентам своей группы, предпросмотр ничего не рассылает", async () => {
  const entries = await db.scheduleEntry.findMany({
    where: { semesterId, status: "SCHEDULED" },
    orderBy: { startsAt: "asc" },
  });
  const lesson = entries[0];
  const day = dayKey(lesson.startsAt, zone);
  const move: BuilderCommand = {
    action: "OCCURRENCE_EDIT",
    id: lesson.id,
    version: lesson.version,
    day,
    subjectId,
    teacherId: teachers[0],
    roomId: rooms[1],
    startTime: "14:00",
    endTime: "15:30",
  };
  await changeBuilder(staff.user.id, uni, { command: move, preview: true });
  expect(await db.scheduleChange.count({ where: { entryId: lesson.id } })).toBe(0);
  await commit(move);
  const change = await db.scheduleChange.findUniqueOrThrow({ where: { id: `${lesson.id}:${lesson.version + 1}` } });
  expect(change.fromStartsAt.toISOString()).toBe(lesson.startsAt.toISOString());
  expect(change.toRoom).toContain(rooms[1].slice(0, 8));
  const notes = await kinds(s1, "SCHEDULE_MOVED");
  expect(notes[0]).toMatchObject({ title: "Занятие перенесено", target: { available: true, href: `/schedule?day=${day}` } });
  expect(notes[0].message).toContain("→");
  expect(await kinds(s2, "SCHEDULE_MOVED")).toHaveLength(0);
  const schedule = await readSchedule(s1, { day });
  const shown = schedule.lessons.find((l) => l.id === lesson.id)!;
  expect(shown.moved?.fromStartsAt).toBe(lesson.startsAt.toISOString());
  // Повтор без изменений не считается переносом.
  await commit({ ...move, version: lesson.version + 1 });
  expect(await db.scheduleChange.count({ where: { entryId: lesson.id } })).toBe(1);
  await expect(db.scheduleChange.update({ where: { id: change.id }, data: { title: "x" } })).rejects.toThrow();
  await denied(readSchedule(s2, { day, groupId: groupA }), 403);
});

it("перенос в ручном расписании: смена времени уведомляет, смена названия — нет", async () => {
  const created = await changeLesson(staff.user.id, uni, {
    action: "CREATE",
    groupId: groupB,
    title: "Демо ручная пара",
    teacher: "Демо Т",
    room: "Демо 1",
    day: "2036-06-10",
    start: "09:00",
    end: "10:00",
  });
  await changeLesson(staff.user.id, uni, {
    action: "EDIT",
    id: created.id,
    version: 1,
    groupId: groupB,
    title: "Демо ручная пара",
    teacher: "Демо Т",
    room: "Демо 1",
    day: "2036-06-10",
    start: "11:00",
    end: "12:00",
  });
  expect(await kinds(s2, "SCHEDULE_MOVED")).toHaveLength(1);
  await changeLesson(staff.user.id, uni, {
    action: "EDIT",
    id: created.id,
    version: 2,
    groupId: groupB,
    title: "Демо ручная пара (уточнено)",
    teacher: "Демо Т",
    room: "Демо 1",
    day: "2036-06-10",
    start: "11:00",
    end: "12:00",
  });
  expect(await kinds(s2, "SCHEDULE_MOVED")).toHaveLength(1);
});

it("сессия: пересечения, перенос, отмена, результат и доступ только своей группе", async () => {
  const exam = (extra: Record<string, unknown> = {}) => ({
    action: "CREATE",
    operationId: randomUUID(),
    kind: "EXAM",
    subjectId,
    groupIds: [groupA],
    day: "2036-04-14",
    startTime: "09:30",
    endTime: "12:00",
    teacherId: teachers[1],
    roomId: rooms[1],
    ...extra,
  });
  // 14.04.2036 — понедельник: у С-1 пара 09:00–10:30.
  await denied(changeExam(staff, exam()), 409, /Пересечение с парой/);
  await denied(changeExam(staff, exam({ day: "2020-01-10" })), 400, /прошедшее/);
  await denied(changeExam(staff, exam({ endTime: "09:00" })), 400);
  await denied(changeExam(s1, exam({ day: "2036-04-19" })), 403);
  const created = await changeExam(staff, exam({ day: "2036-04-19", startTime: "10:00", endTime: "13:00" }));
  await denied(
    changeExam(staff, exam({ groupIds: [groupB], day: "2036-04-19", startTime: "11:00", endTime: "12:00" })),
    409,
    /экзамен/,
  );
  // Пара поверх экзамена в конструкторе тоже не встанет.
  const lessonOverExam: BuilderCommand = {
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId,
    programId,
    rule: {
      subjectId,
      teacherId: teachers[0],
      roomId: rooms[0],
      groupIds: [groupA],
      recurrence: "ONCE",
      weekday: 7,
      once: "2036-04-19",
      startTime: "11:00",
      endTime: "12:00",
    },
  };
  await expect(changeBuilder(staff.user.id, uni, { command: lessonOverExam, preview: true })).rejects.toThrow(/Конфликт/);

  let session = await studentSession(s1);
  let item = session.items.find((i) => i.id === created.id)!;
  expect(item).toMatchObject({ upcoming: true, result: null, kind: "EXAM" });
  expect(session.summary).toEqual({ total: 1, passed: 0 });
  expect((await studentSession(s2)).items.some((i) => i.id === created.id)).toBe(false);
  expect((await readSchedule(s1, { day: "2036-04-19" })).lessons.some((l) => l.kind === "EXAM")).toBe(true);
  expect((await readSchedule(s2, { day: "2036-04-19" })).lessons.some((l) => l.kind === "EXAM")).toBe(false);
  expect(await nextExam(s1)).toBeNull(); // дальше 14 дней — на главной не показывается

  const move = { action: "MOVE", id: created.id, version: 1, day: "2036-04-20", startTime: "10:00", endTime: "13:00", teacherId: teachers[1], roomId: rooms[1] };
  await denied(changeExam(foreignStaff, move), 404);
  await denied(changeExam(staff, { ...move, day: "2036-04-19" }), 400, /Ничего не изменилось/);
  await changeExam(staff, move);
  await denied(changeExam(staff, move), 409);
  item = (await studentSession(s1)).items.find((i) => i.id === created.id)!;
  expect(item.moved).toMatchObject({ day: "2036-04-19", time: "10:00" });
  const examNotes = await kinds(s1, "EXAM");
  expect(examNotes[0]).toMatchObject({ kind: "EXAM_MOVED", target: { href: "/grades/session" } });
  expect(await kinds(s2, "EXAM")).toHaveLength(0);

  // Результат: только оценка, выставленная в день экзамена или позже.
  const grade = (issuedOn: string, mark: number) =>
    db.grade.create({
      data: { id: randomUUID(), universityId: uni, membershipId: s1.membership.id, subjectId, kind: "MARK", mark, issuedOn: new Date(issuedOn), authorId: staff.user.id },
    });
  await grade("2036-04-01", 2);
  expect((await studentSession(s1)).items.find((i) => i.id === created.id)!.result).toBeNull();
  await grade("2036-04-20", 4);
  session = await studentSession(s1);
  expect(session.items.find((i) => i.id === created.id)!.result).toEqual({ label: "4", passed: true });
  expect(session.summary).toEqual({ total: 1, passed: 1 });

  await changeExam(staff, { action: "CANCEL", id: created.id, version: 2 });
  session = await studentSession(s1);
  expect(session.items.find((i) => i.id === created.id)!).toMatchObject({ status: "CANCELLED", upcoming: false, result: null });
  expect(session.summary.total).toBe(0);
  expect((await kinds(s1, "EXAM"))[0]).toMatchObject({ kind: "EXAM_CANCELLED", title: "Отмена в сессии" });
  await denied(changeExam(staff, { action: "CANCEL", id: created.id, version: 3 }), 409, /отменён/);
  // Отменённый экзамен больше не занимает время.
  await expect(changeBuilder(staff.user.id, uni, { command: lessonOverExam, preview: true })).resolves.toBeTruthy();
});

it("дедлайны: адресаты, «Сделано», напоминание за 48 часов ровно один раз, отмена", async () => {
  const at = (hours: number) => {
    const d = new Date(Date.now() + hours * 3600000);
    return { day: dayKey(d, zone), time: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(d) };
  };
  const create = (scope: string, targetId: string | undefined, hours: number, title: string) =>
    changeDeadline(staff, { action: "CREATE", operationId: randomUUID(), scope, ...(targetId ? { targetId } : {}), title, body: "", ...at(hours) });
  const forGroup = await create("GROUP", groupA, 72, "Демо реферат");
  const forFaculty = await create("FACULTY", facultyId, 120, "Демо анкета факультета");
  await denied(create("GROUP", groupA, -1, "Прошлый срок"), 400, /прошёл/);
  await denied(create("FACULTY", randomUUID(), 72, "Чужой адресат"), 404);
  await denied(changeDeadline(s1, { action: "DELETE", id: forGroup.id }), 403);

  expect((await kinds(s1, "DEADLINE_NEW")).length).toBe(2);
  expect((await kinds(s2, "DEADLINE_NEW")).length).toBe(1);
  expect((await studentDeadlines(s1)).active.map((d) => d.id)).toEqual(expect.arrayContaining([forGroup.id, forFaculty.id]));
  expect((await studentDeadlines(s2)).active.map((d) => d.id)).not.toContain(forGroup.id);

  await denied(markDeadline(s2, { id: forGroup.id, done: true }), 404);
  await markDeadline(s1, { id: forGroup.id, done: true });
  await markDeadline(s1, { id: forGroup.id, done: true });
  expect((await studentDeadlines(s1)).active.find((d) => d.id === forGroup.id)?.done).toBe(true);
  await markDeadline(s1, { id: forGroup.id, done: false });
  expect((await studentDeadlines(s1)).active.find((d) => d.id === forGroup.id)?.done).toBe(false);

  // Напоминание: ≤ 48 ч — да, 49 ч — нет; повтор ничего не создаёт; «Сделано» — без напоминания.
  const soon = await create("GROUP", groupA, 47, "Демо лабораторная");
  const later = await create("GROUP", groupA, 49, "Демо эссе");
  const doneSoon = await create("GROUP", groupA, 47, "Демо тест");
  await markDeadline(s1, { id: doneSoon.id, done: true });
  expect(await ensureDeadlineReminders(s1)).toBe(1);
  expect(await ensureDeadlineReminders(s1)).toBe(0);
  const reminders = await db.notification.findMany({ where: { recipientMembershipId: s1.membership.id, kind: "DEADLINE_SOON" } });
  expect(reminders.map((r) => r.deadlineId)).toEqual([soon.id]);
  expect(reminders.some((r) => r.deadlineId === later.id)).toBe(false);
  expect(await ensureDeadlineReminders(s2)).toBe(0);
  expect((await kinds(s1, "DEADLINE_SOON"))[0]).toMatchObject({ title: "Скоро дедлайн", target: { href: "/deadlines" } });

  await changeDeadline(staff, { action: "DELETE", id: soon.id });
  await denied(changeDeadline(staff, { action: "DELETE", id: soon.id }), 404);
  await denied(changeDeadline(foreignStaff, { action: "DELETE", id: later.id }), 404);
  expect((await studentDeadlines(s1)).active.some((d) => d.id === soon.id)).toBe(false);
  expect((await kinds(s1, "DEADLINE_SOON"))[0].message).toContain("отменён");
  await expect(
    db.notification.create({
      data: { universityId: uni, recipientMembershipId: s1.membership.id, kind: "DEADLINE_SOON", deadlineId: later.id, sourceKey: `deadline:${later.id}:new` },
    }),
  ).rejects.toThrow();
});

it("остаток до срока и обратный отсчёт", () => {
  const now = "2036-04-10T12:00:00.000Z";
  expect(deadlineLeft({ dueAt: "2036-04-10T12:30:00.000Z", day: "2036-04-10" }, now, "2036-04-10")).toMatchObject({ label: "меньше часа", urgent: true });
  expect(deadlineLeft({ dueAt: "2036-04-11T05:00:00.000Z", day: "2036-04-11" }, now, "2036-04-10")).toMatchObject({ label: "осталось 17 ч", urgent: true });
  expect(deadlineLeft({ dueAt: "2036-04-13T20:59:00.000Z", day: "2036-04-13" }, now, "2036-04-10")).toMatchObject({ label: "через 3 дня", urgent: false });
  expect(deadlineLeft({ dueAt: "2036-04-10T11:00:00.000Z", day: "2036-04-10" }, now, "2036-04-10")).toMatchObject({ past: true });
  expect([0, 1, 2, 5, 11, 21, 22].map(countdownLabel)).toEqual(["сегодня", "завтра", "через 2 дня", "через 5 дней", "через 11 дней", "через 21 день", "через 22 дня"]);
});
