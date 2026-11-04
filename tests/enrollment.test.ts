import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { register, decide } from "../src/server/enrollment";
import { auth } from "../src/server/auth";
import { actor, studentAccess } from "../src/server/security";
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
)
  throw Error("Integration tests require a dedicated *_test database");
const origin = process.env.BETTER_AUTH_URL!;
const password = "Synthetic-test-" + randomUUID();
const input = () => ({
  firstName: "Тест",
  lastName: "Вымышленный",
  email: randomUUID() + "@example.test",
  password,
  universityId: "demo-university",
  facultyId: "faculty-1",
  programId: "program-1",
  groupId: "group-1",
});
const headers = new Headers({ origin });
async function login(email: string) {
  const r = await auth.api.signInEmail({
    headers,
    body: { email, password },
    asResponse: true,
  });
  expect(r.status).toBe(200);
  return new Headers({
    cookie: r.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; "),
  });
}
let staffId: string;
beforeAll(async () => {
  staffId = (
    await db.user.findUniqueOrThrow({ where: { email: "staff@example.test" } })
  ).id;
});
afterAll(async () => {
  await db.$disconnect();
});
describe("real PostgreSQL enrollment/security", () => {
  it("registers auth+domain atomically, pending denied, staff approves once under race, then session revoke denies", async () => {
    const d = input();
    await register(d, headers);
    const u = await db.user.findUniqueOrThrow({
      where: { email: d.email },
      include: { memberships: { include: { requests: true } } },
    });
    expect(await db.account.count({ where: { userId: u.id } })).toBe(1);
    const h = await login(d.email);
    const a = await actor(h);
    expect(() => studentAccess(a)).toThrow();
    const r = u.memberships[0].requests[0];
    const results = await Promise.allSettled([
      decide(staffId, d.universityId, r.id, "APPROVED", "Проверено"),
      decide(staffId, d.universityId, r.id, "APPROVED", "Повтор"),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(studentAccess(await actor(h)).groupId).toBe("group-1");
    const { GET } = await import("../src/app/api/group/route");
    expect(
      (
        await GET(
          new Request(origin + "/api/group?id=foreign-group", { headers: h }),
        )
      ).status,
    ).toBe(403);
    expect(
      await db.groupMembership.count({
        where: { membershipId: u.memberships[0].id, endedAt: null },
      }),
    ).toBe(1);
    const session = await auth.api.getSession({ headers: h });
    await auth.api.revokeSession({
      headers: h,
      body: { token: session!.session.token },
    });
    await expect(actor(h)).rejects.toThrow();
  });
  it("rejects self-STAFF and wrong hierarchy without orphan auth user", async () => {
    const d = input();
    await expect(register({ ...d, role: "STAFF" }, headers)).rejects.toThrow();
    await expect(
      register({ ...d, facultyId: "faculty-2" }, headers),
    ).rejects.toThrow();
    expect(await db.user.count({ where: { email: d.email } })).toBe(0);
  });
  it("rolls back User and Account when domain insertion fails after auth signup", async () => {
    const d = input();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION gate_fail_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected test failure'; END; $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER gate_fail BEFORE INSERT ON "UniversityMembership" FOR EACH ROW EXECUTE FUNCTION gate_fail_membership()`,
    );
    try {
      await expect(register(d, headers)).rejects.toThrow();
      expect(await db.user.count({ where: { email: d.email } })).toBe(0);
      expect(
        await db.enrollmentRequest.count({
          where: { membership: { user: { email: d.email } } },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER gate_fail ON "UniversityMembership"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION gate_fail_membership()");
    }
  });
  it("does not approve a group deactivated during PENDING", async () => {
    const d = input();
    await register(d, headers);
    const a = await actor(await login(d.email));
    await db.studentGroup.update({
      where: { id: "group-1" },
      data: { active: false },
    });
    try {
      await expect(
        decide(
          staffId,
          d.universityId,
          a.membership.requests[0].id,
          "APPROVED",
          "Недоступно",
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.enrollmentRequest.findUniqueOrThrow({
            where: { id: a.membership.requests[0].id },
          })
        ).status,
      ).toBe("PENDING");
      await decide(
        staffId,
        d.universityId,
        a.membership.requests[0].id,
        "REJECTED",
        "Группа недоступна",
      );
    } finally {
      await db.studentGroup.update({
        where: { id: "group-1" },
        data: { active: true },
      });
    }
  });
  it("keeps rejected history; new pending request can be submitted on the same membership", async () => {
    const d = input();
    await register(d, headers);
    const m = await db.universityMembership.findFirstOrThrow({
      where: { user: { email: d.email } },
      include: { requests: true },
    });
    await decide(
      staffId,
      d.universityId,
      m.requests[0].id,
      "REJECTED",
      "Выберите другую группу",
    );
    const { POST } = await import("../src/app/api/enrollment/route");
    const h = await login(d.email);
    h.set("origin", origin);
    h.set("content-type", "application/json");
    const response = await POST(
      new Request(origin + "/api/enrollment", {
        method: "POST",
        headers: h,
        body: JSON.stringify({ groupId: "group-2" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(
      await db.enrollmentRequest.count({ where: { membershipId: m.id } }),
    ).toBe(2);
    expect(
      (
        await db.enrollmentRequest.findUniqueOrThrow({
          where: { id: m.requests[0].id },
        })
      ).status,
    ).toBe("REJECTED");
  });
  it("rejects other university staff, anonymous access, disabled users and foreign group IDs", async () => {
    const d = input();
    await register(d, headers);
    const h = await login(d.email);
    const a = await actor(h);
    await expect(
      decide(
        a.user.id,
        "other",
        a.membership.requests[0].id,
        "APPROVED",
        "Нельзя",
      ),
    ).rejects.toThrow();
    await expect(actor(new Headers())).rejects.toThrow();
    await db.user.update({ where: { id: a.user.id }, data: { active: false } });
    await expect(actor(h)).rejects.toThrow();
  });
  it("transfer/revocation model keeps approved history and denies previous enrollment", async () => {
    const d = input();
    await register(d, headers);
    const h = await login(d.email);
    const a = await actor(h);
    await decide(
      staffId,
      d.universityId,
      a.membership.requests[0].id,
      "APPROVED",
      "Ок",
    );
    const old = studentAccess(await actor(h));
    await db.$transaction(async (tx) => {
      await tx.groupMembership.update({
        where: { id: old.id },
        data: { endedAt: new Date() },
      });
      await tx.groupMembership.create({
        data: {
          membershipId: a.membership.id,
          groupId: "group-2",
          sourceId: "test-staff-transfer",
        },
      });
    });
    expect(studentAccess(await actor(h)).groupId).toBe("group-2");
    const current = studentAccess(await actor(h));
    await db.groupMembership.update({
      where: { id: current.id },
      data: { revokedAt: new Date(), endedAt: new Date() },
    });
    const revoked = await actor(h);
    expect(() => studentAccess(revoked)).toThrow();
    expect(revoked.membership.status).toBe("APPROVED");
    expect(
      (
        await db.enrollmentRequest.findUniqueOrThrow({
          where: { id: a.membership.requests[0].id },
        })
      ).status,
    ).toBe("APPROVED");
  });
  it("rejects unauthenticated/CSRF requests and direct auth signup bypass", async () => {
    const { POST } = await import("../src/app/api/register/route");
    const response = await POST(
      new Request(origin + "/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input()),
      }),
    );
    expect(response.status).toBe(403);
    const { POST: authPost } = await import(
      "../src/app/api/auth/[...all]/route"
    );
    const blocked = await authPost(
      new Request(origin + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(input()),
      }),
    );
    expect(blocked.status).toBe(403);
  });
  it("parallel duplicate registration leaves a single coherent membership, not orphan users", async () => {
    const d = input();
    const result = await Promise.allSettled([
      register(d, headers),
      register(d, headers),
    ]);
    expect(result.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { email: d.email } })).toBe(1);
    expect(
      await db.universityMembership.count({
        where: { user: { email: d.email } },
      }),
    ).toBe(1);
    expect(
      await db.enrollmentRequest.count({
        where: { membership: { user: { email: d.email } } },
      }),
    ).toBe(1);
  });
  it("logout and expired session reject the next protected request", async () => {
    const d = input();
    await register(d, headers);
    let h = await login(d.email);
    await auth.api.signOut({ headers: h });
    await expect(actor(h)).rejects.toThrow();
    h = await login(d.email);
    await db.session.updateMany({
      where: { user: { email: d.email } },
      data: { expiresAt: new Date(0) },
    });
    await expect(actor(h)).rejects.toThrow();
  });
});
