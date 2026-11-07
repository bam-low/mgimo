import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Демонстрационный логин", { exact: true }).fill(email);
  await page
    .getByLabel("Демонстрационный пароль", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/(cabinet|staff)$/);
}
test("STAFF selects student and subject, records marks and credit; personal student history and audited corrections", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  page.on("dialog", (d) => d.accept());
  await login(page, "staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
  await page.goto("/staff/grades");
  await page.getByText("Справочник дисциплин", { exact: true }).click();
  const title = "Демо дисциплина " + randomUUID();
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
  await form()
    .getByRole("button", { name: "Выставить результат", exact: true })
    .click();
  const rows = () =>
    page
      .getByTestId("grade-row")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(rows()).toHaveCount(1);
  await form()
    .getByLabel("Дисциплина", { exact: true })
    .selectOption({ label: title });
  await form().getByLabel("Тип результата").selectOption("CREDIT");
  await form().getByLabel("Результат", { exact: true }).selectOption("PASSED");
  await form()
    .getByRole("button", { name: "Выставить результат", exact: true })
    .click();
  await expect(rows()).toHaveCount(2);
  const studentContext = await browser.newContext();
  const sp = await studentContext.newPage();
  try {
    await login(
      sp,
      "student1@example.test",
      process.env.DEMO_STUDENT1_PASSWORD!,
    );
    await sp.goto("/grades");
    const own = () =>
      sp
        .getByTestId("grade-row")
        .filter({ has: sp.getByRole("heading", { name: title, exact: true }) });
    await expect(own()).toHaveCount(2);
    await expect(own().filter({ hasText: "Зачтено" })).toHaveCount(1);
    await expect(
      sp.getByRole("button", { name: "Исправить", exact: true }),
    ).toHaveCount(0);
    const other = await browser.newContext();
    const op = await other.newPage();
    try {
      await login(
        op,
        "student2@example.test",
        process.env.DEMO_STUDENT2_PASSWORD!,
      );
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
    for (const width of [360, 390, 1280]) {
      for (const [p, role] of [
        [page, "staff"],
        [sp, "student"],
      ] as const) {
        await p.setViewportSize({ width, height: 900 });
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
        await p.keyboard.press("Tab");
      }
    }
    await page
      .getByText("Аудит изменений результатов", { exact: true })
      .click();
    await expect(page.getByText(/Причина: Демо проверка работы/)).toBeVisible();
  } finally {
    await studentContext.close();
  }
});
