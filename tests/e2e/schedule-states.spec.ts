import { test, expect } from "@playwright/test";
import { dayKey, monday, addDays } from "../../src/lib/schedule-time";
import { displayDate } from "../../src/app/schedule-input-values";
test.use({ timezoneId: "Pacific/Honolulu", locale: "en-US" });
test("Russian fields, real multi-lesson/empty days, and isolated clock boundary states", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/login");
  await page
    .getByLabel("Демонстрационный логин", { exact: true })
    .fill("student1@example.test");
  await page
    .getByLabel("Демонстрационный пароль", { exact: true })
    .evaluate((e, v) => {
      (e as HTMLInputElement).value = v;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    }, process.env.DEMO_STUDENT1_PASSWORD!);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/cabinet$/);
  const today = dayKey(new Date(), "Europe/Moscow"),
    first = monday(today),
    empty = addDays(first, 6);
  await page.goto("/schedule");
  await page.getByLabel("Дата", { exact: true }).fill(displayDate(first));
  await expect(page.locator(".lesson")).toHaveCount(3);
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(
    displayDate(first),
  );
  const response = await page.request.get(
    "/api/schedule?view=today&day=" + first,
  );
  expect(response.status()).toBe(200);
  const actual = await response.json();
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page
        .locator(".workspace-scroll")
        .evaluate((e) => e.scrollWidth <= e.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/issue34-review-student-multiple-${width}.png`,
    });
  }
  await page.getByLabel("Дата", { exact: true }).fill(displayDate(empty));
  await expect(page.locator(".lesson")).toHaveCount(0);
  await expect(page.locator(".empty-day")).toBeVisible();
  await page.screenshot({
    path: "test-results/issue34-review-student-empty-1280.png",
  });
  // UI state coverage only: actual seeded lessons, controlled serverNow response.
  // This does not write records, change server clocks, or prove backend auth.
  let instant = Date.parse(actual.lessons[0].startsAt) - 60000;
  await page.route("**/api/schedule?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...actual,
        today: first,
        from: first,
        view: "today",
        serverNow: new Date(instant).toISOString(),
      }),
    }),
  );
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Учебный день впереди", exact: true }),
  ).toBeVisible();
  instant = Date.parse(actual.lessons[0].startsAt) + 300000;
  await page.goto("/today");
  await expect(page.getByRole("progressbar")).toBeVisible();
  instant = Date.parse(actual.lessons[0].endsAt) + 1000;
  await page.goto("/today");
  await expect(
    page.getByRole("heading", { name: "Сейчас перемена", exact: true }),
  ).toBeVisible();
  instant = Date.parse(actual.lessons.at(-1).endsAt) + 60000;
  await page.goto("/today");
  await expect(
    page.getByRole("heading", {
      name: "Все пары на сегодня закончились",
      exact: true,
    }),
  ).toBeVisible();
  instant = Date.parse(actual.lessons[0].endsAt) - 4000;
  await page.goto("/today");
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Сейчас перемена", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.unroute("**/api/schedule?*");
});
