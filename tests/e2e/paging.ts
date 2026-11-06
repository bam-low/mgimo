import { expect, type Page, type Locator } from "@playwright/test";
// Wait for the rendered page, not just the URL: Next navigation can finish
// changing the address before its RSC payload/next-cursor has arrived.
export async function findPagedCard(
  page: Page,
  card: Locator,
  navName: string,
  nextName: string,
) {
  const nav = page.getByRole("navigation", { name: navName, exact: true });
  const next = page.getByRole("link", { name: nextName, exact: true });
  await expect(nav).toBeAttached();
  while (!(await card.count()) && (await next.count())) {
    const previous = await next.getAttribute("href");
    await next.click();
    await expect
      .poll(async () =>
        (await next.count()) ? await next.getAttribute("href") : null,
      )
      .not.toBe(previous);
    await expect(nav).toBeAttached();
  }
  await expect(card).toBeVisible();
  return card;
}
