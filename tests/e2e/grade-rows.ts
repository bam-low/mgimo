import type { Page } from "@playwright/test";

/** Both real layouts: historical row headings and current subject cards. */
export function gradeRows(page: Page, name: string) {
  const heading = page.getByRole("heading", { name, exact: true });
  return process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1"
    ? page.getByTestId("grade-row").filter({ has: heading })
    : page
        .locator(".grade-subject")
        .filter({ has: heading })
        .getByTestId("grade-row");
}
