import { gradeRows } from "./grade-rows";
import { test, expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signInWithSession } from "./ui-sign-in";
import { findPagedCard } from "./paging";

test("Расписание → успеваемость: общий Subject, обязательная группа, перевод и сохранённая история", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  await signInWithSession(
    page,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  await page.setViewportSize({ width: 360, height: 900 });
  const origin = new URL(page.url()).origin,
    name = "Демо межмодульная дисциплина " + randomUUID().slice(0, 6);
  async function capture(label: string, target?: Locator) {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (target) await target.scrollIntoViewIfNeeded();
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
  await page.goto("/staff/schedule/assignments?programId=program-1");
  await page
    .getByText("Нет дисциплины? Создать по названию", { exact: true })
    .click();
  await page
    .getByLabel("Название новой дисциплины", { exact: true })
    .fill(name);
  const created = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/staff/subjects" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Создать дисциплину", exact: true })
    .click();
  const subjectResponse = await created;
  expect(subjectResponse.status()).toBe(200);
  const subjectId: string = subjectResponse
    .request()
    .postDataJSON().operationId;
  const assignmentForm = page.locator(
    ".assignment-layout .editor-panel .builder-form",
  );
  await expect(
    assignmentForm.getByRole("combobox", { name: "Дисциплина", exact: true }),
  ).toHaveValue(subjectId);
  const teacherId = randomUUID(),
    command = {
      action: "TEACHER_CREATE",
      operationId: teacherId,
      name: "Демо преподаватель межмодульной дисциплины",
      subjectIds: [subjectId],
    };
  const previewResponse = await page.request.post(
    "/api/staff/schedule/builder",
    { headers: { origin }, data: { command, preview: true } },
  );
  expect(previewResponse.status()).toBe(200);
  const preview = await previewResponse.json();
  expect(
    (
      await page.request.post("/api/staff/schedule/builder", {
        headers: { origin },
        data: {
          command,
          preview: false,
          token: preview.token,
          confirmed: true,
        },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await assignmentForm
    .getByRole("combobox", { name: "Дисциплина", exact: true })
    .selectOption(subjectId);
  await assignmentForm
    .getByRole("checkbox", { name: "Демо-группа 1", exact: true })
    .check();
  await assignmentForm
    .getByRole("combobox", { name: "Преподаватель лекции", exact: true })
    .selectOption(teacherId);
  await assignmentForm
    .getByRole("button", { name: "Проверить изменения", exact: true })
    .click();
  await expect(
    assignmentForm.getByRole("region", { name: "Предпросмотр изменений" }),
  ).toBeVisible();
  const saved = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/staff/schedule/builder" &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.preview === false,
  );
  await assignmentForm
    .getByRole("button", { name: "Подтвердить и сохранить", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Изменить назначение", exact: true }),
  ).toBeVisible();
  const catalog = await (
    await page.request.get("/api/staff/schedule/builder")
  ).json();
  expect(
    catalog.subjects
      .filter((s: { id: string; name: string }) => s.name === name)
      .map((s: { id: string }) => s.id),
  ).toEqual([subjectId]);
  expect(
    catalog.assignments
      .find((a: { subjectId: string }) => a.subjectId === subjectId)
      .groups.map((g: { groupId: string }) => g.groupId),
  ).toEqual(["group-1"]);
  await capture(
    "01-subject-assigned",
    page.locator(".assignment-layout .editor-panel"),
  );

  await page.goto("/staff/grades");
  await expect(page.getByLabel("Студент", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("form", { name: "Выставить результат", exact: true }),
  ).toHaveCount(0);
  await capture("02-group-required");
  async function pickGroup(id: string) {
    await page.getByLabel("Группа", { exact: true }).selectOption(id);
    await expect(page.getByLabel("Студент", { exact: true })).toBeEnabled();
    await expect(page.getByLabel("Студент", { exact: true })).toHaveValue("");
  }
  await pickGroup("group-2");
  const otherMembership = await page
    .getByLabel("Студент", { exact: true })
    .locator("option")
    .filter({ hasText: "Студент 2" })
    .getAttribute("value");
  await pickGroup("group-1");
  const students = page.getByLabel("Студент", { exact: true });
  await expect(
    students.locator("option").filter({ hasText: "Студент 2" }),
  ).toHaveCount(0);
  const membershipId = (await students
    .locator("option")
    .filter({ hasText: "Студент 1" })
    .getAttribute("value"))!;
  await capture("03-group-a-roster");
  async function openStudent(id: string) {
    await page.getByLabel("Студент", { exact: true }).selectOption(id);
    await page
      .getByRole("button", { name: "Открыть результаты", exact: true })
      .click();
    await expect(
      page.getByRole("form", { name: "Выставить результат", exact: true }),
    ).toBeVisible();
  }
  await openStudent(membershipId);
  const form = () =>
    page.getByRole("form", { name: "Выставить результат", exact: true });
  await expect(
    form()
      .getByLabel("Дисциплина", { exact: true })
      .locator(`option[value="${subjectId}"]`),
  ).toHaveCount(1);
  await form()
    .getByLabel("Дисциплина", { exact: true })
    .selectOption(subjectId);
  const baselineCommand = {
    action: "CREATE",
    operationId: randomUUID(),
    membershipId,
    groupId: "group-1",
    subjectId,
    issuedOn: "2026-11-18",
    result: { kind: "MARK", mark: 4 },
  };
  expect(
    (
      await page.request.post("/api/staff/grades", {
        headers: { origin },
        data: baselineCommand,
      })
    ).status(),
  ).toBe(200);
  await form().getByLabel("Результат", { exact: true }).selectOption("5");
  await capture("04-same-subject-result", form());
  const write = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/staff/grades" &&
      r.request().method() === "POST",
  );
  await form()
    .getByRole("button", { name: "Выставить результат", exact: true })
    .click();
  const written = await write;
  expect(written.status()).toBe(200);
  expect(written.request().postDataJSON()).toMatchObject({
    membershipId,
    groupId: "group-1",
    subjectId,
  });
  const gradeId: string = written.request().postDataJSON().operationId;
  const rows = () => gradeRows(page, name);
  await expect(rows()).toHaveCount(2);
  await form()
    .getByLabel("Дисциплина", { exact: true })
    .selectOption(subjectId);
  await form()
    .getByLabel("Тип результата", { exact: true })
    .selectOption("CREDIT");
  await page.getByLabel("Группа", { exact: true }).selectOption("group-2");
  await expect(form()).toHaveCount(0);
  await expect(students).toHaveValue("");
  expect(new URL(page.url()).searchParams.has("student")).toBe(false);
  await capture("05-group-change-reset");
  await openStudent(otherMembership!);
  await expect(form().getByLabel("Дисциплина", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    form().getByLabel("Тип результата", { exact: true }),
  ).toHaveValue("MARK");
  const forged = {
    ...baselineCommand,
    operationId: randomUUID(),
    membershipId: otherMembership,
  };
  expect(
    (
      await page.request.post("/api/staff/grades", {
        headers: { origin },
        data: forged,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await (
        await page.request.get("/api/grades?membershipId=" + otherMembership)
      ).json()
    ).rows.some((r: { id: string }) => r.id === forged.operationId),
  ).toBe(false);

  await pickGroup("group-1");
  await openStudent(membershipId);
  await form()
    .getByLabel("Дисциплина", { exact: true })
    .selectOption(subjectId);
  const peer = await browser.newContext({ baseURL: origin }),
    studentContext = await browser.newContext({ baseURL: origin }),
    otherContext = await browser.newContext({ baseURL: origin });
  const staff = await peer.newPage(),
    student = await studentContext.newPage(),
    otherStudent = await otherContext.newPage();
  await signInWithSession(
    staff,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  await signInWithSession(
    student,
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
  await signInWithSession(
    otherStudent,
    "student2@example.test",
    process.env.DEMO_STUDENT2_PASSWORD!,
  );
  let moved = false;
  async function transfer(groupId: string) {
    await staff.goto("/staff");
    const card = await findPagedCard(
      staff,
      staff
        .getByTestId("student-membership")
        .filter({ hasText: "Демо Студент 1" }),
      "Страницы студентов",
      "Следующие студенты",
    );
    await card.getByLabel("Целевая группа").selectOption(groupId);
    await card
      .getByLabel("Причина действия")
      .fill("Демо сквозная проверка успеваемости");
    const response = staff.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/staff/membership" &&
        r.request().method() === "POST",
    );
    await card.getByRole("button", { name: "Применить действие" }).click();
    expect((await response).status()).toBe(200);
    await expect(
      card.getByText(
        `Группа: Демо-группа ${groupId === "group-1" ? "1" : "2"}`,
        { exact: true },
      ),
    ).toBeVisible();
  }
  try {
    const ownBefore = await (await student.request.get("/api/grades")).json();
    expect(
      ownBefore.rows.filter((r: { id: string }) =>
        [gradeId, baselineCommand.operationId].includes(r.id),
      ),
    ).toHaveLength(2);
    await transfer("group-2");
    moved = true;
    const staleWrite = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/staff/grades" &&
        r.request().method() === "POST",
    );
    await form()
      .getByRole("button", { name: "Выставить результат", exact: true })
      .click();
    const refused = await staleWrite;
    expect(refused.status()).toBe(409);
    await expect(form().getByRole("status")).toContainText(
      "Студент не прикреплён к выбранной группе",
    );
    await expect(form().getByLabel("Дисциплина", { exact: true })).toHaveValue(
      subjectId,
    );
    await capture("06-stale-transfer-refused", form());
    const ownAfter = await (await student.request.get("/api/grades")).json();
    expect(ownAfter.rows).toEqual(ownBefore.rows);
    const staleId = refused.request().postDataJSON().operationId;
    expect(ownAfter.rows.some((r: { id: string }) => r.id === staleId)).toBe(
      false,
    );
    const otherRows = await (
      await otherStudent.request.get("/api/grades")
    ).json();
    expect(
      otherRows.rows.some((r: { id: string }) =>
        [gradeId, baselineCommand.operationId, forged.operationId].includes(
          r.id,
        ),
      ),
    ).toBe(false);
    expect(
      (
        await otherStudent.request.get(
          "/api/grades?membershipId=" + membershipId,
        )
      ).status(),
    ).toBe(403);
    await student.setViewportSize({ width: 360, height: 900 });
    await student.goto("/grades");
    await expect(gradeRows(student, name)).toHaveCount(2);
    await student.screenshot({
      path: info.outputPath("07-student-own-history-360.png"),
    });
    await page.goto("/staff/grades?history=1");
    await students.selectOption(membershipId);
    await page
      .getByRole("button", { name: "Открыть результаты", exact: true })
      .click();
    await expect(form()).toHaveCount(0);
    await expect(rows()).toHaveCount(2);
    await capture("08-history-after-transfer", rows().first());
    // Explicit correction remains available after transfer without binding old grades to their former group.
    page.on("dialog", (d) => d.accept());
    const old = rows().filter({ hasText: "Оценка: 4" });
    await old.getByRole("button", { name: "Исправить", exact: true }).click();
    const edit = old.getByRole("form", {
      name: "Исправление результата",
      exact: true,
    });
    await edit.getByLabel("Результат", { exact: true }).selectOption("3");
    await edit
      .getByLabel("Причина исправления", { exact: true })
      .fill("Демо явное исправление истории после перевода");
    const corrected = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/staff/grades" &&
        r.request().method() === "POST",
    );
    await edit
      .getByRole("button", { name: "Сохранить исправление", exact: true })
      .click();
    expect((await corrected).status()).toBe(200);
    await expect(rows().filter({ hasText: "Оценка: 3" })).toHaveCount(1);
    const audit = await (
      await page.request.get("/api/grades?membershipId=" + membershipId)
    ).json();
    expect(
      audit.events.filter(
        (e: { targetId: string; action: string }) =>
          e.targetId === baselineCommand.operationId &&
          e.action === "GRADE_EDIT",
      ),
    ).toHaveLength(1);
    expect(
      (await (await student.request.get("/api/grades")).json()).rows.find(
        (r: { id: string }) => r.id === baselineCommand.operationId,
      ).mark,
    ).toBe(3);
  } finally {
    if (moved) await transfer("group-1");
    await peer.close();
    await studentContext.close();
    await otherContext.close();
  }
});
