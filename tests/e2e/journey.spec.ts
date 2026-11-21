import { expectSignInLanding } from "./ui-sign-in";
import { findPagedCard } from "./paging";
import { test, expect } from "@playwright/test";
for (const width of [360, 1280])
  test(`student → staff → approved at ${width}px`, async ({ page }, info) => {
    if (!process.env.DATABASE_URL?.split("?")[0].endsWith("_test"))
      throw Error("E2E must use a dedicated *_test DB");
    const consoleMessages: string[] = [];
    const urls: string[] = [];
    page.on("console", (message) => consoleMessages.push(message.text()));
    page.on("request", (request) => urls.push(request.url()));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/register");
    expect(
      await page
        .locator(
          'input[name="firstName"],input[name="lastName"],input[name="email"],input[name="password"]',
        )
        .count(),
    ).toBe(0);
    await page
      .getByLabel("Университет", { exact: true })
      .selectOption("demo-university");
    await page
      .getByLabel("Факультет", { exact: true })
      .selectOption("faculty-1");
    await page
      .getByLabel("Направление", { exact: true })
      .selectOption("program-1");
    await page.getByLabel("Группа", { exact: true }).selectOption("group-1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Создать демонстрационный аккаунт" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Демонстрационный аккаунт создан" }),
    ).toBeVisible();
    const name = await page.getByLabel("Вымышленный персонаж").inputValue();
    const email = await page.getByTestId("demo-email").inputValue();
    const password = await page.getByTestId("demo-password").inputValue();
    expect(email.endsWith("@example.test")).toBe(true);
    expect(password.length >= 32).toBe(true);
    await expect(page.getByTestId("demo-password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(consoleMessages.some((s) => s.includes(password))).toBe(false);
    expect(urls.some((s) => s.includes(password))).toBe(false);
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).length + Object.keys(sessionStorage).length,
      ),
    ).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Перейти к входу" }).click();
    await expect(page.getByTestId("demo-password")).toHaveCount(0);
    async function login(user: string, pass: string) {
      await page.goto("/login");
      await page
        .getByLabel("Демонстрационный логин", { exact: true })
        .fill(user);
      const passwordInput = page.getByLabel("Демонстрационный пароль", {
        exact: true,
      });
      await expect(passwordInput).toBeVisible();
      // Do not put a password in fill(value) action logs on failure.
      await passwordInput.evaluate((element, value) => {
        (element as HTMLInputElement).value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, pass);
      await page.getByRole("button", { name: "Войти", exact: true }).click();
      await expectSignInLanding(page, user);
    }
    await login(email, password);
    await expect(page.getByTestId("membership-status")).toHaveText(
      "Ожидает подтверждения",
    );
    const sessionCookie = (await page.context().cookies()).find((c) =>
      c.name.endsWith("session_token"),
    );
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");
    expect(
      await page.evaluate(() => fetch("/api/group").then((r) => r.status)),
    ).toBe(403);
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    if (!process.env.DEMO_STAFF_PASSWORD)
      throw Error("DEMO_STAFF_PASSWORD required");
    await login("staff@example.test", process.env.DEMO_STAFF_PASSWORD);
    // После входа STAFF открывается «Учебная структура»; очередь — в «Студентах».
    await page.goto("/staff");
    const card = page.getByTestId("pending-request").filter({ hasText: name });
    await findPagedCard(page, card, "Страницы очереди", "Следующие обращения");
    await expect(card).toBeVisible();
    await card
      .getByLabel("Причина / комментарий")
      .fill("Проверено на синтетических данных");
    await card.getByRole("button", { name: "Отправить" }).click();
    await expect(card).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await login(email, password);
    await expect(page.getByTestId("membership-status")).toHaveText(
      "Подтверждено",
    );
    expect(
      await page.evaluate(() => fetch("/api/group").then((r) => r.status)),
    ).toBe(200);
    expect(
      await page.evaluate(() =>
        fetch("/api/group?id=group-2").then((r) => r.status),
      ),
    ).toBe(403);
    expect(consoleMessages.some((s) => s.includes(password))).toBe(false);
    await page.screenshot({
      path: info.outputPath(`approved-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      await page.evaluate(() => fetch("/api/group").then((r) => r.status)),
    ).toBe(401);
    if (!process.env.DEMO_STUDENT2_PASSWORD)
      throw Error("Second private demo credential required");
    await login("student2@example.test", process.env.DEMO_STUDENT2_PASSWORD);
    expect(
      await page.evaluate(() =>
        fetch("/api/group?id=group-1").then((r) => r.status),
      ),
    ).toBe(403);
    expect(
      await page.evaluate(() => fetch("/api/group").then((r) => r.status)),
    ).toBe(200);
    await page.getByRole("button", { name: "Выйти" }).click();
  });

test("registration empty/error states stay usable without collecting identities", async ({
  page,
}) => {
  await page.route("**/api/structure", (route) => route.fulfill({ json: [] }));
  await page.goto("/register");
  await expect(
    page.getByRole("button", { name: "Создать демонстрационный аккаунт" }),
  ).toBeDisabled();
  await expect(
    page.locator('input[name="email"],input[name="password"]'),
  ).toHaveCount(0);
});

for (const width of [360, 1280])
  test(`issued credentials survive tab switching, then clear on explicit exit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/register");
    await page
      .getByLabel("Университет", { exact: true })
      .selectOption("demo-university");
    await page
      .getByLabel("Факультет", { exact: true })
      .selectOption("faculty-1");
    await page
      .getByLabel("Направление", { exact: true })
      .selectOption("program-1");
    await page.getByLabel("Группа", { exact: true }).selectOption("group-1");
    await page
      .getByRole("button", { name: "Создать демонстрационный аккаунт" })
      .click();
    await expect(page.getByTestId("demo-password")).toBeVisible();
    const password = await page.getByTestId("demo-password").inputValue();
    await page
      .getByRole("button", { name: "Показать пароль", exact: true })
      .click();
    await expect(page.getByTestId("demo-password")).toHaveAttribute(
      "type",
      "text",
    );
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("demo-password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      (await page.getByTestId("demo-password").inputValue()) === password,
    ).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page
      .getByRole("button", { name: "Показать пароль", exact: true })
      .click();
    await expect(page.getByTestId("demo-password")).toHaveAttribute(
      "type",
      "text",
    );
    expect(
      (await page.getByTestId("demo-password").inputValue()) === password,
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          Object.keys(localStorage).length + Object.keys(sessionStorage).length,
      ),
    ).toBe(0);
    expect(
      (await page.context().cookies()).some((cookie) =>
        cookie.value.includes(password),
      ),
    ).toBe(false);
    expect(page.url().includes(password)).toBe(false);
    if (width === 360) {
      await page.getByRole("link", { name: "Перейти к входу" }).click();
      await expect(page).toHaveURL(/\/login$/);
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      await expect(
        page.getByRole("button", { name: "Новая попытка" }),
      ).toBeVisible();
    }
    await expect(page.getByTestId("demo-password")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("demo-password")).toHaveCount(0);
  });

for (const event of ["pagehide", "hidden"] as const)
  test(`a late registration response cannot re-expose credentials after ${event}`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const state = window as Window & {
        finishRegistration?: () => void;
        registrationSignal?: AbortSignal | null;
        registrationCalls?: number;
      };
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        if (input !== "/api/register" || init?.method !== "POST")
          return original(input, init);
        state.registrationSignal = init.signal;
        state.registrationCalls = (state.registrationCalls ?? 0) + 1;
        // Deliberately ignore AbortSignal: even a transport delivering after cancel
        // must not resurrect credentials. No request reaches the real signup API.
        return new Promise<Response>((resolve) => {
          state.finishRegistration = () =>
            resolve(
              Response.json({
                credentials: {
                  firstName: "Демо",
                  lastName: "Студент Отмена",
                  email: "cancelled@example.test",
                  password: crypto.randomUUID() + crypto.randomUUID(),
                },
              }),
            );
        });
      };
    });
    await page.goto("/register");
    await page
      .getByLabel("Университет", { exact: true })
      .selectOption("demo-university");
    await page
      .getByLabel("Факультет", { exact: true })
      .selectOption("faculty-1");
    await page
      .getByLabel("Направление", { exact: true })
      .selectOption("program-1");
    await page.getByLabel("Группа", { exact: true }).selectOption("group-1");
    await page
      .getByRole("button", { name: "Создать демонстрационный аккаунт" })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            (window as Window & { finishRegistration?: () => void })
              .finishRegistration,
          ),
        ),
      )
      .toBe(true);
    await page.evaluate((event) => {
      if (event === "pagehide") window.dispatchEvent(new Event("pagehide"));
      else {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }
    }, event);
    expect(
      await page.evaluate(() =>
        Boolean(
          (window as Window & { registrationSignal?: AbortSignal })
            .registrationSignal?.aborted,
        ),
      ),
    ).toBe(true);
    await page.evaluate(async () => {
      (
        window as Window & { finishRegistration?: () => void }
      ).finishRegistration?.();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(page.getByTestId("demo-password")).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { registrationCalls?: number }).registrationCalls,
      ),
    ).toBe(1);
    await expect(
      page.getByRole("button", { name: "Новая попытка" }),
    ).toBeVisible();
  });

test("account quota errors are accessible and never display credentials", async ({
  page,
}) => {
  await page.route("**/api/register", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({ status: 429, json: { error: "Unavailable" } });
    else await route.continue();
  });
  await page.goto("/register");
  await page
    .getByLabel("Университет", { exact: true })
    .selectOption("demo-university");
  await page.getByLabel("Факультет", { exact: true }).selectOption("faculty-1");
  await page
    .getByLabel("Направление", { exact: true })
    .selectOption("program-1");
  await page.getByLabel("Группа", { exact: true }).selectOption("group-1");
  await page
    .getByRole("button", { name: "Создать демонстрационный аккаунт" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Лимит попыток достигнут",
  );
  await expect(page.getByTestId("demo-password")).toHaveCount(0);
});
