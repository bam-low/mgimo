import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { signInWithSession } from "./ui-sign-in";

test("STAFF moves faculty, program and group between the active tree and archive", async ({
  page,
}) => {
  test.skip(process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1", "Historical UI");
  test.setTimeout(90000);
  await page.setViewportSize({ width: 360, height: 900 });
  await signInWithSession(page, "staff@example.test", process.env.DEMO_STAFF_PASSWORD!);
  await page.goto("/staff/structure");

  const suffix = randomUUID().slice(0, 8);
  const faculty = `Демо факультет ${suffix}`;
  const program = `Демо направление ${suffix}`;
  const group = `Демо группа ${suffix}`;
  const active = page.getByRole("region", { name: "Активная учебная структура" });
  const archive = page.getByRole("region", { name: "Архив учебной структуры" });
  const heading = (name: string, archived = false) =>
    (archived ? archive : active).getByRole("heading", { name });

  for (const { name, label, parent } of [
    { name: faculty, label: "Добавить факультет" },
    { name: program, label: "Добавить направление", parent: faculty },
    { name: group, label: "Добавить группу", parent: `${faculty} / ${program}` },
  ]) {
    const form = page.getByRole("form", { name: label, exact: true });
    if (parent) await form.locator("select").selectOption({ label: parent });
    await form.getByLabel("Вымышленное название").fill(name);
    await form.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(heading(name)).toBeVisible();
  }

  await page.getByText("Архив учебной структуры", { exact: true }).click();
  const edit = async (name: string, title: string, archived = false) => {
    const disclosure = heading(name, archived)
      .locator("xpath=following-sibling::details[1]")
      .getByText(title, { exact: true });
    const form = (archived ? archive : active).getByRole("form", {
      name: `Изменить ${name}`,
      exact: true,
    });
    if (!(await form.isVisible())) await disclosure.click();
    return form;
  };
  const archiveButton = async (name: string, title: string, confirm = true) => {
    const form = await edit(name, title);
    page.once("dialog", (dialog) => confirm ? dialog.accept() : dialog.dismiss());
    await form.getByRole("button", { name: "Убрать в архив" }).click();
  };
  const restore = async (name: string, title: string) => {
    const form = await edit(name, title, true);
    await form.getByRole("button", { name: "Восстановить" }).click();
    await expect(heading(name)).toBeVisible();
  };

  await archiveButton(group, "Редактировать группу", false);
  await expect(heading(group)).toBeVisible();
  await expect(heading(group, true)).toHaveCount(0);
  await archiveButton(group, "Редактировать группу");
  await expect(heading(group)).toHaveCount(0);
  await expect(heading(group, true)).toBeVisible();

  await archiveButton(program, "Редактировать направление");
  await expect(heading(program)).toHaveCount(0);
  await expect(heading(program, true)).toBeVisible();
  await archiveButton(faculty, "Редактировать факультет");
  await expect(heading(faculty)).toHaveCount(0);
  await expect(heading(faculty, true)).toBeVisible();
  await expect(archive.getByRole("form", { name: `Изменить ${group}`, exact: true })).toHaveCount(0);

  await restore(faculty, "Редактировать факультет");
  await expect(heading(program)).toHaveCount(0);
  await restore(program, "Редактировать направление");
  await expect(heading(group)).toHaveCount(0);
  await restore(group, "Редактировать группу");
  await expect(heading(group, true)).toHaveCount(0);
});
