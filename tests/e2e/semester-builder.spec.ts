import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { reuseSession, rememberSession } from "./session-cache";
import { staffLanding } from "./ui-sign-in";
async function login(page: Page) {
  if (await reuseSession(page, "staff@example.test")) return;
  await page.goto("/login");
  await page
    .getByLabel("Демонстрационный логин", { exact: true })
    .fill("staff@example.test");
  await page
    .getByLabel("Демонстрационный пароль", { exact: true })
    .fill(process.env.DEMO_STAFF_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(staffLanding);
  await rememberSession(page, "staff@example.test");
}
async function save(form: Locator, page: Page) {
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
async function noOverflow(page: Page) {
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
}
test("semester calendar and real shared timetable work at 360, 390 and 1280; forms retain values on conflict", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await login(page);
  const suffix = randomUUID().slice(0, 8),
    title = `Демо исследовательский цикл ${suffix}`,
    subjectName = `Демо семестровая практика ${suffix}`;
  // Only fictional fixtures. Directory and all schedule operations use real protected HTTP.
  async function api(command: unknown) {
    const p = await page.request.post("/api/staff/schedule/builder", {
      headers: { origin: new URL(page.url()).origin },
      data: { command, preview: true },
    });
    expect(p.status()).toBe(200);
    const preview = await p.json();
    const r = await page.request.post("/api/staff/schedule/builder", {
      headers: { origin: new URL(page.url()).origin },
      data: { command, preview: false, token: preview.token, confirmed: true },
    });
    expect(r.status()).toBe(200);
    return preview;
  }
  const sid = randomUUID();
  expect(
    (
      await page.request.post("/api/staff/subjects", {
        headers: { origin: new URL(page.url()).origin },
        data: { action: "CREATE", operationId: sid, name: subjectName },
      })
    ).status(),
  ).toBe(200);
  const teacherId = randomUUID(),
    roomId = randomUUID();
  await api({
    action: "TEACHER_CREATE",
    operationId: teacherId,
    name: `Демо преподаватель ${suffix}`,
    subjectIds: [sid],
  });
  await api({
    action: "ROOM_CREATE",
    operationId: roomId,
    building: `Демо корпус ${suffix}`,
    number: "101",
  });
  const catalog = await (
    await page.request.get("/api/staff/schedule/builder")
  ).json();
  // New fictional program/groups use the existing structure API. Separate fixtures
  // allow standalone/Functions/VPS to repeat without colliding with prior runs.
  const faculty = catalog.faculties.find(
    (f: { programs: { groups: { id: string }[] }[] }) =>
      f.programs.some((p) => p.groups.some((g) => g.id === "group-1")),
  );
  const program = {
    id: randomUUID(),
    groups: [] as { id: string; name: string }[],
  };
  const post = (data: unknown) =>
    page.request.post("/api/staff/structure", {
      headers: { origin: new URL(page.url()).origin },
      data,
    });
  const createdProgram = await post({
    kind: "program",
    operationId: program.id,
    parentId: faculty.id,
    name: `Демо семестровое направление ${suffix}`,
    active: true,
  });
  expect(createdProgram.status()).toBe(200);
  program.id = (await createdProgram.json()).id;
  for (let n = 1; n <= 3; n++) {
    const g = { id: randomUUID(), name: `Демо поток ${suffix}-${n}` };
    const createdGroup = await post({
      kind: "group",
      operationId: g.id,
      parentId: program.id,
      name: g.name,
      active: true,
    });
    expect(createdGroup.status()).toBe(200);
    g.id = (await createdGroup.json()).id;
    program.groups.push(g);
  }
  const groups = program.groups.map((g) => g.id),
    extraGroup = groups[2];
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/staff/schedule/semesters");
  await page.getByLabel("Название семестра", { exact: true }).fill(title);
  await page
    .getByLabel("Дата начала семестра", { exact: true })
    .fill("01.02.2038");
  await page
    .getByLabel("Дата окончания семестра", { exact: true })
    .fill("28.02.2038");
  await page
    .getByLabel("Первая неделя-числитель (понедельник)", { exact: true })
    .fill("01.02.2038");
  await page
    .getByRole("button", { name: "Добавить исключение", exact: true })
    .click();
  await page
    .getByLabel("Начало исключения 1", { exact: true })
    .fill("08.02.2038");
  await page
    .getByLabel("Конец исключения 1", { exact: true })
    .fill("08.02.2038");
  await page
    .getByLabel("Пояснение", { exact: true })
    .fill("Демо учебный перерыв");
  const semesterForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Название семестра", { exact: true }) });
  await save(semesterForm, page);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const updated = await (
      await page.request.get("/api/staff/schedule/builder")
    ).json(),
    semester = updated.semesters.find(
      (s: { calendar: { name: string } }) => s.calendar.name === title,
    );
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await page
      .getByRole("region", { name: "Календарь семестра" })
      .evaluate((e) => e.scrollIntoView({ block: "start", inline: "nearest" }));
    await page.screenshot({
      path: info.outputPath(`semester-calendar-${width}.png`),
      fullPage: true,
    });
  }
  await page.goto(
    `/staff/schedule/builder?semesterId=${semester.id}&programId=${program.id}&day=2038-02-01`,
  );
  await expect(
    page.getByRole("combobox", { name: "Факультет", exact: true }),
  ).toHaveValue(faculty.id);
  await expect(
    page
      .getByRole("combobox", { name: "Направление", exact: true })
      .locator("option"),
  ).toHaveCount(faculty.programs.length + 2);
  await page
    .getByRole("button", { name: "Показать расписание", exact: true })
    .click();
  const inspector = page.locator("#builder-inspector");
  await expect(
    inspector.getByRole("heading", { name: "Добавить занятия", exact: true }),
  ).toBeVisible();
  await inspector
    .getByRole("combobox", { name: "Дисциплина", exact: true })
    .selectOption(sid);
  await inspector
    .getByRole("combobox", { name: "Преподаватель", exact: true })
    .selectOption(teacherId);
  await inspector
    .getByRole("combobox", { name: "Аудитория", exact: true })
    .selectOption(roomId);
  await expect(
    inspector.getByRole("combobox", { name: "Повторение", exact: true }),
  ).toHaveValue(
    process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1" ? "EVERY" : "ONCE",
  );
  await inspector
    .getByRole("combobox", { name: "Повторение", exact: true })
    .selectOption("EVERY");
  // Select exactly the two desired groups using stable values from the real directory.
  const groupOptions = updated.faculties
    .flatMap(
      (f: { programs: { groups: { id: string; name: string }[] }[] }) =>
        f.programs,
    )
    .flatMap((p: { groups: { id: string; name: string }[] }) => p.groups);
  for (const g of groupOptions.filter((g: { id: string }) =>
    program.groups.some((p: { id: string }) => p.id === g.id),
  )) {
    const checkbox = inspector.getByRole("checkbox", {
      name: g.name,
      exact: true,
    });
    if (await checkbox.count())
      await checkbox.setChecked(groups.includes(g.id));
  }
  await inspector
    .getByRole("checkbox", { name: `Демо поток ${suffix}-3`, exact: true })
    .check();
  await save(inspector.locator("form").first(), page);
  await expect(
    inspector.getByRole("heading", { name: "Добавить занятия", exact: true }),
  ).toBeVisible();
  const week = await (
    await page.request.get(
      `/api/staff/schedule/builder?semesterId=${semester.id}&programId=${program.id}&from=2038-02-01`,
    )
  ).json();
  const occurrence = week.entries.find(
    (e: { title: string }) => e.title === subjectName,
  );
  expect(occurrence.groupIds.sort()).toEqual(groups.sort());
  const cards = page
    .locator(".program-desktop")
    .getByRole("button")
    .filter({ hasText: subjectName });
  await expect(cards).toHaveCount(3);
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    if (width < 900)
      await expect(
        page.locator(".program-mobile .tile-time").first(),
      ).toBeVisible();
    await page
      .locator(width < 900 ? ".program-mobile" : ".program-desktop")
      .evaluate((e) => e.scrollIntoView({ block: "start", inline: "nearest" }));
    await page.screenshot({
      path: info.outputPath(`semester-builder-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Режим конструктора").selectOption("ONE");
  await page
    .getByRole("combobox", { name: "Группа", exact: true })
    .selectOption(extraGroup);
  await page
    .getByRole("button", { name: "Показать расписание", exact: true })
    .click();
  await page
    .locator(".program-mobile")
    .getByRole("button")
    .filter({ hasText: subjectName })
    .click();
  await expect(
    inspector.getByText("Это одна общая лекция.", { exact: false }),
  ).toBeVisible();
  await inspector.getByLabel("Начало занятия", { exact: true }).fill("11:00");
  await inspector.getByLabel("Конец занятия", { exact: true }).fill("12:00");
  await save(inspector.locator("form").first(), page);
  await expect(
    page
      .locator(".program-mobile")
      .getByRole("button")
      .filter({ hasText: subjectName }),
  ).toContainText("11:00");
  // Real group collision: a separate occurrence cannot use the occupied interval.
  await inspector
    .getByRole("combobox", { name: "Дисциплина", exact: true })
    .selectOption(sid);
  await inspector
    .getByRole("combobox", { name: "Преподаватель", exact: true })
    .selectOption(teacherId);
  await inspector
    .getByRole("combobox", { name: "Аудитория", exact: true })
    .selectOption(roomId);
  await inspector.getByLabel("Начало занятия", { exact: true }).fill("11:15");
  await inspector.getByLabel("Конец занятия", { exact: true }).fill("11:45");
  await inspector.getByLabel("Повторение").selectOption("ONCE");
  await inspector
    .getByLabel("Дата однократного занятия", { exact: true })
    .fill("01.02.2038");
  await inspector
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  // The historical runtime in the VPS upgrade rehearsal still says «Конфликт».
  await expect(inspector.getByRole("status").first()).toContainText(
    process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1"
      ? "Конфликт"
      : "Пересечение",
  );
  await expect(
    inspector.getByLabel("Начало занятия", { exact: true }),
  ).toHaveValue("11:15");
  await expect(
    inspector.getByRole("combobox", { name: "Дисциплина", exact: true }),
  ).toHaveValue(sid);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("semester-conflict-390.png"),
    fullPage: true,
  });
});

test("mobile resource forms support multiple subjects, subsequent creation, rename and activation without losing invalid input", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  page.setDefaultTimeout(15000);
  await login(page);
  const suffix = randomUUID().slice(0, 8),
    subject = `Демо ресурсная дисциплина ${suffix}`,
    teacher = `Демо наставник ${suffix}`;
  const response = await page.request.post("/api/staff/subjects", {
    headers: { origin: new URL(page.url()).origin },
    data: { action: "CREATE", operationId: randomUUID(), name: subject },
  });
  expect(response.status()).toBe(200);
  await page.setViewportSize({ width: 360, height: 800 });
  const secondSubject = `${subject} — методика`;
  expect(
    (
      await page.request.post("/api/staff/subjects", {
        headers: { origin: new URL(page.url()).origin },
        data: {
          action: "CREATE",
          operationId: randomUUID(),
          name: secondSubject,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/staff/schedule/resources");
  const panel = page.locator(".editor-panel"),
    form = panel.locator("form");
  await panel
    .getByLabel("Вымышленное имя преподавателя", { exact: true })
    .fill(teacher);
  await panel.getByRole("checkbox", { name: subject, exact: true }).check();
  await panel
    .getByRole("checkbox", { name: secondSubject, exact: true })
    .check();
  await save(form, page);
  await expect(
    page.getByRole("heading", { name: teacher, exact: true }),
  ).toBeVisible();
  const directory = await (
    await page.request.get("/api/staff/schedule/builder")
  ).json();
  expect(
    directory.teachers.find((t: { name: string }) => t.name === teacher)
      .subjectIds,
  ).toHaveLength(2);
  await expect(
    panel.getByRole("checkbox", { name: "Действующая запись", exact: true }),
  ).toBeChecked();
  await panel
    .getByLabel("Вымышленное имя преподавателя", { exact: true })
    .fill(teacher + " уточнение");
  await panel
    .getByRole("checkbox", { name: "Действующая запись", exact: true })
    .uncheck();
  await save(form, page);
  await expect(
    page.getByRole("heading", { name: teacher + " уточнение", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("checkbox", { name: "Действующая запись", exact: true }),
  ).not.toBeChecked();
  await panel
    .getByRole("checkbox", { name: "Действующая запись", exact: true })
    .check();
  await save(form, page);
  await expect(
    panel.getByRole("checkbox", { name: "Действующая запись", exact: true }),
  ).toBeChecked();
  await panel
    .getByRole("button", { name: "Добавить новую запись", exact: true })
    .click();
  await expect(
    panel.getByLabel("Вымышленное имя преподавателя", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Аудитории", exact: true }).click();
  await panel
    .getByLabel("Корпус", { exact: true })
    .fill(`Демо исследовательский корпус ${suffix}`);
  await panel.getByLabel("Номер аудитории", { exact: true }).fill("205");
  await save(form, page);
  await expect(
    page.getByRole("heading", {
      name: `Демо исследовательский корпус ${suffix} · 205`,
      exact: true,
    }),
  ).toBeVisible();
  const roomCard = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: `Демо исследовательский корпус ${suffix} · 205`,
      exact: true,
    }),
  });
  await panel
    .getByRole("checkbox", { name: "Действующая запись", exact: true })
    .uncheck();
  await save(form, page);
  await expect(roomCard.getByText("Неактивен", { exact: true })).toBeVisible();
  await panel
    .getByRole("checkbox", { name: "Действующая запись", exact: true })
    .check();
  await save(form, page);
  await expect(roomCard.getByText("Действует", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "Добавить новую запись", exact: true })
    .click();
  await panel
    .getByLabel("Корпус", { exact: true })
    .fill(`Демо исследовательский корпус ${suffix}`);
  await panel.getByLabel("Номер аудитории", { exact: true }).fill("205");
  await form
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText("уже существует");
  await expect(
    panel.getByLabel("Номер аудитории", { exact: true }),
  ).toHaveValue("205");
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("resource-error-360.png"),
    fullPage: true,
  });
});
