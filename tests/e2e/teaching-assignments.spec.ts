import { test, expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signInWithSession } from "./ui-sign-in";
import { findPagedCard } from "./paging";

test("staff configures a shared lecture and separate seminars; previews partial A/B weeks and room conflicts at 360px and desktop", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(20000);
  await signInWithSession(
    page,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  await page.setViewportSize({ width: 360, height: 900 });
  const origin = new URL(page.url()).origin,
    suffix = randomUUID().slice(0, 6);
  async function post(path: string, data: unknown) {
    const r = await page.request.post(path, { headers: { origin }, data });
    expect(r.status(), path).toBe(200);
    return r.json();
  }
  async function publish(command: unknown) {
    const p = await post("/api/staff/schedule/builder", {
      command,
      preview: true,
    });
    return post("/api/staff/schedule/builder", {
      command,
      preview: false,
      token: p.token,
      confirmed: true,
    });
  }
  async function save(form: Locator) {
    await form
      .getByRole("button", { name: "Проверить изменения", exact: true })
      .click();
    await expect(
      form.getByRole("heading", { name: "Предпросмотр перед сохранением" }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/staff/schedule/builder" &&
        r.request().method() === "POST" &&
        r.request().postDataJSON()?.preview === false,
    );
    await form
      .getByRole("button", { name: "Подтвердить и сохранить", exact: true })
      .click();
    expect((await response).status()).toBe(200);
  }
  async function capture(name: string, target?: Locator) {
    for (const width of [
      "lecture-preview",
      "partial-first-week",
      "published-denominator",
    ].includes(name)
      ? [360, 390, 768, 1280]
      : [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (target) {
        const shown = (await target.isVisible())
          ? target
          : page.locator(".program-desktop");
        await shown.scrollIntoViewIfNeeded();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator(".workspace-scroll")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`) });
    }
    await page.setViewportSize({ width: 360, height: 900 });
  }
  const catalog = await (
    await page.request.get("/api/staff/schedule/builder")
  ).json();
  const faculty = catalog.faculties.find(
    (f: { id: string }) => f.id === "faculty-1",
  );
  const program = await post("/api/staff/structure", {
    kind: "program",
    operationId: randomUUID(),
    parentId: faculty.id,
    name: `Демо прикладная математика ${suffix}`,
    active: true,
  });
  const groups: { id: string; name: string }[] = [];
  for (const name of ["МТ-101", "МТ-102", "МТ-103"]) {
    const row = await post("/api/staff/structure", {
      kind: "group",
      operationId: randomUUID(),
      parentId: program.id,
      name: `${name} · ${suffix}`,
      active: true,
    });
    groups.push({ id: row.id, name: `${name} · ${suffix}` });
  }
  const subjectId = randomUUID(),
    subjectName = `Математический анализ · ${suffix}`;
  await post("/api/staff/subjects", {
    action: "CREATE",
    operationId: subjectId,
    name: subjectName,
  });
  const teachers = [randomUUID(), randomUUID(), randomUUID()],
    room = randomUUID(),
    seminarRoom = randomUUID();
  for (const [i, id] of teachers.entries())
    await publish({
      action: "TEACHER_CREATE",
      operationId: id,
      name: `Демо преподаватель ${["лекции", "семинара Б", "семинара В"][i]} · ${suffix}`,
      subjectIds: [subjectId],
    });
  await publish({
    action: "ROOM_CREATE",
    operationId: room,
    building: `Учебный корпус · ${suffix}`,
    number: "305",
  });
  await publish({
    action: "ROOM_CREATE",
    operationId: seminarRoom,
    building: `Учебный корпус · ${suffix}`,
    number: "306",
  });
  const semesterId = randomUUID();
  await publish({
    action: "SEMESTER_CREATE",
    operationId: semesterId,
    calendar: {
      name: `Демо неполный сентябрь · ${suffix}`,
      start: "2026-09-01",
      end: "2026-09-29",
      anchor: "2026-08-31",
      exclusions: [
        {
          from: "2026-09-22",
          to: "2026-09-22",
          reason: "Демо учебный перерыв",
        },
      ],
    },
  });
  await page.goto(`/staff/schedule/assignments?programId=${program.id}`);
  let form = page.locator(".assignment-layout .editor-panel form.builder-form");
  await form
    .getByRole("combobox", { name: "Дисциплина", exact: true })
    .selectOption(subjectId);
  for (const g of groups.slice(0, 2))
    await form.getByRole("checkbox", { name: g.name, exact: true }).check();
  await form
    .getByRole("combobox", { name: "Преподаватель лекции", exact: true })
    .selectOption(teachers[0]);
  await save(form);
  await expect(
    page.getByRole("heading", { name: "Изменить назначение" }),
  ).toBeVisible();
  await capture(
    "lecture-assignment",
    page.locator(".assignment-layout .editor-panel"),
  );
  await page
    .getByRole("button", { name: "Добавить настройку", exact: true })
    .click();
  form = page.locator(".assignment-layout .editor-panel form.builder-form");
  await form
    .getByRole("combobox", { name: "Дисциплина", exact: true })
    .selectOption(subjectId);
  await form
    .getByRole("combobox", { name: "Вид занятия", exact: true })
    .selectOption("SEMINAR");
  for (const g of groups.slice(0, 2))
    await form.getByRole("checkbox", { name: g.name, exact: true }).check();
  await form
    .getByRole("combobox", {
      name: `Преподаватель семинара · ${groups[0].name}`,
      exact: true,
    })
    .selectOption(teachers[1]);
  await form
    .getByRole("combobox", {
      name: `Преподаватель семинара · ${groups[1].name}`,
      exact: true,
    })
    .selectOption(teachers[2]);
  await capture(
    "seminar-assignment",
    page.locator(".assignment-layout .editor-panel"),
  );
  await save(form);
  await expect(
    page.getByRole("heading", { name: "Изменить назначение" }),
  ).toBeVisible();
  const updated = await (
    await page.request.get("/api/staff/schedule/builder")
  ).json();
  const lecture = updated.assignments.find(
    (a: { subjectId: string; kind: string }) =>
      a.subjectId === subjectId && a.kind === "LECTURE",
  );
  const seminars = updated.assignments.find(
    (a: { subjectId: string; kind: string }) =>
      a.subjectId === subjectId && a.kind === "SEMINAR",
  );
  expect(lecture.groups).toHaveLength(2);
  expect(seminars.groups).toHaveLength(2);
  // Occupied room with a different group/teacher: the error must specifically name the room.
  await publish({
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId,
    programId: program.id,
    rule: {
      subjectId,
      teacherId: teachers[2],
      roomId: room,
      groupIds: [groups[2].id],
      recurrence: "ONCE",
      weekday: 2,
      once: "2026-09-08",
      startTime: "12:00",
      endTime: "13:00",
    },
  });
  await page.goto(
    `/staff/schedule/builder?semesterId=${semesterId}&programId=${program.id}&groupId=${groups[0].id}&day=2026-09-01`,
  );
  await page
    .getByRole("button", { name: "Показать расписание", exact: true })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Недели конструктора" }),
  ).toContainText("31.08.2026 — 06.09.2026 · Числитель");
  await expect(
    page.locator(".program-mobile").getByRole("button", {
      name: `Добавить занятие 31.08.2026 · ${groups[0].name}`,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".program-mobile .mobile-timetable-day")
      .filter({ hasText: "31.08.2026" })
      .getByText("Вне учебных дней", { exact: true }),
  ).toBeVisible();
  await capture("partial-first-week", page.locator(".program-mobile"));
  await page
    .locator(".program-mobile")
    .getByRole("button", {
      name: `Добавить занятие 01.09.2026 · ${groups[0].name}`,
    })
    .click();
  const inspector = page.locator("#builder-inspector");
  await inspector
    .getByRole("combobox", { name: "Готовая лекция или семинар", exact: true })
    .selectOption(lecture.id);
  await expect(
    inspector.getByText("Общая лекция появится у всех групп:"),
  ).toBeVisible();
  await inspector
    .getByRole("combobox", { name: "Повторение", exact: true })
    .selectOption("B");
  await expect(
    inspector.getByRole("combobox", { name: "День недели", exact: true }),
  ).toHaveValue("2");

  await inspector
    .getByRole("combobox", { name: "Аудитория", exact: true })
    .selectOption(room);
  await inspector.getByLabel("Начало занятия", { exact: true }).fill("12:00");
  await inspector.getByLabel("Конец занятия", { exact: true }).fill("13:00");
  await inspector
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  await expect(inspector.getByRole("status").first()).toContainText(
    "аудитория 305",
  );
  await expect(inspector.getByRole("status").first()).toContainText(
    "08.09.2026 (вт)",
  );
  await expect(
    inspector.getByLabel("Начало занятия", { exact: true }),
  ).toHaveValue("12:00");
  await capture("room-conflict", inspector.getByRole("status").first());
  await inspector.getByLabel("Начало занятия", { exact: true }).fill("09:00");
  await inspector.getByLabel("Конец занятия", { exact: true }).fill("10:30");
  const placement = inspector.locator("form").first();
  await placement
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  const preview = placement.getByRole("region", {
    name: "Предпросмотр изменений",
  });
  await expect(preview).toContainText(groups[0].name);
  await expect(preview).toContainText(groups[1].name);
  await expect(preview).toContainText("08.09.2026");
  await expect(preview).toContainText("Исключено: 22.09.2026");
  await capture("lecture-preview", preview);
  const commitResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/staff/schedule/builder" &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.preview === false,
  );
  await placement
    .getByRole("button", { name: "Подтвердить и сохранить" })
    .click();
  expect((await commitResponse).status()).toBe(200);
  await expect(
    page.getByRole("status").filter({ hasText: "Опубликовано занятий:" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Переход по типу недели" })
    .getByRole("button", { name: /^Знаменатель/ })
    .click();
  await expect(page.locator(".program-mobile .is-published")).toHaveCount(1);
  await capture("published-denominator", page.locator(".program-mobile"));
  // Place both seminars from the same catalog; no repeated subject/teacher entry.
  for (let i = 0; i < 2; i++) {
    await page.goto(
      `/staff/schedule/builder?semesterId=${semesterId}&programId=${program.id}&groupId=${groups[i].id}&day=2026-09-02`,
    );
    await page
      .getByRole("button", { name: "Показать расписание", exact: true })
      .click();
    await page
      .locator(".program-mobile")
      .getByRole("button", {
        name: `Добавить занятие 02.09.2026 · ${groups[i].name}`,
      })
      .click();
    await inspector
      .getByRole("combobox", {
        name: "Готовая лекция или семинар",
        exact: true,
      })
      .selectOption(seminars.id + ":" + groups[i].id);
    await expect(inspector.locator(".ready-lessons")).toContainText(
      `Демо преподаватель семинара ${i ? "В" : "Б"}`,
    );
    await inspector
      .getByRole("combobox", { name: "Повторение", exact: true })
      .selectOption("A");
    await inspector
      .getByRole("combobox", { name: "Аудитория", exact: true })
      .selectOption(i ? seminarRoom : room);
    await inspector.getByLabel("Начало занятия", { exact: true }).fill("14:00");
    await inspector.getByLabel("Конец занятия", { exact: true }).fill("15:00");
    await save(inspector.locator("form").first());
  }
  const read = async (from: string) =>
    (
      await page.request.get(
        `/api/staff/schedule/builder?semesterId=${semesterId}&programId=${program.id}&from=${from}`,
      )
    ).json();
  const first = await read("2026-08-31"),
    second = await read("2026-09-07");
  const shared = second.entries.filter(
    (e: { title: string; groupIds: string[] }) =>
      e.title === subjectName && e.groupIds.length === 2,
  );
  expect(shared).toHaveLength(1);
  expect(shared[0].groupIds.sort()).toEqual(
    groups
      .slice(0, 2)
      .map((g) => g.id)
      .sort(),
  );
  expect(first.entries).toHaveLength(2);
  expect(
    new Set(first.entries.map((e: { roomId: string }) => e.roomId)),
  ).toEqual(new Set([room, seminarRoom]));
  for (let i = 0; i < 2; i++)
    expect(
      first.entries.find((e: { groupIds: string[] }) =>
        e.groupIds.includes(groups[i].id),
      ).teacherId,
    ).toBe(teachers[i + 1]);
  // Reuse genuine student sessions; transfer and restore through the existing UI.
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ baseURL: origin });
    const student = await context.newPage();
    await signInWithSession(
      student,
      `student${i + 1}@example.test`,
      process.env[`DEMO_STUDENT${i + 1}_PASSWORD`]!,
    );
    const old = await (await student.request.get("/api/group")).json();
    async function transfer(group: string) {
      await page.goto("/staff");
      const card = await findPagedCard(
        page,
        page
          .getByTestId("student-membership")
          .filter({ hasText: `Демо Студент ${i + 1}` }),
        "Страницы студентов",
        "Следующие студенты",
      );
      await card.getByLabel("Целевая группа").selectOption(group);
      await card
        .getByLabel("Причина действия")
        .fill("Демо проверка каталога занятий");
      const response = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/staff/membership" &&
          r.request().method() === "POST",
      );
      await card.getByRole("button", { name: "Применить действие" }).click();
      expect((await response).status()).toBe(200);
      await expect(
        card.getByText(
          "Группа: " + (group === old.id ? old.name : groups[i].name),
          { exact: true },
        ),
      ).toBeVisible();
    }
    try {
      await transfer(groups[i].id);
      const ownFirst = await student.request.get(
        "/api/schedule?day=2026-09-02&view=week",
      );
      expect(ownFirst.status()).toBe(200);
      const own = await ownFirst.json();
      expect(JSON.stringify(own)).toContain(
        `Демо преподаватель семинара ${i ? "В" : "Б"}`,
      );
      expect(JSON.stringify(own)).not.toContain(
        `Демо преподаватель семинара ${i ? "Б" : "В"}`,
      );
      const ownSecond = await (
        await student.request.get("/api/schedule?day=2026-09-08&view=week")
      ).json();
      expect(
        ownSecond.lessons.filter((e: { id: string }) => e.id === shared[0].id),
      ).toHaveLength(1);
      await student.setViewportSize({ width: 360, height: 900 });
      await student.goto("/schedule?view=week");
      await student.getByLabel("Дата", { exact: true }).fill("08.09.2026");
      await expect(
        student.getByText(subjectName, { exact: true }),
      ).toBeVisible();
      await student.screenshot({
        path: info.outputPath(`student-${i + 1}-shared-lecture.png`),
      });
    } finally {
      await transfer(old.id);
      await context.close();
    }
  }
  const nextSemester = randomUUID();
  await publish({
    action: "SEMESTER_CREATE",
    operationId: nextSemester,
    calendar: {
      name: `Демо следующий цикл · ${suffix}`,
      start: "2027-02-02",
      end: "2027-02-28",
      anchor: "2027-02-01",
      exclusions: [],
    },
  });
  await publish({
    action: "TEMPLATE_CREATE",
    operationId: randomUUID(),
    semesterId: nextSemester,
    programId: program.id,
    assignment: { id: lecture.id, version: 1 },
    rule: {
      subjectId,
      teacherId: teachers[0],
      roomId: room,
      groupIds: groups.slice(0, 2).map((g) => g.id),
      recurrence: "EVERY",
      weekday: 2,
      once: "2027-02-02",
      startTime: "09:00",
      endTime: "10:30",
    },
  });
  const freshGroup = await post("/api/staff/structure", {
    kind: "group",
    operationId: randomUUID(),
    parentId: program.id,
    name: `Новая группа · ${suffix}`,
    active: true,
  });
  const after = await (
    await page.request.get("/api/staff/schedule/builder")
  ).json();
  expect(
    after.subjects.filter((s: { id: string }) => s.id === subjectId),
  ).toHaveLength(1);
  expect(
    after.assignments
      .find((a: { id: string }) => a.id === lecture.id)
      .groups.some((g: { groupId: string }) => g.groupId === freshGroup.id),
  ).toBe(false);
});

test("a new semester starting Tuesday defaults to numerator and can start in denominator without moving its start", async ({
  page,
}, info) => {
  await signInWithSession(
    page,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/staff/schedule/semesters");
  const form = page
    .locator("form")
    .filter({ has: page.getByLabel("Название семестра", { exact: true }) });
  await form
    .getByLabel("Название семестра", { exact: true })
    .fill("Демо начало во вторник " + randomUUID().slice(0, 6));
  await form
    .getByLabel("Дата начала семестра", { exact: true })
    .fill("01.09.2026");
  await form
    .getByLabel("Дата окончания семестра", { exact: true })
    .fill("29.09.2026");
  await expect(
    form.getByLabel("Первая неделя-числитель (понедельник)", { exact: true }),
  ).toHaveValue("31.08.2026");
  await form
    .getByRole("combobox", { name: "Неделя с датой начала", exact: true })
    .selectOption("B");
  await expect(
    form.getByLabel("Первая неделя-числитель (понедельник)", { exact: true }),
  ).toHaveValue("24.08.2026");
  await expect(
    form.getByLabel("Дата начала семестра", { exact: true }),
  ).toHaveValue("01.09.2026");
  await expect(page.locator(".calendar-week").first()).toContainText(
    "Знаменатель",
  );
  await page
    .getByRole("region", { name: "Календарь семестра" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("start-in-denominator-360.png"),
  });
  await form
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/staff/schedule/builder" &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.preview === false,
  );
  await form
    .getByRole("button", { name: "Подтвердить и сохранить", exact: true })
    .click();
  expect((await response).status()).toBe(200);
});
