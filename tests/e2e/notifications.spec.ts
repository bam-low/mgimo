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
    sp = await context.newPage(),
    otherContext = await browser.newContext(),
    op = await otherContext.newPage();
  page.on("dialog", (d) => d.accept());
  async function post(p: Page, path: string, data: unknown) {
    return p.request.post(path, { headers: { origin }, data });
  }
  async function staffCard(testId: string, nextLabel: string) {
    for (let i = 0; i < 100; i++) {
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", {
          name: "Очередь прикреплений",
          exact: true,
        }),
      ).toBeVisible();
      const card = page
        .getByTestId(testId)
        .filter({
          has: page.getByRole("heading", {
            name: "Демо Студент 1",
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
    }
    throw Error("Не найдена карточка вымышленного студента в очереди");
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
  type Notice = {
    id: string;
    kind: string;
    readAt: string | null;
    target: { href?: string; available: boolean };
  };
  async function notices(p: Page): Promise<Notice[]> {
    const r = await p.request.get("/api/notifications");
    expect(r.status()).toBe(200);
    return (await r.json()).items;
  }
  async function action(id: string, name: string, text?: string) {
    const d = await (
      await page.request.get(`/api/staff/applications/${id}`)
    ).json();
    return post(page, `/api/staff/applications/${id}/actions`, {
      action: name,
      expectedVersion: d.version,
      operationId: randomUUID(),
      ...(text ? { text } : {}),
    });
  }
  try {
    await signInWithSession(
      page,
      "staff@example.test",
      process.env.DEMO_STAFF_PASSWORD!,
    );
    await signInWithSession(
      sp,
      "student1@example.test",
      process.env.DEMO_STUDENT1_PASSWORD!,
    );
    await signInWithSession(
      op,
      "student2@example.test",
      process.env.DEMO_STUDENT2_PASSWORD!,
    );
    await op.goto("/notifications");
    if (!(await notices(op)).length) {
      await expect(
        op.getByRole("heading", { name: "Пока нет уведомлений" }),
      ).toBeVisible();
      await shot(op, "empty");
    }
    // Two writes per STUDENT2/runtime: four across both Node runtimes, under the
    // unchanged five creations/10min limit. No extra STAFF uploads in a full suite.
    const general = await post(op, "/api/applications", {
      kind: "GENERAL_REQUEST",
      operationId: randomUUID(),
      subject: "Демо уведомление об обращении",
      description: "Вымышленный вопрос для проверки статуса",
    });
    expect(general.status()).toBe(200);
    const generalId = (await general.json()).id;
    const taking = await Promise.all([
      post(page, `/api/staff/applications/${generalId}/actions`, {
        action: "TAKE",
        expectedVersion: 1,
        operationId: randomUUID(),
      }),
      post(page, `/api/staff/applications/${generalId}/actions`, {
        action: "TAKE",
        expectedVersion: 1,
        operationId: randomUUID(),
      }),
    ]);
    expect(taking.map((r) => r.status()).sort()).toEqual([200, 409]);
    expect(
      (
        await action(
          generalId,
          "COMPLETE",
          "Демонстрационный ответ без вложения",
        )
      ).status(),
    ).toBe(200);
    const empty = await post(op, "/api/applications", {
      kind: "STUDY_CERTIFICATE",
      operationId: randomUUID(),
      purpose: "Проверка запрета без файла",
      description: "",
    });
    expect(empty.status()).toBe(200);
    const emptyId = (await empty.json()).id;
    expect((await action(emptyId, "TAKE")).status()).toBe(200);
    expect(
      (await action(emptyId, "COMPLETE", "Демо готово без файла")).status(),
    ).toBe(409);
    expect(
      (
        await action(emptyId, "REJECT", "Демонстрационный мотивированный отказ")
      ).status(),
    ).toBe(200);
    const own = await notices(op);
    expect(
      own.filter(
        (n) =>
          n.kind === "APPLICATION_COMPLETED" &&
          n.target.href === `/applications/${generalId}`,
      ),
    ).toHaveLength(1);
    expect(
      own.filter(
        (n) =>
          n.kind === "APPLICATION_REJECTED" &&
          n.target.href === `/applications/${emptyId}`,
      ),
    ).toHaveLength(1);
    expect(
      own.filter(
        (n) =>
          n.kind === "CERTIFICATE_READY" &&
          n.target.href === `/applications/${emptyId}`,
      ),
    ).toHaveLength(0);
    // Reuse the real completed/replaced certificate produced by applications.spec.
    // It independently verifies uploaded/downloaded bytes in every runtime. A
    // single-test run remains self-contained via the same real upload workflow.
    let items = await notices(sp);
    const list = await sp.request.get(
      "/api/applications?kind=STUDY_CERTIFICATE&status=COMPLETED",
    );
    expect(list.status()).toBe(200);
    const candidate = (await list.json()).rows.find(
      (a: { id: string }) =>
        items.some(
          (n) =>
            n.kind === "CERTIFICATE_READY" &&
            !n.readAt &&
            n.target.href === `/applications/${a.id}`,
        ) &&
        items.some(
          (n) =>
            n.kind === "CERTIFICATE_UPDATED" &&
            n.target.href === `/applications/${a.id}`,
        ),
    );
    let id: string;
    if (candidate) id = candidate.id;
    else {
      const r = await post(sp, "/api/applications", {
        kind: "STUDY_CERTIFICATE",
        operationId: randomUUID(),
        purpose: "Демонстрационная справка для уведомлений",
        description: "",
      });
      expect(r.status()).toBe(200);
      id = (await r.json()).id;
      expect((await action(id, "TAKE")).status()).toBe(200);
      expect(
        (await action(id, "COMPLETE", "Демо готово без файла")).status(),
      ).toBe(409);
      const bytes = await readFile("demo/documents/demo-certificate.pdf");
      async function upload() {
        const d = await (
          await page.request.get(`/api/staff/applications/${id}`)
        ).json();
        const r = await page.request.post(
          `/api/staff/applications/${id}/documents`,
          {
            headers: { origin },
            multipart: {
              metadata: JSON.stringify({
                operationId: randomUUID(),
                expectedVersion: d.version,
                expectedCurrentDocumentId: d.currentDocumentId,
                demoConfirmed: true,
                ...(d.currentDocumentId
                  ? { reason: "Демонстрационная замена готовой справки" }
                  : {}),
              }),
              file: {
                name: "demo-certificate.pdf",
                mimeType: "application/pdf",
                buffer: bytes,
              },
            },
          },
        );
        expect(r.status()).toBe(200);
      }
      await upload();
      expect(
        (await notices(sp)).filter(
          (n) => n.target.href === `/applications/${id}`,
        ),
      ).toHaveLength(1);
      expect(
        (
          await action(id, "COMPLETE", "Демонстрационная справка готова")
        ).status(),
      ).toBe(200);
      await upload();
    }
    items = await notices(sp);
    const related = items.filter(
      (n) => n.target.href === `/applications/${id}`,
    );
    expect(related.filter((n) => n.kind === "CERTIFICATE_READY")).toHaveLength(
      1,
    );
    expect(
      related.filter((n) => n.kind === "CERTIFICATE_UPDATED"),
    ).toHaveLength(1);
    expect(
      related.filter((n) => n.kind === "APPLICATION_COMPLETED"),
    ).toHaveLength(0);
    const ready = related.find((n) => n.kind === "CERTIFICATE_READY")!,
      taken = related.find((n) => n.kind === "APPLICATION_TAKEN")!;
    expect(ready.readAt).toBeNull();
    const beforeGet = await sp.request.get(`/api/notifications/${ready.id}`);
    expect((await beforeGet.json()).notification.readAt).toBeNull();
    expect(
      (await op.request.get(`/api/notifications/${ready.id}`)).status(),
    ).toBe(404);
    expect(
      (await post(op, `/api/notifications/${ready.id}/read`, {})).status(),
    ).toBe(404);
    expect((await page.request.get("/api/notifications")).status()).toBe(403);
    await sp.goto("/notifications?filter=unread");
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
    await sp.locator(`a[href^="/notifications/${ready.id}?"]`).click();
    await expect(sp.getByText("Прочитано", { exact: true })).toBeVisible();
    await expect(sp.getByText(/Документ уже обновлён/)).toBeVisible();
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
    expect(
      (
        await sp.request.post(`/api/notifications/${ready.id}/read`, {
          headers: { origin: "https://foreign.invalid" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    const detail = await (
        await sp.request.get(`/api/applications/${id}`)
      ).json(),
      downloaded = await sp.request.get(`/api/applications/${id}/document`);
    expect(downloaded.status()).toBe(200);
    expect((await downloaded.body()).length).toBe(
      detail.currentDocument.byteSize,
    );
    expect(
      createHash("sha256")
        .update(await downloaded.body())
        .digest("hex"),
    ).toBe(detail.currentDocument.sha256);
    const originalGroup = (await (await sp.request.get("/api/group")).json())
      .id;
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
      const r = await sp.request.get(`/api/notifications/${ready.id}`),
        safe = await r.json();
      expect(r.status()).toBe(200);
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
        .selectOption(originalGroup);
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
    const approved = (await notices(sp)).filter(
      (n) =>
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
    await otherContext.close();
  }
});
