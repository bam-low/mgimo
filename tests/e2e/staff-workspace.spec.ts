import { test, expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signInWithSession } from "./ui-sign-in";
import { findPagedCard } from "./paging";

test("STAFF: два курса, вторник и числитель → отмена → уведомление → две оценки и общий средний", async ({
  page,
  browser,
  baseURL,
  httpCredentials,
  ignoreHTTPSErrors,
}, info) => {
  test.skip(
    process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1",
    "Новый рабочий экран отсутствует в исторической сборке",
  );
  test.setTimeout(240000);
  page.setDefaultTimeout(15000);
  await page.setViewportSize({ width: 360, height: 900 });
  await signInWithSession(
    page,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  const origin = new URL(page.url()).origin,
    suffix = randomUUID().slice(0, 8);
  const name = "Демо учебный путь " + suffix;
  const post = async (url: string, data: unknown) => {
    const response = await page.request.post(url, {
      headers: { origin },
      data,
    });
    expect(response.status(), `HTTP ${url}`).toBe(200);
    return response.json();
  };
  const command = async (command: Record<string, unknown>) => {
    const preview = await post("/api/staff/schedule/builder", {
      command,
      preview: true,
    });
    return post("/api/staff/schedule/builder", {
      command,
      preview: false,
      confirmed: true,
      token: preview.token,
    });
  };
  const structure = (kind: string, parentId?: string, course?: number) =>
    post("/api/staff/structure", {
      kind,
      name: `${name} · ${kind}${course ?? ""}`,
      operationId: randomUUID(),
      active: true,
      ...(parentId ? { parentId } : {}),
      ...(course ? { course } : {}),
    });
  const faculty = await structure("faculty"),
    program = await structure("program", faculty.id);
  const groups = [
    await structure("group", program.id, 1),
    await structure("group", program.id, 2),
  ];
  const subject = await post("/api/staff/subjects", {
    action: "CREATE",
    operationId: randomUUID(),
    name,
  });
  const teacherId = randomUUID(),
    roomId = randomUUID(),
    assignmentId = randomUUID();
  await command({
    action: "TEACHER_CREATE",
    operationId: teacherId,
    name: "Демо преподаватель " + suffix,
    subjectIds: [subject.id],
  });
  await command({
    action: "ROOM_CREATE",
    operationId: roomId,
    building: "Демо корпус",
    number: suffix,
  });
  await command({
    action: "ASSIGNMENT_CREATE",
    operationId: assignmentId,
    programId: program.id,
    subjectId: subject.id,
    kind: "LECTURE",
    groups: groups.map((g) => ({ groupId: g.id, teacherId })),
  });
  async function capture(label: string, target?: Locator) {
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (label === "03-schedule")
        await (
          (await page.locator(".program-desktop").isVisible())
            ? page.locator(".program-desktop tbody tr").nth(1)
            : page.locator(".program-mobile .mobile-timetable-day").nth(1)
        ).scrollIntoViewIfNeeded();
      else if (target) await target.scrollIntoViewIfNeeded();
      await page.evaluate(() => document.fonts.ready);
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
      await page.screenshot({ path: info.outputPath(`${label}-${width}.png`) });
    }
    await page.setViewportSize({ width: 360, height: 900 });
  }
  await page.goto("/staff/structure");
  const branch = page.locator(".structure-branch").filter({
    has: page.getByRole("heading", {
      name: `${name} · faculty`,
      exact: true,
    }),
  });
  await expect(branch.getByText("1 курс", { exact: false })).toBeVisible();
  await expect(branch.getByText("2 курс", { exact: false })).toBeVisible();
  await capture("01-structure", branch);
  await page.goto("/staff/schedule");
  const setup = page.locator(".semester-setup");
  if ((await setup.getAttribute("open")) === null)
    await setup.locator(":scope > summary").click();
  await setup.getByLabel("Название семестра", { exact: true }).fill(name);
  await setup
    .getByLabel("Дата начала семестра", { exact: true })
    .fill("01.09.2037");
  await setup
    .getByLabel("Дата окончания семестра", { exact: true })
    .fill("30.09.2037");
  await setup
    .getByRole("combobox", { name: "Неделя с датой начала", exact: true })
    .selectOption("A");
  const save = async (form: Locator, screenshot?: string) => {
    await form
      .getByRole("button", { name: "Проверить изменения", exact: true })
      .click();
    await expect(
      form.getByRole("heading", {
        name: "Предпросмотр перед сохранением",
        exact: true,
      }),
    ).toBeVisible();
    if (screenshot) await capture(screenshot, form.locator(".builder-preview"));
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
  };
  await save(setup.locator("form.builder-form"));
  const filters = page.locator("#builder-filters");
  await expect(
    filters.getByRole("combobox", { name: "Семестр", exact: true }),
  ).not.toHaveValue("");
  if ((await setup.getAttribute("open")) !== null)
    await setup.locator(":scope > summary").click();
  await filters
    .getByRole("combobox", { name: "Факультет", exact: true })
    .selectOption(faculty.id);
  await filters
    .getByRole("combobox", { name: "Направление", exact: true })
    .selectOption(program.id);
  await filters
    .getByRole("combobox", { name: "Курс", exact: true })
    .selectOption("1");
  await filters
    .getByRole("button", { name: "Показать расписание", exact: true })
    .click();
  const days = page.locator(".program-mobile .mobile-timetable-day");
  await expect(
    days
      .first()
      .getByText("Вне семестра — публикация недоступна", { exact: true }),
  ).toBeVisible();
  await days
    .filter({
      has: page.getByRole("heading", {
        name: "01.09.2037 · Числитель",
        exact: true,
      }),
    })
    .getByRole("button", { name: /^Добавить занятие 01\.09\.2037/ })
    .click();
  const inspector = page.locator("#builder-inspector");
  const publication = inspector.locator("form.builder-form").filter({
    has: page.getByRole("combobox", { name: "Повторение", exact: true }),
  });
  await expect(
    publication.getByRole("combobox", { name: "Повторение", exact: true }),
  ).toHaveValue("ONCE");
  await publication
    .getByRole("combobox", { name: "Готовая лекция или семинар", exact: true })
    .selectOption(assignmentId);
  await publication
    .getByRole("combobox", { name: "Аудитория", exact: true })
    .selectOption(roomId);
  await publication
    .getByRole("combobox", { name: "Повторение", exact: true })
    .selectOption("A");
  await expect(publication.locator(".placement-summary")).toContainText(
    "01.09.2037, 15.09.2037, 29.09.2037",
  );
  await capture("02-publication", publication);
  await save(publication, "03-preview");
  await filters
    .getByRole("combobox", { name: "Курс", exact: true })
    .selectOption("");
  await filters
    .getByRole("button", { name: "Показать расписание", exact: true })
    .click();
  await capture("03-schedule", page.locator(".week-nav").first());
  const entry = page
    .locator(".program-mobile .timetable-lesson")
    .filter({ hasText: name })
    .first();
  await entry.click();
  await inspector
    .getByText("Отмена, восстановление и удаление одного занятия", {
      exact: true,
    })
    .click();
  const cancellation = inspector
    .locator(".occurrence-status > section")
    .filter({
      has: page.getByRole("heading", { name: "Отменить", exact: true }),
    })
    .locator("form");
  // A genuine student is transferred through the existing staff form; restored in finally.
  const peer = await browser.newContext({
    baseURL,
    httpCredentials,
    ignoreHTTPSErrors,
  });
  await peer.addCookies(await page.context().cookies());
  const staffPage = await peer.newPage();
  let moved = false;
  async function transfer(groupId: string) {
    await staffPage.goto("/staff");
    const card = await findPagedCard(
      staffPage,
      staffPage
        .getByTestId("student-membership")
        .filter({ hasText: "Демо Студент 1" }),
      "Страницы студентов",
      "Следующие студенты",
    );
    await card.getByLabel("Целевая группа").selectOption(groupId);
    await card
      .getByLabel("Причина действия")
      .fill("Демо сквозная проверка рабочего экрана");
    const response = staffPage.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/staff/membership" &&
        r.request().method() === "POST",
    );
    await card
      .getByRole("button", { name: "Применить действие", exact: true })
      .click();
    expect((await response).status()).toBe(200);
  }
  const studentContext = await browser.newContext({
    baseURL,
    httpCredentials,
    ignoreHTTPSErrors,
  });
  const student = await studentContext.newPage();
  try {
    await transfer(groups[0].id);
    moved = true;
    await save(cancellation);
    await expect(
      page.locator(".program-mobile .timetable-lesson.is-cancelled").first(),
    ).toContainText(name);
    await signInWithSession(
      student,
      "student1@example.test",
      process.env.DEMO_STUDENT1_PASSWORD!,
    );
    await student.goto("/notifications");
    await expect(
      student
        .getByRole("link", { name: "Занятие отменено", exact: true })
        .first(),
    ).toBeVisible();
    const notice = (
      await (await student.request.get("/api/notifications")).json()
    ).items.find((n: { message: string }) => n.message.includes(name));
    expect(notice.message).toContain("01.09.2037 · 09:00–10:30");
    await student.goto(`/notifications/${notice.id}`);
    await student.screenshot({
      path: info.outputPath("04-student-notification-360.png"),
    });
    await page.goto(`/staff/grades?groupId=${groups[0].id}`);
    const option = page
      .getByRole("combobox", { name: "Студент", exact: true })
      .locator("option")
      .filter({ hasText: "Студент 1" });
    const membershipId = (await option.getAttribute("value"))!;
    await page
      .getByRole("combobox", { name: "Студент", exact: true })
      .selectOption(membershipId);
    await page
      .getByRole("button", { name: "Открыть результаты", exact: true })
      .click();
    for (const mark of [3, 5]) {
      const form = page.getByRole("form", {
        name: "Выставить результат",
        exact: true,
      });
      await form
        .getByRole("combobox", { name: "Дисциплина", exact: true })
        .selectOption(subject.id);
      await form
        .getByLabel("Дата выставления", { exact: true })
        .fill("01.09.2037");
      await form
        .getByRole("combobox", { name: "Результат", exact: true })
        .selectOption(String(mark));
      const response = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/staff/grades" &&
          r.request().method() === "POST",
      );
      await form
        .getByRole("button", { name: "Выставить результат", exact: true })
        .click();
      expect((await response).status()).toBe(200);
      await expect(
        page
          .locator(".grade-subject")
          .filter({ has: page.getByRole("heading", { name, exact: true }) })
          .getByTestId("grade-row"),
      ).toHaveCount(mark === 3 ? 1 : 2);
    }
    await page.goto(
      `/staff/grades?groupId=${groups[0].id}&student=${membershipId}&from=2037-09-01&to=2037-09-30`,
    );
    await expect(page.getByTestId("grade-average")).toHaveText("4");
    await expect(
      page
        .locator(".grade-subject")
        .filter({ has: page.getByRole("heading", { name, exact: true }) }),
    ).toHaveCount(1);
    await capture("05-grades", page.locator(".grade-summary"));
    await student.goto("/grades?from=2037-09-01&to=2037-09-30");
    await expect(student.getByTestId("grade-average")).toHaveText("4");
    const summary = (
      await (
        await student.request.get("/api/grades?from=2037-09-01&to=2037-09-30")
      ).json()
    ).summary;
    expect(summary).toEqual({ average: 4, count: 2, passed: 0, failed: 0 });
  } finally {
    if (moved) await transfer("group-1");
    await peer.close();
    await studentContext.close();
  }
});
