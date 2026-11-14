import { test, expect, type Page } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { signInWithSession } from "./ui-sign-in";
test("Личные уведомления: справка, прочтение, конкуренция, отзыв и восстановление доступа", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = process.env.BETTER_AUTH_URL!,
    context = await browser.newContext(),
    sp = await context.newPage();
  page.on("dialog", (d) => d.accept());
  async function staffCard(testId: string, nextLabel: string) {
    for (let i = 0; i < 100; i++) {
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", {
          name: "Очередь прикреплений",
          exact: true,
        }),
      ).toBeVisible();
      const card = page.getByTestId(testId).filter({
        has: page.getByRole("heading", {
          name: "Демо Студент 2",
          exact: true,
        }),
      });
      if (await card.count()) return card;
      const next = page.getByRole("link", { name: nextLabel, exact: true });
      await expect(next).toBeVisible();
      const href = await next.getAttribute("href");
      expect(href).toMatch(/^\/staff\?(pendingAfter|membersAfter)=/);
      await next.click({ timeout: 15000 });
      await expect(page).toHaveURL(new URL(href!, origin).href);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", {
          name: "Очередь прикреплений",
          exact: true,
        }),
      ).toBeVisible();
    }
    throw Error("Не найдена карточка вымышленного студента в очереди");
  }

  async function post(p: Page, path: string, data: unknown) {
    return p.request.post(path, { headers: { origin }, data });
  }
  async function shot(p: Page, state: string) {
    for (const width of [360, 390, 768, 1280]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForLoadState("networkidle");
      await expect(p.getByText("Загрузка…", { exact: true })).toHaveCount(0);
      await expect(
        p.getByRole("heading", { name: "Уведомления", exact: true }),
      ).toBeVisible();
      await expect(
        p.locator(".notification-list, .notification-card").first(),
      ).toBeVisible();
      await p.evaluate(() => document.fonts.ready);
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await p
          .locator(".workspace-scroll")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      const geometry = await p.locator(".campus-masthead").evaluate((e) => {
        const b = e.querySelector(".wordmark")!.getBoundingClientRect(),
          x = e.querySelector("button")!.getBoundingClientRect();
        return Math.abs(b.y + b.height / 2 - x.y - x.height / 2);
      });
      expect(geometry).toBeLessThan(2);
      await p.screenshot({
        path: test.info().outputPath(`notifications-${state}-${width}.png`),
      });
    }
  }
  try {
    await signInWithSession(
      page,
      "staff@example.test",
      process.env.DEMO_STAFF_PASSWORD!,
    );
    await signInWithSession(
      sp,
      "student2@example.test",
      process.env.DEMO_STUDENT2_PASSWORD!,
    );
    await sp.goto("/notifications");
    await expect(
      sp.getByRole("heading", { name: "Уведомления", exact: true }),
    ).toBeVisible();
    if (
      (await (await sp.request.get("/api/notifications")).json()).items
        .length === 0
    ) {
      await expect(
        sp.getByRole("heading", { name: "Пока нет уведомлений" }),
      ).toBeVisible();
      await shot(sp, "empty");
    }
    const created = await post(sp, "/api/applications", {
      kind: "STUDY_CERTIFICATE",
      operationId: randomUUID(),
      purpose: "Демонстрационная справка для уведомлений",
      description: "",
    });
    expect(created.status()).toBe(200);
    const { id } = await created.json();
    const path = `/api/staff/applications/${id}`;
    const taking = await Promise.all([
      post(page, path + "/actions", {
        action: "TAKE",
        expectedVersion: 1,
        operationId: randomUUID(),
      }),
      post(page, path + "/actions", {
        action: "TAKE",
        expectedVersion: 1,
        operationId: randomUUID(),
      }),
    ]);
    expect(taking.map((r) => r.status()).sort()).toEqual([200, 409]);
    let d = await (await page.request.get(path)).json();
    const bytes = await readFile("demo/documents/demo-certificate.pdf");
    async function upload() {
      const response = await page.request.post(path + "/documents", {
        headers: { origin },
        multipart: {
          metadata: JSON.stringify({
            operationId: randomUUID(),
            expectedVersion: d.version,
            expectedCurrentDocumentId: d.currentDocumentId,
            demoConfirmed: true,
            ...(d.currentDocumentId
              ? { reason: "Демонстрационное обновление готовой справки" }
              : {}),
          }),
          file: {
            name: "demo-certificate.pdf",
            mimeType: "application/pdf",
            buffer: bytes,
          },
        },
      });
      expect(response.status()).toBe(200);
      d = await (await page.request.get(path)).json();
    }
    const noFile = await post(page, path + "/actions", {
      action: "COMPLETE",
      operationId: randomUUID(),
      expectedVersion: d.version,
      text: "Демонстрационный ответ",
    });
    expect(noFile.status()).toBe(409);
    await upload();
    expect(
      (await (await sp.request.get("/api/notifications")).json()).items.filter(
        (n: { target: { href?: string } }) =>
          n.target.href === `/applications/${id}`,
      ),
    ).toHaveLength(1);
    const complete = await post(page, path + "/actions", {
      action: "COMPLETE",
      operationId: randomUUID(),
      expectedVersion: d.version,
      text: "Демонстрационная справка готова",
    });
    expect(complete.status()).toBe(200);
    d = await (await page.request.get(path)).json();
    let items = (await (await sp.request.get("/api/notifications")).json())
      .items;
    const ready = items.find(
      (n: { kind: string; target: { href?: string } }) =>
        n.kind === "CERTIFICATE_READY" &&
        n.target.href === `/applications/${id}`,
    );
    expect(ready).toBeDefined();
    const beforeGet = await sp.request.get(`/api/notifications/${ready.id}`);
    expect((await beforeGet.json()).notification.readAt).toBeNull();
    const foreign = await browser.newContext(),
      fp = await foreign.newPage();
    try {
      await signInWithSession(
        fp,
        "student1@example.test",
        process.env.DEMO_STUDENT1_PASSWORD!,
      );
      expect(
        (await fp.request.get(`/api/notifications/${ready.id}`)).status(),
      ).toBe(404);
      expect(
        (await post(fp, `/api/notifications/${ready.id}/read`, {})).status(),
      ).toBe(404);
    } finally {
      await foreign.close();
    }
    expect((await page.request.get("/api/notifications")).status()).toBe(403);
    await sp.goto("/notifications?filter=unread");
    const taken = items.find(
      (n: { kind: string; target: { href?: string } }) =>
        n.kind === "APPLICATION_TAKEN" &&
        n.target.href === `/applications/${id}`,
    );
    expect(taken).toBeDefined();
    const takenCard = sp
      .locator("article")
      .filter({ has: sp.locator(`a[href^="/notifications/${taken.id}?"]`) });
    await sp.route(
      `**/api/notifications/${taken.id}/read`,
      async (route) => {
        const committed = await route.fetch();
        expect(committed.status()).toBe(200);
        await route.abort();
      },
      { times: 1 },
    );
    await takenCard
      .getByRole("button", { name: "Отметить прочитанным", exact: true })
      .click();
    await expect(takenCard.getByRole("alert")).toContainText(
      "Карточка сохранена",
    );
    expect(
      (await (await sp.request.get(`/api/notifications/${taken.id}`)).json())
        .notification.readAt,
    ).not.toBeNull();
    await takenCard
      .getByRole("button", { name: "Отметить прочитанным", exact: true })
      .click();
    await expect(
      sp.locator(`a[href^="/notifications/${taken.id}?"]`),
    ).toHaveCount(0);
    await shot(sp, "unread");
    await sp
      .getByRole("link", {
        name: "Демонстрационная справка готова",
        exact: true,
      })
      .click();
    await expect(sp.getByText("Прочитано", { exact: true })).toBeVisible();
    await shot(sp, "ready");
    const reads = await Promise.all(
      Array.from({ length: 4 }, () =>
        post(sp, `/api/notifications/${ready.id}/read`, {}),
      ),
    );
    for (const r of reads) expect(r.status()).toBe(200);
    const times = await Promise.all(
      reads.map(async (r) => (await r.json()).readAt),
    );
    expect(new Set(times).size).toBe(1);
    const denied = await sp.request.post(
      `/api/notifications/${ready.id}/read`,
      { headers: { origin: "https://foreign.invalid" }, data: {} },
    );
    expect(denied.status()).toBe(403);
    const downloaded = await sp.request.get(`/api/applications/${id}/document`);
    expect(downloaded.status()).toBe(200);
    expect(
      createHash("sha256")
        .update(await downloaded.body())
        .digest("hex"),
    ).toBe(createHash("sha256").update(bytes).digest("hex"));
    await upload();
    items = (await (await sp.request.get("/api/notifications")).json()).items;
    expect(
      items.filter(
        (n: { kind: string; target: { href?: string } }) =>
          n.kind === "CERTIFICATE_UPDATED" &&
          n.target.href === `/applications/${id}`,
      ),
    ).toHaveLength(1);
    await sp.reload();
    await expect(sp.getByText(/Документ уже обновлён/)).toBeVisible();
    await page.goto("/staff");
    const card = await staffCard("student-membership", "Следующие студенты");
    await card.getByLabel("Действие", { exact: true }).selectOption("REVOKE");
    await card
      .getByLabel("Причина действия")
      .fill("Демонстрационный отзыв для проверки уведомлений");
    await card.getByRole("button", { name: "Применить действие" }).click();
    await expect(card).toContainText("Прикрепление отозвано");
    try {
      await sp.goto(`/notifications/${ready.id}`);
      await expect(sp.getByText(/Учебный доступ закрыт/)).toBeVisible();
      await expect(
        sp.getByRole("link", { name: "Открыть заявку", exact: true }),
      ).toHaveCount(0);
      await shot(sp, "revoked");
      expect((await sp.request.get(`/api/applications/${id}`)).status()).toBe(
        403,
      );
      expect(
        (await sp.request.get(`/api/applications/${id}/document`)).status(),
      ).toBe(403);
      const response = await sp.request.get(`/api/notifications/${ready.id}`),
        safe = await response.json();
      expect(response.status()).toBe(200);
      expect(safe.notification.readAt).toBe(times[0]);
      expect(JSON.stringify(safe)).not.toContain(id);
    } finally {
      await page.goto("/staff");
      const recovery = await staffCard(
        "student-membership",
        "Следующие студенты",
      );
      await recovery
        .getByLabel("Причина действия")
        .fill("Демонстрационное восстановление после проверки");
      await recovery
        .getByRole("button", { name: "Применить действие" })
        .click();
      await expect(recovery).toContainText("Повторная подача разрешена");
      await sp.goto("/cabinet");
      await sp
        .getByLabel("Новая группа", { exact: true })
        .selectOption("group-2");
      await sp.getByRole("button", { name: "Отправить", exact: true }).click();
      await expect(sp.getByTestId("membership-status")).toHaveText(
        "Ожидает подтверждения",
      );
      await page.goto("/staff");
      const pending = await staffCard("pending-request", "Следующие обращения");
      await pending.getByLabel("Решение").selectOption("APPROVED");
      await pending
        .getByLabel("Причина / комментарий")
        .fill("Демонстрационное восстановление группы");
      await pending
        .getByRole("button", { name: "Отправить", exact: true })
        .click();
      await expect(pending).toHaveCount(0);
    }
    await sp.goto("/notifications");
    const approved = (
      await (await sp.request.get("/api/notifications")).json()
    ).items.filter(
      (n: { kind: string; target: { available: boolean; href?: string } }) =>
        n.kind === "ENROLLMENT_APPROVED" &&
        n.target.available &&
        n.target.href === "/cabinet",
    );
    expect(approved).toHaveLength(1);
    await expect(
      sp.locator(`a[href^="/notifications/${approved[0].id}?"]`),
    ).toBeVisible();
    expect(
      (await sp.request.get(`/api/applications/${id}/document`)).status(),
    ).toBe(200);
    await sp.goto(`/notifications/${ready.id}`);
    await expect(
      sp.getByRole("link", { name: "Открыть заявку", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
