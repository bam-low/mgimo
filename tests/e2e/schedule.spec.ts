import { reuseSession } from "./session-cache";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { displayDate } from "../../src/app/schedule-input-values";
import { dayKey, timeLabel, addDays } from "../../src/lib/schedule-time";
import { findPagedCard } from "./paging";
async function visualChecks(page: Page, role: string) {
  await page.evaluate(async () => {
    await Promise.all(
      ["400 16px Onest", "400 24px Literata", "italic 400 24px Literata"].map(
        (font) => document.fonts.load(font, "Ёжик abc123"),
      ),
    );
    await document.fonts.ready;
  });
  expect(
    await page.evaluate(() =>
      document.fonts.check("400 16px Onest", "Ёжик abc123"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      document.fonts.check("italic 400 24px Literata", "Ёжик"),
    ),
  ).toBe(true);
  for (const asset of [
    "/fonts/onest-roman.woff",
    "/fonts/literata-roman.woff",
    "/fonts/literata-italic.woff",
    "/design/campus-garden.svg",
    "/design/study-desk.svg",
  ]) {
    const response = await page.request.get(asset);
    expect(response.status(), asset).toBe(200);
    expect(response.headers()["content-type"], asset).toMatch(/font|woff|svg/);
  }
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      role + width,
    ).toBe(true);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
      document.querySelector(".workspace-scroll")?.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `test-results/issue34-review-${role}-${width}-viewport.png`,
    });
    await page.screenshot({
      path: `test-results/issue34-review-${role}-${width}-full.png`,
      fullPage: true,
    });
    if (width < 1100) {
      const region = page.locator(".workspace-scroll"),
        nav = page.locator(".campus-nav");
      const assertSeparated = async () => {
        const r = await region.boundingBox(),
          n = await nav.boundingBox();
        expect(
          r && n && r.y + r.height <= n.y + 1,
          "content scrollport ends before nav",
        ).toBe(true);
        expect(
          n && n.y + n.height <= page.viewportSize()!.height + 1,
          "nav fits visual viewport",
        ).toBe(true);
        expect(
          await region.evaluate((e) => e.scrollWidth <= e.clientWidth),
          "no local content overflow",
        ).toBe(true);
      };
      await assertSeparated();
      await region.evaluate((e) => e.scrollTo(0, e.scrollHeight));
      await expect
        .poll(() =>
          region.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop),
        )
        .toBeLessThan(2);
      const last = region
        .locator(
          "button, a, textarea, input:not([type=hidden]):not([aria-hidden=true]), dd, p",
        )
        .filter({ visible: true })
        .last();
      const bounds = await last.boundingBox(),
        n = await nav.boundingBox();
      expect(
        bounds && n && bounds.y + bounds.height <= n.y + 1,
        "last content is reachable above nav",
      ).toBe(true);
      await page.screenshot({
        path: `test-results/issue34-review-${role}-${width}-end.png`,
      });
      if (role === "staff") {
        await page
          .locator(".timetable-panel")
          .evaluate((e) => e.scrollIntoView({ block: "start" }));
        await page.screenshot({
          path: `test-results/issue34-review-staff-${width}-calendar.png`,
        });
        await page
          .locator(".lesson-inspector")
          .evaluate((e) => e.scrollIntoView({ block: "start" }));
        await page.screenshot({
          path: `test-results/issue34-review-staff-${width}-inspector.png`,
        });
        const title = page.getByLabel("Дисциплина", { exact: true });
        await title.focus();
        await page.setViewportSize({ width, height: 420 });
        await expect
          .poll(async () => {
            const f = await title.boundingBox(),
              r = await region.boundingBox();
            return !!(
              f &&
              r &&
              f.y >= r.y - 1 &&
              f.y + f.height <= r.y + r.height + 1
            );
          })
          .toBe(true);
        await assertSeparated();
        await page.screenshot({
          path: `test-results/issue34-review-staff-${width}-reduced-viewport.png`,
        });
        await page.setViewportSize({ width, height: 900 });
        await title.blur();
      }
      await region.evaluate((e) => e.scrollTo(0, 0));
    }
  }
  const contrasts = await page
    .locator(
      ".eyebrow, .badge, .lesson h3, .lesson-time, .day-status h2, .current-times, .timetable-lesson, .campus-nav a",
    )
    .evaluateAll((elements) => {
      const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).map(Number);
      const light = (channels: number[]) =>
        channels
          .slice(0, 3)
          .map((n) => {
            const v = n / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      return elements
        .filter((e) => e.getClientRects().length)
        .map((e) => {
          let ancestor: Element | null = e,
            background: number[] = [];
          while (ancestor) {
            background = rgb(getComputedStyle(ancestor).backgroundColor);
            if (background.length === 3 || background[3] === 1) break;
            ancestor = ancestor.parentElement;
          }
          const foreground = light(rgb(getComputedStyle(e).color)),
            back = light(background);
          return {
            text: e.textContent?.slice(0, 40),
            ratio:
              (Math.max(foreground, back) + 0.05) /
              (Math.min(foreground, back) + 0.05),
          };
        });
    });
  for (const pair of contrasts)
    expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Tab");
  await page.locator(".campus-nav a").first().focus();
  expect(
    await page
      .locator(".campus-nav a")
      .first()
      .evaluate((e) => getComputedStyle(e).outlineStyle),
  ).toBe("solid");
  const textScale = await page.addStyleTag({
    content: "html { font-size: 200% !important; }",
  });
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `200% text reflow at ${width}`,
    ).toBe(true);
    if (role === "staff") {
      const clipped = await page
        .locator(".lesson-inspector .localized-control > input[type=text]")
        .evaluateAll(
          (fields) =>
            fields.filter((field) => {
              const input = field as HTMLInputElement,
                style = getComputedStyle(input),
                canvas = document.createElement("canvas"),
                ctx = canvas.getContext("2d")!;
              ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
              return (
                ctx.measureText(input.value).width >
                input.clientWidth -
                  parseFloat(style.paddingLeft) -
                  parseFloat(style.paddingRight) +
                  1
              );
            }).length,
        );
      expect(clipped, "localized date/time remain readable at text200%").toBe(
        0,
      );
    }
  }
  await textScale.evaluate((e) => e.parentNode?.removeChild(e));
  await page.emulateMedia({ reducedMotion: "no-preference" });
}
test.use({ timezoneId: "America/Los_Angeles", locale: "ru-RU" });
test("STAFF structure and schedule → real student today/week → edit/cancel/delete, preserving other groups", async ({
  page: initialPage,
  browser,
  baseURL,
  httpCredentials,
  ignoreHTTPSErrors,
}) => {
  // Real polling can take 30s; allow the six viewport captures and CRUD as well.
  test.setTimeout(120000);
  let page = initialPage;
  const extraContexts: BrowserContext[] = [];
  try {
    const token = Date.now().toString(36),
      faculty = "Демо факультет " + token,
      program = "Демо программа " + token,
      group =
        "Демо группа междисциплинарного учебного практикума и проектных исследований " +
        token,
      title =
        "Демо междисциплинарный семинар по анализу учебных исследований и обсуждению самостоятельных проектов " +
        token;
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
    const acceptDialog = (dialog: import("@playwright/test").Dialog) =>
      dialog.accept();
    page.on("dialog", acceptDialog);
    await page.setViewportSize({ width: 1280, height: 900 });
    async function login(email: string, password: string) {
      if (await reuseSession(page, email)) return;
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
    await expect(page.getByTestId("group-context")).toContainText(group);
    const lesson = page.getByRole("form", { name: "Занятие", exact: true });
    await lesson.getByLabel("Дисциплина", { exact: true }).fill(title);
    await lesson
      .getByLabel("Дата занятия", { exact: true })
      .fill(displayDate(today));
    await lesson.getByLabel("Дата занятия", { exact: true }).fill("31.02.2026");
    // Observe the product contract: invalid text cannot submit any mutation.
    let invalidWrites = 0;
    const observeInvalid = (request: import("@playwright/test").Request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/staff/schedule"
      )
        invalidWrites++;
    };
    page.on("request", observeInvalid);
    await lesson
      .getByRole("button", { name: "Создать занятие", exact: true })
      .click();
    await expect
      .poll(() =>
        lesson
          .getByLabel("Дата занятия", { exact: true })
          .evaluate((e) => (e as HTMLInputElement).validationMessage),
      )
      .not.toBe("");
    expect(invalidWrites).toBe(0);
    page.off("request", observeInvalid);
    await lesson
      .getByLabel("Дата занятия", { exact: true })
      .fill(displayDate(addDays(today, 1)));
    await lesson.locator("input[type=date]").fill(today);
    await expect(
      lesson.getByLabel("Дата занятия", { exact: true }),
    ).toHaveValue(displayDate(today));
    await lesson.getByLabel("Начало", { exact: true }).fill("12:34");
    await lesson.locator("input[type=time]").first().fill(hm(start));
    await expect(lesson.getByLabel("Начало", { exact: true })).toHaveValue(
      hm(start),
    );
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
      page.getByRole("button", {
        name: `Открыть занятие: ${title}, ${today} ${hm(start)}`,
        exact: true,
      }),
    ).toBeVisible();
    await lesson
      .getByLabel("Дисциплина", { exact: true })
      .fill("Демо конфликт с сохранением ввода");
    await lesson
      .getByLabel("Дата занятия", { exact: true })
      .fill(displayDate(today));
    await lesson.getByLabel("Начало", { exact: true }).fill(hm(start));
    await lesson.getByLabel("Конец", { exact: true }).fill(hm(end));
    await lesson
      .getByRole("button", { name: "Создать занятие", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Конфликт времени" }),
    ).toBeVisible();
    await expect(lesson.getByLabel("Дисциплина", { exact: true })).toHaveValue(
      "Демо конфликт с сохранением ввода",
    );
    await page
      .getByRole("button", {
        name: `Открыть занятие: ${title}, ${today} ${hm(start)}`,
        exact: true,
      })
      .click();
    await expect(lesson.getByLabel("Дисциплина", { exact: true })).toHaveValue(
      title,
    );
    await lesson
      .getByLabel("Дисциплина", { exact: true })
      .fill(title + " — несохранённая правка");
    await page
      .getByRole("button", { name: "Закрыть без сохранения", exact: true })
      .click();
    const keyboardTile = page.getByRole("button", {
      name: `Открыть занятие: ${title}, ${today} ${hm(start)}`,
      exact: true,
    });
    await keyboardTile.focus();
    await page.keyboard.press("Enter");
    await expect(lesson.getByLabel("Дисциплина", { exact: true })).toHaveValue(
      title,
    );
    await visualChecks(page, "staff");
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
    await visualChecks(page, "student");
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
    const tile = (label: string) =>
      page.getByRole("button", {
        name: `Открыть занятие: ${label}, ${today} ${hm(start)}`,
        exact: true,
      });
    await tile(title).click();
    await lesson
      .getByLabel("Дисциплина", { exact: true })
      .fill(title + " обновлён");
    await lesson
      .getByRole("button", { name: "Сохранить занятие", exact: true })
      .click();
    await expect(tile(title + " обновлён")).toBeVisible();
    await tile(title + " обновлён").click();
    page.removeListener("dialog", acceptDialog);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Отменить занятие", exact: true })
      .click();
    await expect(page.locator(".inspector-status")).toContainText(
      "Занятие запланировано",
    );
    page.on("dialog", acceptDialog);
    await page
      .getByRole("button", { name: "Отменить занятие", exact: true })
      .click();
    await expect(tile(title + " обновлён")).toContainText("Отменено");
    page = studentPage;
    await page.bringToFront();
    await expect(
      page.locator(".lesson").filter({ hasText: title + " обновлён" }),
    ).toContainText("Отменено", { timeout: 35000 });
    expect(await page.evaluate(() => "campusScheduleDocument" in window)).toBe(
      true,
    );
    page = staffPage;
    await tile(title + " обновлён").click();
    await page
      .getByRole("button", { name: "Восстановить", exact: true })
      .click();
    await expect(tile(title + " обновлён")).not.toContainText("Отменено");
    const restored = await studentPage.request.get(
      "/api/schedule?view=week&day=" + today,
    );
    expect(restored.status()).toBe(200);
    expect(
      (await restored.json()).lessons.find(
        (l: { title: string }) => l.title === title + " обновлён",
      )?.status,
    ).toBe("SCHEDULED");
    page = studentPage;
    await page.route("**/api/schedule?*", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.goto("/today");
    await expect(page.locator(".error-notice[role=alert]")).toContainText(
      "Не удалось обновить расписание",
    );
    await page.unroute("**/api/schedule?*");
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await expect(
      page.locator(".lesson").filter({ hasText: title }),
    ).toBeVisible();
    let releaseRead!: () => void;
    const heldRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await page.route("**/api/schedule?*", async (route) => {
      await heldRead;
      await route.continue();
    });
    await page.goto("/today");
    try {
      await expect(
        page.locator(".schedule-loading[role=status]"),
      ).toBeVisible();
    } finally {
      releaseRead();
    }
    await expect(
      page.locator(".lesson").filter({ hasText: title }),
    ).toBeVisible();
    await page.unroute("**/api/schedule?*");
    page = staffPage;
    await page.goto(`/staff/schedule?groupId=${id}&day=${today}`);
    await tile(title + " обновлён").click();
    page.removeListener("dialog", acceptDialog);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Удалить занятие", exact: true })
      .click();
    await expect(tile(title + " обновлён")).toBeVisible();
    page.on("dialog", acceptDialog);
    await page
      .getByRole("button", { name: "Удалить занятие", exact: true })
      .click();
    await expect(tile(title + " обновлён")).toHaveCount(0);
    await transfer("group-1");
    await logout();
  } finally {
    for (const context of extraContexts) await context.close();
  }
});
