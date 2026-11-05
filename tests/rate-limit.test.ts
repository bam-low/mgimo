import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { db } from "../src/server/db";
import { register } from "../src/server/enrollment";
import {
  actor,
  cleanupRateBuckets,
  limited,
  requestSource,
} from "../src/server/security";
import { POST as registerPost } from "../src/app/api/register/route";
import { POST as authPost } from "../src/app/api/auth/[...all]/route";

if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Rate-limit tests require a dedicated *_test database");
const origin = process.env.BETTER_AUTH_URL!;
const trustedHeader = "x-test-ingress-ip";
const input = () => ({
  firstName: "Тест",
  lastName: "Вымышленный",
  email: randomUUID() + "@example.test",
  password: "Synthetic-test-" + randomUUID(),
  universityId: "demo-university",
  facultyId: "faculty-1",
  programId: "program-1",
  groupId: "group-1",
});
// TEST ONLY: emulate an ingress which replaces the incoming source header.
function request(path: string, source: string, body: unknown, cookie = "") {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      [trustedHeader]: source,
      "x-forwarded-for": randomUUID(),
      cookie,
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await db.$disconnect();
});

describe("rate-limit ingress trust and independent clients", () => {
  it("fails closed without a public ingress contract; ignores spoofed forwarding and Host", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://campus.example.test");
    vi.stubEnv("AUTH_TRUSTED_IP_HEADER", "");
    const req = request("/api/register", "192.0.2.1", {});
    req.headers.set("origin", "https://campus.example.test");
    req.headers.set("host", "localhost");
    req.headers.set("x-forwarded-for", "192.0.2.2");
    expect(() => requestSource(req)).toThrow();
    expect((await registerPost(req.clone())).status).toBe(503);
    const loginReq = request("/api/auth/sign-in/email", "192.0.2.1", {});
    loginReq.headers.set("origin", "https://campus.example.test");
    expect((await authPost(loginReq)).status).toBe(503);
    vi.stubEnv("AUTH_TRUSTED_IP_HEADER", trustedHeader);
    expect(requestSource(req)).toBe("192.0.2.1");
    req.headers.delete(trustedHeader);
    expect(() => requestSource(req)).toThrow();
    for (const value of ["unknown", "192.0.2.1, 192.0.2.2", "192.0.2.1:443"]) {
      req.headers.set(trustedHeader, value);
      expect(() => requestSource(req)).toThrow();
    }
    vi.stubEnv("AUTH_TRUSTED_IP_HEADER", "");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(requestSource(req)).toBe("local-demo");
  });
  it("canonicalizes equivalent IPv6 and IPv4-mapped sources", () => {
    vi.stubEnv("AUTH_TRUSTED_IP_HEADER", trustedHeader);
    expect(requestSource(request("/", "2001:0db8:0:0:0:0:0:1", {}))).toBe(
      requestSource(request("/", "2001:db8::1", {})),
    );
    expect(requestSource(request("/", "::ffff:192.0.2.1", {}))).toBe(
      "192.0.2.1",
    );
  });
  it("registration abuse and email attempts from A do not block B, including the same email", async () => {
    vi.stubEnv("AUTH_TRUSTED_IP_HEADER", trustedHeader);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 4);
    const a = `2001:db8:${suffix}::10`,
      b = `2001:db8:${suffix}::11`,
      d = input();
    for (let i = 0; i < 5; i++)
      expect(
        (await registerPost(request("/api/register", a, { email: d.email })))
          .status,
      ).toBe(400);
    expect((await registerPost(request("/api/register", a, d))).status).toBe(
      429,
    );
    expect((await registerPost(request("/api/register", b, d))).status).toBe(
      202,
    );
    for (let i = 0; i < 40; i++)
      await registerPost(request("/api/register", a, {}));
    expect(
      (await registerPost(request("/api/register", a, input()))).status,
    ).toBe(429);
    expect(
      (await registerPost(request("/api/register", b, input()))).status,
    ).toBe(202);
  });
  it("login abuse from A cannot block B or logout, and arbitrary XFF rotation does not bypass A's limit", async () => {
    vi.stubEnv("AUTH_TRUSTED_IP_HEADER", trustedHeader);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 4);
    const a = `2001:db8:${suffix}::20`,
      b = `2001:db8:${suffix}::21`,
      d = input();
    await register(d, new Headers({ origin }));
    const login = "/api/auth/sign-in/email";
    for (let i = 0; i < 10; i++)
      expect(
        (
          await authPost(
            request(login, a, {
              email: d.email,
              password: d.password + "wrong",
            }),
          )
        ).status,
      ).toBe(401);
    expect((await authPost(request(login, a, d))).status).toBe(429);
    const ok = await authPost(
      request(login, b, { email: d.email, password: d.password }),
    );
    expect(ok.status).toBe(200);
    const cookie = ok.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    expect((await actor(new Headers({ cookie }))).user.email).toBe(d.email);
    expect(
      (
        await db.session.findFirstOrThrow({
          where: { user: { email: d.email } },
        })
      ).ipAddress,
    ).toBe("");
    for (let i = 0; i < 20; i++) await authPost(request(login, a, {}));
    expect((await authPost(request(login, a, d))).status).toBe(429);
    expect(
      (
        await authPost(
          request(login, b, { email: d.email, password: d.password }),
        )
      ).status,
    ).toBe(200);
    // Even the exhausted source can end an existing valid session.
    expect(
      (await authPost(request("/api/auth/sign-out", a, {}, cookie))).status,
    ).toBe(200);
    await expect(actor(new Headers({ cookie }))).rejects.toThrow();
  });
});

describe("indexed expiring rate counters on real PostgreSQL", () => {
  it("cleans bounded batches at expiry, preserves live limits, and is safe under concurrent cleanup", async () => {
    while (await cleanupRateBuckets()) {
      /* Drain unrelated expired test counters first. */
    }
    const prefix = randomUUID(),
      now = new Date(),
      future = new Date(now.getTime() + 3600000);
    await db.rateBucket.createMany({
      data: Array.from({ length: 201 }, (_, i) => ({
        key: prefix + i,
        count: 2,
        expiresAt: new Date(now.getTime() - 1),
      })),
    });
    await db.rateBucket.createMany({
      data: [
        { key: prefix + "boundary", expiresAt: now },
        { key: prefix + "live", count: 9, expiresAt: future },
      ],
    });
    expect(await cleanupRateBuckets(now)).toBe(100);
    const results = await Promise.all([
      cleanupRateBuckets(now),
      cleanupRateBuckets(now),
    ]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(102);
    expect(
      await db.rateBucket.count({ where: { key: { startsWith: prefix } } }),
    ).toBe(1);
    expect(
      (
        await db.rateBucket.findUniqueOrThrow({
          where: { key: prefix + "live" },
        })
      ).count,
    ).toBe(9);
  });
  it("rolls windows forward and cleans expired buckets even when the current request is rejected", async () => {
    const key = randomUUID(),
      start = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(start);
    try {
      await limited(key, 1, 60000);
      const staleKey = randomUUID();
      await db.rateBucket.create({
        data: { key: staleKey, expiresAt: new Date(start - 1) },
      });
      await expect(limited(key, 1, 60000)).rejects.toMatchObject({
        status: 429,
      });
      expect(
        await db.rateBucket.findUnique({ where: { key: staleKey } }),
      ).toBeNull();
      vi.mocked(Date.now).mockReturnValue(
        (Math.floor(start / 60000) + 1) * 60000,
      );
      await expect(limited(key, 1, 60000)).resolves.toBeUndefined();
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("enforces a shared source atomically across concurrent requests", async () => {
    const key = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => limited(key, 3, 900000)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(9);
  });
  it("maintenance removes expired and legacy counters but leaves live counters intact", async () => {
    const prefix = randomUUID(),
      now = Date.now();
    await db.rateBucket.createMany({
      data: [
        { key: prefix + "expired", expiresAt: new Date(now - 1) },
        { key: prefix + "live", expiresAt: new Date(now + 3600000), count: 7 },
      ],
    });
    await db.rateLimit.createMany({
      data: [
        { key: prefix + "old", count: 5, lastRequest: BigInt(now - 3600000) },
        { key: prefix + "new", count: 5, lastRequest: BigInt(now) },
      ],
    });
    const command = spawnSync(
      process.execPath,
      ["scripts/cleanup-rate-buckets.mjs"],
      { encoding: "utf8", timeout: 30000 },
    );
    expect(command.status).toBe(0);
    expect(
      await db.rateBucket.findUnique({ where: { key: prefix + "expired" } }),
    ).toBeNull();
    expect(
      (
        await db.rateBucket.findUniqueOrThrow({
          where: { key: prefix + "live" },
        })
      ).count,
    ).toBe(7);
    expect(
      await db.rateLimit.findUnique({ where: { key: prefix + "old" } }),
    ).toBeNull();
    expect(
      await db.rateLimit.findUnique({ where: { key: prefix + "new" } }),
    ).not.toBeNull();
  });
});
