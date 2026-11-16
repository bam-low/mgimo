import { test, expect } from "@playwright/test";

test("Русские публичные экраны сохраняют формы, навигацию и адаптивность", async ({
  page,
}) => {
  for (const width of [360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const entry = page.getByRole("link", {
      name: "Войти в Кампус",
      exact: true,
    });
    await expect(entry).toBeVisible();
    const bounds = await entry.boundingBox();
    expect(bounds && bounds.y + bounds.height <= 900).toBe(true);
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { name: "Вход в Кампус", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Демонстрационный логин", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Демонстрационный пароль", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("link", { name: "Регистрация студента", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Регистрация студента", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Университет", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const missing = await page.goto("/demo-page-that-does-not-exist");
  expect(missing?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Страница не найдена", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Войти в личный кабинет", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
});
