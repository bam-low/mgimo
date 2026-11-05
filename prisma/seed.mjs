import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, verifyPassword } from "better-auth/crypto";
if (process.env.ALLOW_DEMO_SEED !== "yes")
  throw Error("Set ALLOW_DEMO_SEED=yes explicitly on a dedicated demo/test DB");
const passwordKeys = [
  "DEMO_STAFF_PASSWORD",
  "DEMO_STUDENT1_PASSWORD",
  "DEMO_STUDENT2_PASSWORD",
];
for (const key of passwordKeys)
  if (
    !process.env[key] ||
    process.env[key].length < 12 ||
    process.env[key].length > 128
  )
    throw Error(
      "Provide three strong independent seed passwords through environment",
    );
if (new Set(passwordKeys.map((k) => process.env[k])).size !== 3)
  throw Error(
    "Seed passwords must be different; no existing passwords were changed",
  );
const fixtures = [
  ["staff@example.test", "Демо Сотрудник", "STAFF", 0, "DEMO_STAFF_PASSWORD"],
  [
    "student1@example.test",
    "Демо Студент Один",
    "STUDENT",
    1,
    "DEMO_STUDENT1_PASSWORD",
  ],
  [
    "student2@example.test",
    "Демо Студент Два",
    "STUDENT",
    2,
    "DEMO_STUDENT2_PASSWORD",
  ],
];
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  // A repeat verifies readiness, never repairs/reopens accounts or resets hashes.
  for (const [email, name, role, n, key] of fixtures) {
    const user = await db.user.findUnique({
      where: { email },
      include: {
        accounts: true,
        memberships: {
          include: {
            profile: true,
            university: true,
            enrollments: {
              where: { endedAt: null, revokedAt: null },
              include: { group: true },
            },
          },
        },
      },
    });
    if (!user) continue;
    const membership = user.memberships.find(
      (m) => m.universityId === "demo-university",
    );
    const account = user.accounts.find((a) => a.providerId === "credential");
    if (
      !user.active ||
      user.name !== name ||
      user.memberships.length !== 1 ||
      !membership?.university.active ||
      membership.role !== role ||
      membership.status !== "APPROVED" ||
      !account?.password ||
      !(await verifyPassword({
        hash: account.password,
        password: process.env[key],
      })) ||
      (n &&
        (membership.profile?.firstName !== "Демо" ||
          membership.profile?.lastName !== "Студент " + n ||
          membership.enrollments.length !== 1 ||
          membership.enrollments[0].groupId !== "group-" + n ||
          !membership.enrollments[0].group.active))
    )
      throw Error(
        "Existing seed fixtures are not ready or supplied credentials differ; no credentials or permissions reset. Use the original private credentials or an explicitly approved fresh demo DB.",
      );
  }
  await db.university.upsert({
    where: { id: "demo-university" },
    create: {
      id: "demo-university",
      name: "Вымышленный демонстрационный университет",
      timezone: "Europe/Moscow",
    },
    update: {},
  });
  for (let n = 1; n <= 2; n++) {
    await db.faculty.upsert({
      where: { id: "faculty-" + n },
      create: {
        id: "faculty-" + n,
        name: "Демо-факультет " + n,
        universityId: "demo-university",
      },
      update: {},
    });
    await db.program.upsert({
      where: { id: "program-" + n },
      create: {
        id: "program-" + n,
        name: "Демо-направление " + n,
        facultyId: "faculty-" + n,
      },
      update: {},
    });
    await db.studentGroup.upsert({
      where: { id: "group-" + n },
      create: {
        id: "group-" + n,
        name: "Демо-группа " + n,
        programId: "program-" + n,
      },
      update: {},
    });
  }
  const prepared = await db.studentGroup.findMany({
    where: { id: { in: ["group-1", "group-2"] } },
    include: {
      program: { include: { faculty: { include: { university: true } } } },
    },
  });
  if (
    prepared.length !== 2 ||
    prepared.some((group) => {
      const n = group.id === "group-1" ? 1 : 2;
      return (
        !group.active ||
        group.name !== "Демо-группа " + n ||
        group.programId !== "program-" + n ||
        group.program.name !== "Демо-направление " + n ||
        group.program.facultyId !== "faculty-" + n ||
        group.program.faculty.name !== "Демо-факультет " + n ||
        group.program.faculty.universityId !== "demo-university" ||
        !group.program.faculty.university.active ||
        group.program.faculty.university.name !==
          "Вымышленный демонстрационный университет"
      );
    })
  )
    throw Error(
      "Synthetic seed structure is not ready; no existing labels or history were overwritten",
    );
  for (const [email, name, role, n, key] of fixtures) {
    // Never reset passwords or reopen revoked memberships on a repeated seed.
    if (await db.user.findUnique({ where: { email } })) continue;
    const hash = await hashPassword(process.env[key]);
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { id: randomUUID(), name, email, emailVerified: true },
      });
      await tx.account.create({
        data: {
          id: randomUUID(),
          userId: u.id,
          accountId: u.id,
          providerId: "credential",
          password: hash,
        },
      });
      const m = await tx.universityMembership.create({
        data: {
          userId: u.id,
          universityId: "demo-university",
          role,
          status: "APPROVED",
          ...(role === "STUDENT"
            ? {
                profile: {
                  create: { firstName: "Демо", lastName: "Студент " + n },
                },
              }
            : {}),
        },
      });
      if (n) {
        const r = await tx.enrollmentRequest.create({
          data: {
            membershipId: m.id,
            targetGroupId: "group-" + n,
            status: "APPROVED",
            decidedBy: "demo-seed",
            decidedAt: new Date(),
          },
        });
        await tx.groupMembership.create({
          data: { membershipId: m.id, groupId: "group-" + n, sourceId: r.id },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: "demo-seed",
          universityId: "demo-university",
          targetId: m.id,
          action: "DEMO_PREPARED",
        },
      });
    });
  }
  console.log(
    "Fictional demo structure prepared; credentials were not printed.",
  );
} catch {
  console.error(
    "Demo seed verification/preparation failed; no passwords or permissions were reset. Check the private seed configuration and dedicated demo DB.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
