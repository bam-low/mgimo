import { signInWithSession } from "./ui-sign-in";
import { test, expect } from "@playwright/test";
import { dayKey, monday, addDays } from "../../src/lib/schedule-time";
import { displayDate } from "../../src/app/schedule-input-values";
test.use({ timezoneId: "Pacific/Honolulu", locale: "en-US" });
test("Russian fields, real multi-lesson/empty days, and isolated clock boundary states", async ({
  page,
}) => {
  if (!process.env.DATABASE_URL?.split("?")[0].endsWith("_test"))
    throw Error("Dedicated synthetic *_test DB required");
  test.setTimeout(90000);
  await signInWithSession(
    page,
    "student1@example.test",
    process.env.DEMO_STUDENT1_PASSWORD!,
  );
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
  for (const width of [360, 390, 768, 1280]) {
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
  const historical = process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1";
  await expect(
    page.getByText(historical ? "Далее" : "Следующее", { exact: true }),
  ).toHaveCount(
    historical
      ? actual.lessons.filter(
          (l: { status: string }) => l.status === "SCHEDULED",
        ).length
      : 1,
  );
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
  await expect(
    page
      .locator(".student-home")
      .getByRole("link")
      .filter({ hasText: /недел|Все занятия/ }),
  ).toHaveCount(historical ? 4 : 1);
  await expect(
    page.getByRole("link", { name: "Посмотреть неделю", exact: true }),
  ).toHaveAttribute("href", historical ? "/schedule" : "/schedule?view=week");
  await expect(
    page.locator(".lesson.is-completed .lesson-detail h3").first(),
  ).toHaveCSS("text-decoration-line", historical ? "line-through" : "none");
  if (!historical)
    await expect(page.locator(".lesson-state > span").first()).toBeVisible();
  if (!historical) {
    await page
      .getByRole("link", { name: "Посмотреть неделю", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Неделя", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const dayButton = page.getByRole("button", { name: "День", exact: true });
    await dayButton.hover();
    const contrast = () =>
      dayButton.evaluate((el) => {
        const style = getComputedStyle(el);
        const luminance = (color: string) => {
          const channels = color
            .match(/\d+(?:\.\d+)?/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => v / 255)
            .map((v) =>
              v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            );
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const a = luminance(style.color),
          b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
    expect((await dayButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  instant = Date.parse(actual.lessons[0].endsAt) - 4000;
  await page.goto("/today");
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Сейчас перемена", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.unroute("**/api/schedule?*");
});
