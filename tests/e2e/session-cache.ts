// Test fixtures only: reuse sessions obtained by real UI sign-in. Never forge
// sessions, reset rate buckets, change source headers, or package these cookies.
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page, type Cookie } from "@playwright/test";
const variable = "CAMPUS_E2E_SESSION_CACHE";
export default async function setup() {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-e2e-sessions-"));
  process.env[variable] = directory;
  return async () => {
    await rm(directory, { recursive: true, force: true });
  };
}
function file(email: string) {
  if (
    ![
      "staff@example.test",
      "student1@example.test",
      "student2@example.test",
    ].includes(email)
  )
    throw Error("Only fictional seeded accounts may use this fixture");
  const directory = process.env[variable];
  if (!directory) throw Error("Private E2E session fixture is not initialized");
  return path.join(directory, email.split("@")[0] + ".json");
}
export async function rememberSession(page: Page, email: string) {
  const cookies = (await page.context().cookies()).filter((c) =>
    c.name.endsWith("session_token"),
  );
  expect(cookies.length).toBe(1); // Never include cookie values in assertion diagnostics.
  await writeFile(file(email), JSON.stringify(cookies), { mode: 0o600 });
}
export async function reuseSession(page: Page, email: string) {
  let cookies: Cookie[];
  try {
    cookies = JSON.parse(await readFile(file(email), "utf8"));
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return false;
    // eslint-disable-next-line preserve-caught-error -- A parse error may contain session-cookie bytes.
    throw Error("Cannot read private session fixture");
  }
  try {
    await page.context().addCookies(cookies);
  } catch {
    throw Error("Cannot restore private session fixture");
  }
  await page.goto("/cabinet");
  // The real server must still accept the stored session and current membership.
  await expect(page).toHaveURL(/\/(cabinet|staff)$/);
  return true;
}
