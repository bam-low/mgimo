import { test, expect } from "@playwright/test";
import { signInWithSession } from "./ui-sign-in";

test("Форма занятия не отправляет GET до готовности JS и сохраняет невозможную дату", async ({
  page,
  browser,
  baseURL,
  httpCredentials,
  ignoreHTTPSErrors,
}) => {
  await signInWithSession(
    page,
    "staff@example.test",
    process.env.DEMO_STAFF_PASSWORD!,
  );
  for (const width of [360, 1280]) {
    const context = await browser.newContext({
      baseURL,
      httpCredentials,
      ignoreHTTPSErrors,
      viewport: { width, height: 900 },
      locale: "ru-RU",
    });
    await context.addCookies(await page.context().cookies()); // Genuine UI session, in memory only.
    const p = await context.newPage();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let delayed = 0;
    await p.route("**/_next/static/**/*.js", async (route) => {
      delayed++;
      await held;
      try {
        await route.continue();
      } catch {
        /* Navigation cancellation closes pending requests. */
      }
    });
    let observe = false,
      gets = 0,
      writes = 0;
    p.on("request", (r) => {
      const path = new URL(r.url()).pathname;
      if (
        observe &&
        r.isNavigationRequest() &&
        r.method() === "GET" &&
        path === "/staff/schedule"
      )
        gets++;
      if (r.method() === "POST" && path === "/api/staff/schedule") writes++;
    });
    try {
      await p.goto("/staff/schedule?groupId=group-1", { waitUntil: "commit" });
      const form = p.getByRole("form", { name: "Занятие", exact: true });
      await expect(form).toBeVisible();
      await expect.poll(() => delayed).toBeGreaterThan(0);
      await expect(form).toHaveAttribute("data-ready", "false");
      await expect(
        form.getByLabel("Дисциплина", { exact: true }),
      ).toBeDisabled();
      const date = form.getByLabel("Дата занятия", { exact: true });
      const send = form.getByRole("button", {
        name: "Создать занятие",
        exact: true,
      });
      await expect(date).toBeDisabled();
      await expect(send).toBeDisabled();
      const originalUrl = p.url();
      observe = true;
      // Native HTMLElement.click() is suppressed by the disabled fieldset.
      await send.evaluate((button: HTMLButtonElement) => button.click());
      await p.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      expect(gets).toBe(0);
      expect(writes).toBe(0);
      expect(p.url()).toBe(originalUrl);
      release();
      await expect(form).toHaveAttribute("data-ready", "true");
      await expect(date).toBeEnabled();
      await form
        .getByLabel("Дисциплина", { exact: true })
        .fill("Демо проверка готовности формы");
      await date.fill("31.02.2026");
      await send.click();
      await expect
        .poll(() => date.evaluate((e: HTMLInputElement) => e.validationMessage))
        .not.toBe("");
      await expect(date).toHaveValue("31.02.2026");
      await expect(form.locator('input[name="day"]')).toHaveValue("");
      expect(
        await date.evaluate((e: HTMLInputElement) => e.validity.valid),
      ).toBe(false);
      expect(gets).toBe(0);
      expect(writes).toBe(0);
      expect(p.url()).toBe(originalUrl);
    } finally {
      release();
      await context.close();
    }
  }
});
