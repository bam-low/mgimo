import { test, expect, type BrowserContext } from "@playwright/test";
import { dayKey, timeLabel } from "../../src/lib/schedule-time";
import { findPagedCard } from "./paging";
test.use({ timezoneId: "America/Los_Angeles", locale: "ru-RU" });
test("STAFF structure and schedule → real student today/week → edit/cancel/delete, preserving other groups", async ({
  page: initialPage,
  browser,
  baseURL,
  httpCredentials,
  ignoreHTTPSErrors,
}) => {
  let page = initialPage;
  const extraContexts: BrowserContext[] = [];
  try {
    const token = Date.now().toString(36),
      faculty = "Демо факультет " + token,
      program = "Демо программа " + token,
      group = "Демо группа " + token,
      title = "Демо проектный семинар " + token;
    const zone = "Europe/Moscow",
      today = dayKey(new Date(), zone),
      minutes =
        +timeLabel(new Date(), zone).slice(0, 2) * 60 +
        +timeLabel(new Date(), zone).slice(3),
      start = Math.max(0, minutes - 5),
      end = Math.min(1439, minutes + 30);
    const hm = (n: number) =>
      `${Math.floor(n / 60)
        .toString()
        .padStart(2, "0")}:${(n % 60).toString().padStart(2, "0")}`;
    page.on("dialog", (d) => d.accept());
    await page.setViewportSize({ width: 1280, height: 900 });
    async function login(email: string, password: string) {
      await page.goto("/login");
      await page
        .getByLabel("Демонстрационный логин", { exact: true })
        .fill(email);
      await page
        .getByLabel("Демонстрационный пароль", { exact: true })
        .evaluate((e, v) => {
          (e as HTMLInputElement).value = v;
          e.dispatchEvent(new Event("input", { bubbles: true }));
        }, password);
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await expect(page).toHaveURL(/\/(cabinet|staff)$/);
    }
    async function logout() {
      await page.getByRole("button", { name: "Выйти", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("heading", { name: "Вход в Кампус" }),
      ).toBeVisible();
    }
    async function staff() {
      await login("staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
    }
    async function transfer(id: string) {
      await page.goto("/staff");
      const card = page.getByTestId("student-membership").filter({
        has: page.getByRole("heading", { name: "Демо Студент 1", exact: true }),
      });
      await findPagedCard(
        page,
        card,
        "Страницы студентов",
        "Следующие студенты",
      );
      await card.getByLabel("Целевая группа").selectOption(id);
      await card.getByLabel("Причина действия").fill("Демо учебный сценарий");
      await card.getByRole("button", { name: "Применить действие" }).click();
      await expect(card.getByLabel("Причина действия")).toHaveValue("");
    }
    await staff();
    await page.goto("/staff/structure");
    const f = page.getByRole("form", { name: "Добавить факультет" });
    await f.getByLabel("Вымышленное название").fill(faculty);
    await f.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: faculty, exact: true }),
    ).toBeVisible();
    const p = page.getByRole("form", { name: "Добавить направление" });
    await p
      .getByLabel("Факультет", { exact: true })
      .selectOption({ label: faculty });
    await p.getByLabel("Вымышленное название").fill(program);
    await p.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: program, exact: true }),
    ).toBeVisible();
    const g = page.getByRole("form", { name: "Добавить группу" });
    await g
      .getByLabel("Направление", { exact: true })
      .selectOption({ label: `${faculty} / ${program}` });
    await g.getByLabel("Вымышленное название").fill(group);
    await g.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: group, exact: true }),
    ).toBeVisible();
    await page.goto("/staff/schedule");
    const id = await page
      .getByLabel("Учебная группа", { exact: true })
      .locator("option")
      .filter({ hasText: group })
      .getAttribute("value");
    expect(id).toBeTruthy();
    await page.getByLabel("Учебная группа", { exact: true }).selectOption(id!);
    await page.getByRole("button", { name: "Показать", exact: true }).click();
    const lesson = page.getByRole("form", { name: "Занятие", exact: true });
    await lesson.getByLabel("Дисциплина", { exact: true }).fill(title);
    await lesson.getByLabel("Дата занятия").fill(today);
    await lesson.getByLabel("Начало", { exact: true }).fill(hm(start));
    await lesson.getByLabel("Конец", { exact: true }).fill(hm(end));
    await lesson
      .getByLabel("Вымышленный преподаватель (необязательно)")
      .fill("Демо лектор");
    await lesson.getByLabel("Аудитория (необязательно)").fill("Демо 301");
    await lesson
      .getByRole("button", { name: "Создать занятие", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/schedule-staff-desktop.png",
      fullPage: true,
    });
    await transfer(id!);
    const staffPage = page;
    const contextOptions = {
      baseURL:
        baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      httpCredentials,
      ignoreHTTPSErrors,
      timezoneId: "America/Los_Angeles",
      locale: "ru-RU",
    };
    const studentContext = await browser.newContext(contextOptions);
    extraContexts.push(studentContext);
    const studentPage = await studentContext.newPage();
    page = studentPage;
    await login("student1@example.test", process.env.DEMO_STUDENT1_PASSWORD!);
    await page.goto("/today");
    await expect(
      page.locator(".lesson").filter({ hasText: title }),
    ).toBeVisible();
    await expect(
      page.locator(".lesson").filter({ hasText: title }),
    ).toContainText(hm(start));
    if (minutes < 1430) {
      const progress = page.getByRole("progressbar");
      await expect(progress).toBeVisible();
      const initial = Number(await progress.getAttribute("value"));
      await expect
        .poll(async () => Number(await progress.getAttribute("value")), {
          timeout: 5000,
        })
        .toBeGreaterThan(initial);
    }
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/schedule-student-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto("/schedule");
    await page.getByRole("button", { name: "Неделя", exact: true }).click();
    await expect(page.locator(".schedule-day")).toHaveCount(7);
    await expect(
      page.locator(".lesson").filter({ hasText: title }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        fetch("/api/schedule?groupId=group-2").then((r) => r.status),
      ),
    ).toBe(403);
    await page.evaluate(() =>
      Object.assign(window, { campusScheduleDocument: true }),
    );
    const secondContext = await browser.newContext(contextOptions);
    extraContexts.push(secondContext);
    page = await secondContext.newPage();
    await login("student2@example.test", process.env.DEMO_STUDENT2_PASSWORD!);
    await page.goto("/schedule");
    await expect(page.locator(".schedule-day")).toHaveCount(1);
    await expect(
      page.locator(".lesson").filter({ hasText: title }),
    ).toHaveCount(0);
    await logout();
    page = staffPage;
    await page.goto(`/staff/schedule?groupId=${id}&day=${today}`);
    let card = page.locator(".staff-lessons>li").filter({ hasText: title });
    await card
      .getByRole("button", { name: "Редактировать", exact: true })
      .click();
    await lesson
      .getByLabel("Дисциплина", { exact: true })
      .fill(title + " обновлён");
    await lesson
      .getByRole("button", { name: "Сохранить занятие", exact: true })
      .click();
    card = page
      .locator(".staff-lessons>li")
      .filter({ hasText: title + " обновлён" });
    await expect(card).toBeVisible();
    await card
      .getByRole("button", { name: "Отменить занятие", exact: true })
      .click();
    await expect(card).toContainText("Отменено");
    page = studentPage;
    await page.bringToFront();
    await expect(
      page.locator(".lesson").filter({ hasText: title + " обновлён" }),
    ).toContainText("Отменено", { timeout: 35000 });
    expect(await page.evaluate(() => "campusScheduleDocument" in window)).toBe(
      true,
    );
    page = staffPage;
    await page.goto(`/staff/schedule?groupId=${id}&day=${today}`);
    await page
      .locator(".staff-lessons>li")
      .filter({ hasText: title })
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title + " обновлён", exact: true }),
    ).toHaveCount(0);
    await transfer("group-1");
    await logout();
  } finally {
    for (const context of extraContexts) await context.close();
  }
});
