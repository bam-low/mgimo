import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { signInWithSession } from "./ui-sign-in";

test("Форма результата блокирует отправку до JS и сохраняет неверную дату", async ({
  page, browser, baseURL, httpCredentials, ignoreHTTPSErrors,
}) => {
  await signInWithSession(page, "staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
  // Isolated fictional fixture through the real, authorized and audited API.
  const subjectId = randomUUID();
  const response = await page.request.post("/api/staff/subjects", {
    headers: { Origin: new URL(baseURL!).origin },
    data: { action: "CREATE", operationId: subjectId, name: "Демо готовность формы " + subjectId.slice(0, 8) },
  });
  expect(response.status()).toBe(200);
  await page.goto("/staff/grades");
  const option = page.getByLabel("Студент", { exact: true }).locator("option").filter({ hasText: "Студент 1" });
  for (let n = 0; await option.count() === 0 && n < 10; n++) {
    await page.goto((await page.getByRole("link", { name: "Следующие студенты", exact: true }).getAttribute("href"))!);
  }
  await expect(option).toHaveCount(1);
  const membershipId = await option.getAttribute("value");
  const historical = process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1";
  for (const width of [360, 1280]) {
    const context = await browser.newContext({ baseURL, httpCredentials, ignoreHTTPSErrors, viewport: { width, height: 900 }, locale: "ru-RU" });
    await context.addCookies(await page.context().cookies());
    const p = await context.newPage();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let delayed = 0, gets = 0, writes = 0, observe = false;
    await p.route("**/_next/static/**/*.js", async route => {
      delayed++;
      await held;
      await route.continue().catch(() => {});
    });
    p.on("request", request => {
      const pathname = new URL(request.url()).pathname;
      if (observe && request.isNavigationRequest() && request.method() === "GET" && pathname === "/staff/grades") gets++;
      if (request.method() === "POST" && pathname === "/api/staff/grades") writes++;
    });
    try {
      await p.goto("/staff/grades?student=" + membershipId, { waitUntil: "commit" });
      const form = p.getByRole("form", { name: "Выставить результат", exact: true });
      await expect(form).toBeVisible();
      await expect.poll(() => delayed).toBeGreaterThan(0);
      const subject = form.getByLabel("Дисциплина", { exact: true });
      const date = form.getByLabel("Дата выставления", { exact: true });
      const send = form.getByRole("button", { name: "Выставить результат", exact: true });
      const initialUrl = p.url();
      observe = true;
      if (historical) {
        // Frozen old application predates this guard. Keep its documented
        // contract visible; its existing 18 scenarios are still all executed.
        await expect(form).not.toHaveAttribute("data-ready", "false");
        await expect(subject).toBeEnabled();
      } else {
        await expect(form).toHaveAttribute("data-ready", "false");
        await expect(subject).toBeDisabled();
        await expect(date).toBeDisabled();
        await expect(send).toBeDisabled();
        await send.evaluate((button: HTMLButtonElement) => button.click());
        await p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(gets).toBe(0);
        expect(writes).toBe(0);
        expect(p.url()).toBe(initialUrl);
      }
      release();
      if (!historical) await expect(form).toHaveAttribute("data-ready", "true");
      // Picker existence is the old application's real client-ready effect.
      await expect(form.getByRole("button", { name: "Открыть календарь: Дата выставления", exact: true })).toBeVisible();
      await expect(subject).toBeEnabled();
      await subject.selectOption(subjectId);
      await date.fill("31.02.2026");
      await send.click();
      await expect.poll(() => date.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe("");
      await expect(date).toHaveValue("31.02.2026");
      await expect(form.locator('input[name="issuedOn"]')).toHaveValue("");
      expect(writes).toBe(0);
      expect(gets).toBe(0);
      expect(p.url()).toBe(initialUrl);
      if (!historical) expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await p.screenshot({ path: test.info().outputPath(`grades-ready-${width}.png`), fullPage: true });
    } finally {
      release();
      await context.close();
    }
  }
});
