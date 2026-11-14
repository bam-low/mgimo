import { expect, test, type Page, type Response } from "@playwright/test";
import { rememberSession, reuseSession } from "./session-cache";

/** Reuse only a real, live seeded session; auth-specific cases still sign in. */
export async function signInWithSession(
  page: Page,
  email: string,
  password: string,
) {
  if (await reuseSession(page, email)) return;
  const diagnostic = {
    name: "error-context",
    body: Buffer.from(JSON.stringify({ status: null })),
    contentType: "application/json",
  };
  // Override only a failed sign-in's automatic snapshot: it can contain a password.
  test.info().attachments.push(diagnostic);
  let result: Response;
  try {
    await page.goto("/login");
    await page
      .getByLabel("Демонстрационный логин", { exact: true })
      .fill(email);
    await page
      .getByLabel("Демонстрационный пароль", { exact: true })
      .fill(password);
    [result] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/auth/sign-in/email" &&
          r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Войти", exact: true }).click(),
    ]);
  } catch {
    // A Playwright fill error can contain its argument; do not retain that error.
    console.info("Результат входа E2E", { status: null });
    throw Error("UI-вход E2E не завершён; HTTP-ответ не получен.");
  }
  const status = result.status();
  let code: string | undefined;
  if (status !== 200) {
    const allowed = new Set([
      "INVALID_EMAIL_OR_PASSWORD",
      "TOO_MANY_REQUESTS",
      "INVALID_ORIGIN",
    ]);
    try {
      const value: unknown = (await result.json()).code;
      if (typeof value === "string" && allowed.has(value)) code = value;
    } catch {
      /* No JSON/code is a valid diagnostic result. */
    }
  }
  const safe = { status, ...(code ? { code } : {}) };
  diagnostic.body = Buffer.from(JSON.stringify(safe));
  console.info("Результат входа E2E", safe);
  expect(status, "HTTP-ответ входа E2E").toBe(200);
  await expect(page).toHaveURL(/\/(cabinet|staff)$/);
  const protectedResponse = await page.request.get(
    email === "staff@example.test"
      ? "/api/staff/schedule/builder"
      : "/api/group",
  );
  expect(protectedResponse.status()).toBe(200);
  await rememberSession(page, email);
  test
    .info()
    .attachments.splice(test.info().attachments.indexOf(diagnostic), 1);
}
