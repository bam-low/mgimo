import { expectSignInLanding } from "./ui-sign-in";
import { findPagedCard } from "./paging";
import { test, expect } from "@playwright/test";
test("STAFF transfer, revoke and controlled resubmission use real guards and refresh at 360px", async ({
  page,
}) => {
  if (!process.env.DATABASE_URL?.split("?")[0].endsWith("_test"))
    throw Error("Dedicated synthetic test database required");
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
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
  await expect(page.getByTestId("demo-email")).toBeVisible();
  const name = await page.getByLabel("Вымышленный персонаж").inputValue();
  const email = await page.getByTestId("demo-email").inputValue(),
    password = await page.getByTestId("demo-password").inputValue();
  async function login(user: string, pass: string) {
    await page.goto("/login");
    await page.getByLabel("Демонстрационный логин", { exact: true }).fill(user);
    await page
      .getByLabel("Демонстрационный пароль", { exact: true })
      .evaluate((element, value) => {
        (element as HTMLInputElement).value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }, pass);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expectSignInLanding(page, user);
  }
  async function logout() {
    await page.getByRole("button", { name: "Выйти", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Вход в Кампус" }),
    ).toBeVisible();
  }
  async function staffLogin() {
    if (!process.env.DEMO_STAFF_PASSWORD)
      throw Error("Private staff fixture required");
    await login("staff@example.test", process.env.DEMO_STAFF_PASSWORD);
    // После входа STAFF открывается «Учебная структура»; очередь — в «Студентах».
    await page.goto("/staff");
  }
  async function memberCard() {
    return findPagedCard(
      page,
      page.getByTestId("student-membership").filter({ hasText: name }),
      "Страницы студентов",
      "Следующие студенты",
    );
  }
  await staffLogin();
  const pending = page.getByTestId("pending-request").filter({ hasText: name });
  await findPagedCard(page, pending, "Страницы очереди", "Следующие обращения");
  await pending
    .getByLabel("Причина / комментарий")
    .fill("Демо <script>window.campusUnsafe=true</script>");
  await pending.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(pending.getByLabel("Причина / комментарий")).toHaveCount(0);
  let card = await memberCard();
  await card.getByLabel("Целевая группа").selectOption("group-2");
  await card.getByLabel("Причина действия").fill("Демонстрационный перевод");
  await card.getByRole("button", { name: "Применить действие" }).click();
  await expect(card).toContainText("Группа: Демо-группа 2");
  await logout();
  await login(email, password);
  await expect(page.getByTestId("membership-status")).toHaveText(
    "Подтверждено",
  );
  await expect(
    process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1"
      ? page.getByText("Группа: Демо-группа 2", { exact: true })
      : page.getByTestId("profile-group"),
  ).toHaveText(
    process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1"
      ? "Группа: Демо-группа 2"
      : "Демо-группа 2",
  );
  await expect(process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1" ? page.getByText("Группа: Демо-группа 2", {exact:true}) : page.getByTestId("profile-group")).toBeVisible();
  expect(
    await page.evaluate(() =>
      fetch("/api/group?id=group-1").then((r) => r.status),
    ),
  ).toBe(403);
  await expect(
    page.getByText(/Комментарий последнего обращения:/),
  ).toContainText("<script>window.campusUnsafe=true</script>");
  expect(await page.evaluate(() => "campusUnsafe" in window)).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // Text scaling must retain controls; no final brand tokens are invented.
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await logout();
  await staffLogin();
  card = await memberCard();
  await card.getByLabel("Действие", { exact: true }).selectOption("REVOKE");
  await card.getByLabel("Причина действия").fill("Демонстрационный отзыв");
  await card.getByRole("button", { name: "Применить действие" }).click();
  await expect(card).toContainText("Прикрепление отозвано");
  await logout();
  await login(email, password);
  await expect(page.getByTestId("membership-status")).toHaveText(
    "Прикрепление отозвано",
  );
  await expect(
    page.getByRole("heading", { name: "Повторная подача", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => fetch("/api/group").then((r) => r.status)),
  ).toBe(403);
  await logout();
  await staffLogin();
  card = await memberCard();
  await card
    .getByLabel("Причина действия")
    .fill("Разрешена новая демонстрационная подача");
  await card.getByRole("button", { name: "Применить действие" }).click();
  await expect(card).toContainText("Повторная подача разрешена");
  await logout();
  await login(email, password);
  await page
    .getByLabel("Новая группа", { exact: true })
    .selectOption("group-1");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByTestId("membership-status")).toHaveText(
    "Ожидает подтверждения",
  );
});
