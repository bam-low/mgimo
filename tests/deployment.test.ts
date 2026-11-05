import { afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { GET } from "../src/app/api/internal/rate-cleanup/route";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Deployment integration tests require *_test DB");
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await db.$disconnect();
});
it("fails closed for disabled/missing/forged cron authorization", async () => {
  const secret = randomUUID();
  vi.stubEnv("CRON_SECRET", "");
  expect(
    (await GET(new Request("http://localhost/api/internal/rate-cleanup")))
      .status,
  ).toBe(503);
  vi.stubEnv("CRON_SECRET", secret);
  for (const authorization of [
    "",
    "Bearer wrong",
    "Bearer " + "x".repeat(secret.length),
  ]) {
    const response = await GET(
      new Request("http://localhost/api/internal/rate-cleanup", {
        headers: { authorization },
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
});
it("authenticated idle maintenance removes only expired counters and tolerates repeats", async () => {
  const secret = randomUUID(),
    id = randomUUID();
  vi.stubEnv("CRON_SECRET", secret);
  await db.rateBucket.createMany({
    data: [
      { key: id + "old", expiresAt: new Date(0) },
      { key: id + "live", expiresAt: new Date(Date.now() + 3600000), count: 9 },
    ],
  });
  for (let i = 0; i < 2; i++)
    expect(
      (
        await GET(
          new Request("http://localhost/api/internal/rate-cleanup", {
            headers: { authorization: "Bearer " + secret },
          }),
        )
      ).status,
    ).toBe(200);
  expect(
    await db.rateBucket.findUnique({ where: { key: id + "old" } }),
  ).toBeNull();
  expect(
    (await db.rateBucket.findUniqueOrThrow({ where: { key: id + "live" } }))
      .count,
  ).toBe(9);
});
