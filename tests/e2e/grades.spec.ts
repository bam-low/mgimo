import { gradeRows } from "./grade-rows";
import { signInWithSession } from "./ui-sign-in";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("STAFF selects student and subject, records marks and credit; personal student history and audited corrections", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  page.on("dialog", (d) => d.accept());
  await signInWithSession(
    page,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  await page.goto("/staff/grades");
  if (process.env.CAMPUS_VPS_UPGRADE_REHEARSAL !== "1") {
    await expect(page.getByLabel("Студент", { exact: true })).toBeDisabled();
    await page.getByLabel("Группа", { exact: true }).selectOption("group-1");
    await expect(page.getByLabel("Студент", { exact: true })).toBeEnabled();
  }
  await page.getByText("Справочник дисциплин", { exact: true }).click();
  const title =
    "Демо исследовательский практикум по академическому письму " +
    randomUUID().slice(0, 8);
  const subject = page.getByRole("form", {
    name: "Новая дисциплина",
    exact: true,
  });
  await subject.getByLabel("Название дисциплины").fill(title);
  await subject
    .getByRole("button", { name: "Создать дисциплину", exact: true })
    .click();
  await expect(
    page.getByRole("form", { name: "Дисциплина " + title, exact: true }),
  ).toBeVisible();
  const studentOption = page
    .getByLabel("Студент", { exact: true })
    .locator("option")
    .filter({ hasText: "Студент 1" });
  // The fixture roster is paginated; follow the real links if other tests created students.
  await expect(page.getByLabel("Студент", { exact: true })).toBeVisible();
  for (let n = 0; (await studentOption.count()) === 0 && n < 10; n++) {
    const href = await page
      .getByRole("link", { name: "Следующие студенты", exact: true })
      .getAttribute("href");
    await page.goto(href!);
  }
  await expect(studentOption).toHaveCount(1);
  await page
    .getByLabel("Студент", { exact: true })
    .selectOption((await studentOption.getAttribute("value"))!);
  await page
    .getByRole("button", { name: "Открыть результаты", exact: true })
    .click();
  const membershipId = new URL(page.url()).searchParams.get("student")!;
  const form = () =>
    page.getByRole("form", { name: "Выставить результат", exact: true });
  await form()
    .getByLabel("Дисциплина", { exact: true })
    .selectOption({ label: title });
  await form().getByLabel("Результат", { exact: true }).selectOption("5");
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/staff/grades" &&
        response.request().method() === "POST",
    ),
    form()
      .getByRole("button", { name: "Выставить результат", exact: true })
      .click(),
  ]);
  expect(created.status(), "HTTP-ответ создания оценки").toBe(200);
  const rows = () => gradeRows(page, title);
  await expect(rows()).toHaveCount(1);
  const savedResponse = await page.request.get(
    "/api/grades?membershipId=" + membershipId,
  );
  expect(savedResponse.status()).toBe(200);
  const savedMarks = (await savedResponse.json()).rows.filter(
    (r: { subject: { name: string }; kind: string }) =>
      r.subject.name === title && r.kind === "MARK",
  );
  expect(savedMarks).toHaveLength(1);
  const gradeId: string = savedMarks[0].id;
  await form()
    .getByLabel("Дисциплина", { exact: true })
    .selectOption({ label: title });
  await form().getByLabel("Тип результата").selectOption("CREDIT");
  await form().getByLabel("Результат", { exact: true }).selectOption("PASSED");
  const [credited] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/staff/grades" &&
        response.request().method() === "POST",
    ),
    form()
      .getByRole("button", { name: "Выставить результат", exact: true })
      .click(),
  ]);
  expect(credited.status(), "HTTP-ответ создания зачёта").toBe(200);
  await expect(rows()).toHaveCount(2);
  const studentContext = await browser.newContext();
  const sp = await studentContext.newPage();
  try {
    await signInWithSession(
      sp,
      "student1@example.test",
      process.env.DEMO_STUDENT1_PASSWORD!,
    );
    await sp.goto("/today");
    const overview = sp.getByRole("region", {
      name: "Последние результаты",
      exact: true,
    });
    if (process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1") {
      await expect(overview).toContainText(title);
    } else {
      // Functions retains genuine history from standalone, including later dates.
      const response = await sp.request.get("/api/grades");
      expect(response.status()).toBe(200);
      const latest = (await response.json()).rows.slice(0, 3);
      await expect(overview.locator(".overview-caption")).toHaveText(
        latest[0].subject.name,
      );
      await expect(overview.locator(".overview-more span")).toHaveText(
        latest
          .slice(1)
          .map((r: { subject: { name: string } }) => r.subject.name),
      );
    }
    await expect(
      sp.getByRole("link", { name: "Все результаты", exact: true }),
    ).toHaveAttribute("href", "/grades");
    await sp.goto("/grades");
    const own = () => gradeRows(sp, title);
    await expect(own()).toHaveCount(2);
    await expect(own().filter({ hasText: "Зачтено" })).toHaveCount(1);
    await expect(
      sp.getByRole("button", { name: "Исправить", exact: true }),
    ).toHaveCount(0);
    const other = await browser.newContext();
    const op = await other.newPage();
    try {
      await signInWithSession(
        op,
        "student2@example.test",
        process.env.DEMO_STUDENT2_PASSWORD!,
      );
      await op.goto("/today");
      await expect(op.locator(".home-overview")).toBeVisible();
      await expect(op.locator(".home-overview")).not.toContainText(title);
      await op.goto("/grades");
      await expect(op.getByText(title, { exact: true })).toHaveCount(0);
      expect(
        (
          await op.request.get("/api/grades?membershipId=" + membershipId)
        ).status(),
      ).toBe(403);
    } finally {
      await other.close();
    }
    const mark = rows().filter({ hasText: "Оценка: 5" });
    await mark.getByRole("button", { name: "Исправить", exact: true }).click();
    const edit = mark.getByRole("form", {
      name: "Исправление результата",
      exact: true,
    });
    await edit.getByLabel("Результат", { exact: true }).selectOption("4");
    await edit.getByLabel("Причина исправления").fill("Демо проверка работы");
    page.removeAllListeners("dialog");
    page.once("dialog", (d) => d.dismiss());
    await edit
      .getByRole("button", { name: "Сохранить исправление", exact: true })
      .click();
    await expect(rows().filter({ hasText: "Оценка: 5" })).toHaveCount(1);
    page.on("dialog", (d) => d.accept());
    await edit
      .getByRole("button", { name: "Сохранить исправление", exact: true })
      .click();
    await expect(rows().filter({ hasText: "Оценка: 4" })).toHaveCount(1);
    await sp.reload();
    await expect(own().filter({ hasText: "Оценка: 4" })).toHaveCount(1);
    const voidForm = rows()
      .filter({ hasText: "Оценка: 4" })
      .getByRole("form", { name: "Аннулирование результата", exact: true });
    await voidForm
      .getByLabel("Причина аннулирования")
      .fill("Демо ошибочная запись");
    await voidForm
      .getByRole("button", { name: "Аннулировать", exact: true })
      .click();
    await expect(rows().filter({ hasText: "Аннулировано" })).toHaveCount(1);
    await sp.reload();
    await expect(own()).toHaveCount(1);
    await expect(own()).toContainText("Зачтено");
    // Real rendered states, no screenshot-only styles or fabricated grade values.
    for (const width of [360, 390, 768, 1280]) {
      for (const [p, role] of [
        [page, "staff"],
        [sp, "student"],
      ] as const) {
        await p.setViewportSize({ width, height: 900 });
        await expect(
          p.getByRole("button", { name: "Выйти", exact: true }),
        ).toHaveCount(1);
        const header = await p
          .locator(".campus-masthead")
          .evaluate((element) => {
            const brand = element
              .querySelector(".wordmark")!
              .getBoundingClientRect();
            const exit = element
              .querySelector("button")!
              .getBoundingClientRect();
            return {
              aligned: Math.abs(
                brand.y + brand.height / 2 - exit.y - exit.height / 2,
              ),
              right: exit.right,
              height: exit.height,
            };
          });
        expect(header.aligned).toBeLessThan(2);
        expect(header.right).toBeLessThanOrEqual(width);
        expect(header.height).toBeGreaterThanOrEqual(44);
        await p.emulateMedia({ reducedMotion: "reduce" });
        await p.evaluate(() => document.fonts.ready);
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await p.screenshot({
          path: `test-results/issue39-${role}-${width}.png`,
          fullPage: true,
        });
        await gradeRows(p, title).first().scrollIntoViewIfNeeded();
        await p.screenshot({
          path: `test-results/issue39-${role}-${width}-results.png`,
          fullPage: true,
        });
        await p.keyboard.press("Tab");
      }
    }
    await page
      .getByText("Аудит изменений результатов", { exact: true })
      .click();
    // Standalone and Functions run on the same DB. Reasons are deliberately
    // reusable; audit identity is the grade, not the text of a previous run.
    const auditResponse = await page.request.get(
      "/api/grades?membershipId=" + membershipId,
    );
    expect(auditResponse.status()).toBe(200);
    const events = (await auditResponse.json()).events.filter(
      (e: { targetId: string }) => e.targetId === gradeId,
    );
    expect(events).toHaveLength(3);
    expect(new Set(events.map((e: { id: string }) => e.id)).size).toBe(3);
    expect(events.map((e: { action: string }) => e.action).sort()).toEqual([
      "GRADE_CREATE",
      "GRADE_EDIT",
      "GRADE_VOID",
    ]);
    const edited = JSON.parse(
      events.find((e: { action: string }) => e.action === "GRADE_EDIT").reason,
    );
    expect(edited).toMatchObject({
      membershipId,
      reason: "Демо проверка работы",
      before: { mark: 5, version: 1 },
      after: { mark: 4, version: 2 },
    });
    const audit = page
      .getByTestId("grade-audit-event")
      .and(page.locator(`[data-grade-id="${gradeId}"]`));
    await expect(audit).toHaveCount(3);
    const editEvent = audit.and(
      page.locator('[data-audit-action="GRADE_EDIT"]'),
    );
    await expect(editEvent).toHaveCount(1);
    await expect(editEvent).toBeVisible();
    await expect(editEvent).toContainText("Причина: Демо проверка работы");
  } finally {
    await studentContext.close();
  }
});
