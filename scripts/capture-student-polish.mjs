// Local visual fixtures only: genuine UI login, actual authorized schedule,
// controlled response clock for screenshots. No production writes or cookies on disk.
/* global document, innerWidth, innerHeight, getComputedStyle, window */
import { URL } from "node:url";
import console from "node:console";
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
const origin = process.env.BETTER_AUTH_URL;
if (
  !origin ||
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  !process.env.DATABASE_URL?.split("?")[0].endsWith("_test")
)
  throw Error("Only isolated loopback *_test fixtures");
const phase = process.argv[2];
if (!["before", "after"].includes(phase)) throw Error("Choose before or after");
const out = path.resolve("docs/screenshots/issue-59", phase);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
});
const context = await browser.newContext({
  baseURL: origin,
  locale: "ru-RU",
  timezoneId: "Europe/Moscow",
});
const page = await context.newPage();
const rows = [];
page.setDefaultTimeout(20000);
async function capture(screen, width, state = "default", scroll = false) {
  console.log("Кадр", screen, width, state, scroll);
  if (
    ["/today", "/schedule", "/cabinet"].includes(new URL(page.url()).pathname)
  )
    await page.locator(".workspace-scroll").waitFor({ state: "visible" });
  if (["/today", "/schedule"].includes(new URL(page.url()).pathname))
    await page
      .locator(".lesson-list, .empty-day")
      .first()
      .waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".schedule-loading").waitFor({ state: "hidden" });
  if (scroll) {
    const moved = await page.evaluate(() => {
      const region = document.querySelector(".workspace-scroll");
      if (
        region &&
        region.scrollHeight - region.clientHeight > 40 &&
        getComputedStyle(region).overflowY !== "visible"
      ) {
        region.scrollTop = region.scrollHeight;
        return true;
      }
      if (document.documentElement.scrollHeight - innerHeight > 40) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        return true;
      }
      return false;
    });
    if (!moved) return;
  }
  await page.waitForFunction(() =>
    [...document.images]
      .filter((img) => {
        const r = img.getBoundingClientRect();
        return (
          r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0
        );
      })
      .every((img) => img.complete && img.naturalWidth > 0),
  );
  const file = `${screen}-${state}-${width}${scroll ? "-lower" : ""}.png`;
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(out, file), animations: "disabled" });
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth > innerWidth,
    workspace: [...document.querySelectorAll(".workspace-scroll")].some(
      (e) => e.scrollWidth > e.clientWidth,
    ),
  }));
  const headerOverlap =
    !scroll &&
    (await page.evaluate(() => {
      const header = document
        .querySelector(".masthead-actions")
        ?.getBoundingClientRect();
      const content = document
        .querySelector(".student-greeting, .editorial-heading")
        ?.getBoundingClientRect();
      return !!(
        header &&
        content &&
        header.left < content.right &&
        header.right > content.left &&
        header.top < content.bottom &&
        header.bottom > content.top
      );
    }));
  rows.push({
    headerOverlap,
    screen,
    state,
    width,
    height: 900,
    file: `${phase}/${file}`,
    overflow,
    scroll,
  });
}
for (const width of [360, 390, 768, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  for (const [screen, url] of [
    ["landing", "/"],
    ["login", "/login"],
  ]) {
    await page.goto(url);
    await capture(screen, width);
  }
}
await page
  .getByLabel("Демонстрационный логин", { exact: true })
  .fill("student1@example.test");
await page
  .getByLabel("Демонстрационный пароль", { exact: true })
  .fill(process.env.DEMO_STUDENT1_PASSWORD);
const [login] = await Promise.all([
  page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/auth/sign-in/email",
  ),
  page.getByRole("button", { name: "Войти", exact: true }).click(),
]);
if (login.status() !== 200) throw Error("UI login HTTP " + login.status());
await page.waitForURL(/\/(cabinet|today)$/);
const schedule = await (
  await page.request.get("/api/schedule?view=week")
).json();
const dates = [
  ...new Set(schedule.lessons.map((l) => l.startsAt.slice(0, 10))),
];
const first = dates[0];
const lessons = schedule.lessons.filter(
  (l) => l.startsAt.slice(0, 10) === first,
);
if (lessons.length < 2) throw Error("Seed requires multi-lesson week");
let mode = "ended";
await page.route("**/api/schedule?*", async (route) => {
  const response = await route.fetch();
  if (response.status() !== 200) {
    await route.fulfill({ response });
    return;
  }
  const actual = await response.json();
  const clock = {
    before: Date.parse(lessons[0].startsAt) - 60000,
    current: Date.parse(lessons[0].startsAt) + 300000,
    break: Date.parse(lessons[0].endsAt) + 1000,
    ended: Date.parse(lessons.at(-1).endsAt) + 60000,
    empty: Date.parse(lessons[0].startsAt),
  }[mode];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: actual.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(clock));
  const week =
    new URL(route.request().url()).searchParams.get("view") === "week";
  await route.fulfill({
    response,
    json: {
      ...actual,
      today,
      from: week ? schedule.from : today,
      serverNow: new Date(clock).toISOString(),
      lessons: mode === "empty" ? [] : week ? schedule.lessons : lessons,
    },
  });
});
for (const width of [360, 390, 768, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  mode = "ended";
  await page.goto("/today");
  await capture("today", width, "ended");
  await capture("today", width, "ended", true);
  await page.goto("/schedule");
  await capture("schedule", width, "day");
  await page.getByRole("button", { name: "Неделя", exact: true }).click();
  await capture("schedule", width, "week");
  await capture("schedule", width, "week", true);
  await page.goto("/cabinet");
  await capture("profile", width);
  await capture("profile", width, "default", true);
  if ([360, 1280].includes(width))
    for (const state of ["before", "current", "break", "empty"]) {
      mode = state;
      await page.goto("/today");
      await capture("today", width, state);
    }
}
let oldRows = [];
try {
  oldRows = JSON.parse(await readFile(path.join(out, "coverage.json"), "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const current = new Set(rows.map((row) => row.file));
for (const row of oldRows)
  if (
    !current.has(row.file) &&
    /^(landing|login|today|schedule|profile)-[a-z-]+-(360|390|768|1280)(-lower)?\.png$/.test(
      path.basename(row.file),
    )
  )
    await unlink(path.join(out, path.basename(row.file)));
await writeFile(
  path.join(out, "coverage.json"),
  JSON.stringify(rows, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    phase,
    images: rows.length,
    overflow: rows
      .filter((r) => Object.values(r.overflow).some(Boolean))
      .map((r) => r.file),
  }),
);
await browser.close();
