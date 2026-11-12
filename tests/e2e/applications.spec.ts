import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { rememberSession, reuseSession } from "./session-cache";
test.use({ actionTimeout: 15000 });
async function login(page: Page, email: string, password: string) {
  await page.bringToFront();
  if (await reuseSession(page, email)) return;
  await page.goto("/login");
  await page.getByLabel("Демонстрационный логин", { exact: true }).fill(email);
  await page
    .getByLabel("Демонстрационный пароль", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/(staff|cabinet)$/);
  await rememberSession(page, email);
}
async function loseCommittedResponse(page: Page, pathname: string) {
  const completion = Promise.withResolvers<void>();
  const session = await page.context().newCDPSession(page);
  // Pause the response, not the upload: Chromium must deliver the original
  // multipart file bytes to the real server without interception/re-encoding.
  session.on("Fetch.requestPaused", async (event) => {
    try {
      expect(event.responseStatusCode).toBe(200);
      await session.send("Fetch.failRequest", {
        requestId: event.requestId,
        errorReason: "Failed",
      });
      await session.send("Fetch.disable");
      await session.detach();
      completion.resolve();
    } catch (error) {
      await session.detach().catch(() => {});
      completion.reject(error);
    }
  });
  await session.send("Fetch.enable", {
    patterns: [
      {
        urlPattern: new URL(pathname, page.url()).href,
        requestStage: "Response",
      },
    ],
  });
  return { committed: completion.promise };
}

test("applications: genuine certificate bytes, completion, immutable replacement and mobile workflows", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  page.on("dialog", (d) => d.accept());
  await login(
    page,
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
  await page.getByRole("link", { name: "Заявки", exact: true }).click();
  const studentFilters = page.getByRole("form", {
    name: "Фильтры заявок",
    exact: true,
  });
  await studentFilters
    .getByLabel("Тип заявки", { exact: true })
    .selectOption("GENERAL_REQUEST");
  await studentFilters
    .getByLabel("Статус", { exact: true })
    .selectOption("REJECTED");
  await studentFilters
    .getByRole("button", { name: "Применить фильтры", exact: true })
    .click();
  await expect(
    page.getByText(
      "По выбранным фильтрам заявок нет. Попробуйте изменить условия.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Сбросить фильтры", exact: true })
    .click();
  const compose = page.getByRole("form", { name: "Новая заявка", exact: true });
  const title = "Демо обращение " + randomUUID().slice(0, 8);
  await compose
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  expect(
    await compose
      .getByLabel("Тема", { exact: true })
      .evaluate((input: HTMLInputElement) => input.validationMessage),
  ).toBe("Заполните это поле.");
  await compose.getByLabel("Тема", { exact: true }).fill(title);
  expect(
    await compose
      .getByLabel("Тема", { exact: true })
      .evaluate((input: HTMLInputElement) => input.validationMessage),
  ).toBe("");
  await compose
    .getByLabel("Содержание обращения")
    .fill("Вымышленный вопрос об учебном практикуме.");
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await compose
      .getByRole("button", { name: "Отправить заявку", exact: true })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/issue43-student-compose-${width}.png`,
      fullPage: true,
    });
  }
  await compose
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/[a-f0-9-]+$/);
  const generalId = page.url().split("/").at(-1)!;
  await page.goto("/applications");
  await compose.getByLabel("Тип обращения").selectOption("STUDY_CERTIFICATE");
  const purpose = "Вымышленный клуб " + randomUUID().slice(0, 8);
  await compose
    .getByLabel("Вымышленная цель / место предъявления")
    .fill(purpose);
  await compose
    .getByRole("button", { name: "Отправить заявку", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/[a-f0-9-]+$/);
  const id = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("link", { name: "Скачать справку", exact: true }),
  ).toHaveCount(0);
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  staff.on("dialog", (d) => d.accept());
  {
    await login(staff, "staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
    await staff.goto("/staff/applications");
    const filters = staff.getByRole("form", {
      name: "Фильтры заявок",
      exact: true,
    });
    await filters
      .getByLabel("Тип заявки", { exact: true })
      .selectOption("STUDY_CERTIFICATE");
    await filters
      .getByLabel("Статус", { exact: true })
      .selectOption("SUBMITTED");
    await filters
      .getByRole("button", { name: "Применить фильтры", exact: true })
      .click();
    await expect(staff).toHaveURL(/kind=STUDY_CERTIFICATE/);
    await staff.goto(`/staff/applications/${id}`);
    await expect(staff.getByText(purpose, { exact: true })).toBeVisible();
    const actions = staff.getByRole("form", {
      name: "Обработка заявки",
      exact: true,
    });
    // Lose the response only after the genuine server transaction committed.
    // Recovery must consult real history and allow a subsequent, new action.
    const taken = await loseCommittedResponse(
      staff,
      `/api/staff/applications/${id}/actions`,
    );
    await actions
      .getByRole("button", { name: "Применить действие", exact: true })
      .click();
    await taken.committed;
    await expect(actions).toContainText("Нет соединения.");
    await actions
      .getByRole("button", {
        name: "Обновить карточку, сохранив ответ",
        exact: true,
      })
      .click();
    await expect(actions).toContainText("Действие подтверждено по истории.");
    await expect(actions.getByLabel("Действие", { exact: true })).toHaveValue(
      "COMMENT",
    );
    await actions
      .getByLabel("Действие", { exact: true })
      .selectOption("COMPLETE");
    await actions
      .getByLabel("Ответ / комментарий")
      .fill("Вымышленная справка подготовлена для демонстрации.");
    await expect(
      actions.getByRole("button", { name: "Применить действие", exact: true }),
    ).toBeDisabled();
    const upload = staff.getByRole("form", {
      name: "Документ справки",
      exact: true,
    });
    const fixture = await readFile("demo/documents/demo-certificate.pdf");
    expect(fixture.length).toBeGreaterThan(16384);
    await upload
      .getByLabel("Демонстрационный файл", { exact: true })
      .setInputFiles({
        name: "demo.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(3145729),
      });
    await upload.getByRole("checkbox").check();
    await upload
      .getByRole("button", { name: "Загрузить документ", exact: true })
      .click();
    await expect(upload).toContainText(
      "Выберите файл PDF/JPG/PNG размером до 3 МиБ.",
    );
    expect(
      await upload
        .getByLabel("Демонстрационный файл", { exact: true })
        .evaluate((input: HTMLInputElement) => input.files?.[0].size),
    ).toBe(3145729);
    const filePicker = staff.waitForEvent("filechooser");
    await upload
      .getByRole("button", { name: "Выбрать файл", exact: true })
      .click();
    await (await filePicker).setFiles("demo/documents/demo-certificate.pdf");
    await expect(upload.getByRole("checkbox")).not.toBeChecked();
    await upload.getByRole("checkbox").check();
    const uploaded = await loseCommittedResponse(
      staff,
      `/api/staff/applications/${id}/documents`,
    );
    await upload
      .getByRole("button", { name: "Загрузить документ", exact: true })
      .click();
    await uploaded.committed;
    await expect(upload).toContainText("Передача прервана.");
    expect(
      await upload
        .getByLabel("Демонстрационный файл", { exact: true })
        .evaluate((input: HTMLInputElement) => input.files?.[0].size),
    ).toBe(fixture.length);
    await upload
      .getByRole("button", {
        name: "Обновить карточку, сохранив файл",
        exact: true,
      })
      .click();
    await expect(upload).toContainText("Загрузка подтверждена по истории.");
    await expect(
      staff.getByRole("link", { name: "Скачать версию 1", exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Скачать справку", exact: true }),
    ).toHaveCount(0);
    await expect(
      actions.getByRole("button", { name: "Применить действие", exact: true }),
    ).toBeEnabled();
    await actions
      .getByRole("button", { name: "Применить действие", exact: true })
      .click();
    await expect(
      staff.getByRole("region", { name: "Карточка заявки", exact: true }),
    ).toContainText("Выполнена");
    await page.bringToFront();
    await page.reload();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Скачать справку", exact: true })
      .click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    const downloaded = await readFile((await download.path())!);
    expect(downloaded.equals(fixture)).toBe(true);
    expect(
      (
        await page.request.get(`/api/applications/${id}/document?unexpected=1`)
      ).status(),
    ).toBe(400);
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await login(
      other,
      "student2@example.test",
      process.env.DEMO_STUDENT2_PASSWORD!,
    );
    expect((await other.request.get(`/api/applications/${id}`)).status()).toBe(
      404,
    );
    expect(
      (await other.request.get(`/api/applications/${id}/document`)).status(),
    ).toBe(404);
    expect(
      (await other.request.get(`/api/staff/applications/${id}`)).status(),
    ).toBe(403);
    await otherContext.close();
    await staff.bringToFront();
    await upload
      .getByLabel("Демонстрационный файл", { exact: true })
      .setInputFiles("demo/documents/demo-certificate.png");
    await expect(upload.getByRole("checkbox")).not.toBeChecked();
    await upload
      .getByLabel("Причина замены")
      .fill("Демо уточнение оформления образца справки.");
    await upload.getByRole("checkbox").check();
    await upload
      .getByRole("button", { name: "Сохранить новую версию", exact: true })
      .click();
    await expect(
      staff.getByRole("link", { name: "Скачать версию 2", exact: true }),
    ).toBeVisible();
    await expect(
      staff.getByRole("link", { name: "Скачать версию 1", exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await page.reload();
    const current = await page.request.get(`/api/applications/${id}`);
    expect(current.status()).toBe(200);
    const detail = await current.json();
    const bytes = await page.request.get(`/api/applications/${id}/document`);
    expect(bytes.status()).toBe(200);
    expect(bytes.headers()["content-type"]).toBe("image/png");
    expect(
      createHash("sha256")
        .update(await bytes.body())
        .digest("hex"),
    ).toBe(detail.currentDocument.sha256);
    await expect(
      page.getByRole("region", { name: "Справка", exact: true }),
    ).toContainText("Версия 2");
    for (const width of [360, 390, 1280]) {
      for (const [p, role] of [
        [staff, "staff"],
        [page, "student"],
      ] as const) {
        await p.bringToFront();
        await p.setViewportSize({ width, height: 900 });
        await p.emulateMedia({ reducedMotion: "reduce" });
        await p.evaluate(() => document.fonts.ready);
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(
          p.getByRole("navigation", { name: "Разделы платформы", exact: true }),
        ).toBeVisible();
        await p.screenshot({
          path: `test-results/issue43-${role}-${width}.png`,
          fullPage: true,
        });
        const documentControl = p.getByRole("link", {
          name: "Скачать справку",
          exact: true,
        });
        await documentControl.scrollIntoViewIfNeeded();
        await p.screenshot({
          path: `test-results/issue43-${role}-${width}-document.png`,
          fullPage: true,
        });
        if (role === "staff") {
          await upload
            .getByRole("button", {
              name: "Сохранить новую версию",
              exact: true,
            })
            .scrollIntoViewIfNeeded();
          await p.screenshot({
            path: `test-results/issue43-${role}-${width}-upload.png`,
            fullPage: true,
          });
        }
      }
    }
    // Ordinary applications genuinely finish without an attachment.
    await staff.bringToFront();
    await staff.goto(`/staff/applications/${generalId}`);
    await actions
      .getByRole("button", { name: "Применить действие", exact: true })
      .click();
    await expect(actions.getByLabel("Действие", { exact: true })).toHaveValue(
      "COMMENT",
    );
    await actions
      .getByLabel("Ответ / комментарий")
      .fill("Демо комментарий: вопрос рассмотрен.");
    await actions
      .getByRole("button", { name: "Применить действие", exact: true })
      .click();
    await expect(
      staff
        .getByTestId("application-event")
        .filter({ hasText: "Демо комментарий: вопрос рассмотрен." }),
    ).toHaveCount(1);
    await actions
      .getByLabel("Действие", { exact: true })
      .selectOption("COMPLETE");
    await actions
      .getByLabel("Ответ / комментарий")
      .fill("Демонстрационный ответ на учебный вопрос.");
    await actions
      .getByRole("button", { name: "Применить действие", exact: true })
      .click();
    await expect(
      staff.getByRole("region", { name: "Карточка заявки", exact: true }),
    ).toContainText("Демонстрационный ответ на учебный вопрос.");
    await expect(
      staff
        .getByRole("region", { name: "Карточка заявки", exact: true })
        .getByText("Выполнена", { exact: true }),
    ).toBeVisible();
    await page.bringToFront();
    await page.goto(`/applications/${generalId}`);
    await expect(
      page.getByRole("region", { name: "Карточка заявки", exact: true }),
    ).toContainText("Демонстрационный ответ на учебный вопрос.");
  }
  await staffContext.close();
});
