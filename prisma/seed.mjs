import {
  dayKey,
  monday,
  addDays,
  localInstant,
} from "../src/lib/schedule-time.ts";
import process from "node:process";
import console from "node:console";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, verifyPassword } from "better-auth/crypto";
if (process.env.ALLOW_DEMO_SEED !== "yes")
  throw Error(
    "Явно задайте ALLOW_DEMO_SEED=yes для отдельной демонстрационной или тестовой БД",
  );
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
      "Задайте три разных надёжных демонстрационных пароля через окружение",
    );
if (new Set(passwordKeys.map((k) => process.env[k])).size !== 3)
  throw Error(
    "Демонстрационные пароли должны различаться; существующие пароли не изменены",
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
        "Демонстрационные записи или реквизиты не соответствуют конфигурации. Пароли и права не сбрасывались. Используйте исходные приватные реквизиты либо отдельно разрешённую чистую демо-БД.",
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
        !group.program.active ||
        !group.program.faculty.active ||
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
      "Демонстрационная учебная структура не готова; существующие названия и история не перезаписаны",
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
  // First-preparation dated fixtures. Repeats never reopen edited/cancelled/deleted
  // lessons or roll them to a new week. Owner can edit dates through the real UI.
  const anchor = monday(dayKey(new Date(), "Europe/Moscow"));
  for (let group = 1; group <= 2; group++)
    for (const offset of [0, 1, 2, 3, 4])
      for (let slot = 0; slot < 3; slot++) {
        const id = `demo-lesson-${group}-${offset}-${slot}`;
        if (await db.scheduleEntry.findUnique({ where: { id } })) continue;
        const hour = 8 + slot * 3 + (group - 1),
          day = addDays(anchor, offset);
        await db.$transaction(async (tx) => {
          await tx.scheduleEntry.create({
            data: {
              id,
              groupId: "group-" + group,
              title: (group === 1
                ? [
                    "Теория вымышленных систем",
                    "Мастерская цифрового кампуса",
                    "Практикум проектирования",
                  ]
                : [
                    "История воображаемых городов",
                    "Лаборатория коммуникаций",
                    "Семинар исследователей",
                  ])[slot],
              teacher: "Демо-преподаватель " + group,
              room: `Демо ${group}0${slot + 1}`,
              startsAt: localInstant(
                day,
                `${hour.toString().padStart(2, "0")}:30`,
                "Europe/Moscow",
              ),
              endsAt: localInstant(
                day,
                `${(hour + 1).toString().padStart(2, "0")}:50`,
                "Europe/Moscow",
              ),
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: "demo-seed",
              universityId: "demo-university",
              targetId: id,
              action: "LESSON_DEMO_PREPARED",
              newGroupId: "group-" + group,
            },
          });
        });
      }
  // Initial applications are immutable fictional examples, never reset on seed.
  for (const [suffix, kind] of [
    ["001", "GENERAL_REQUEST"],
    ["002", "STUDY_CERTIFICATE"],
  ]) {
    const id = `00000000-0000-4000-8000-000000043${suffix}`;
    if (await db.application.findUnique({ where: { id } })) continue;
    const applicant = await db.user.findUniqueOrThrow({
      where: { email: "student1@example.test" },
      include: { memberships: true },
    });
    const membershipId = applicant.memberships[0].id;
    await db.$transaction(async (tx) => {
      await tx.application.create({
        data: {
          id,
          universityId: "demo-university",
          membershipId,
          submittedGroupId: "group-1",
          submittedGroupName:
            "Демо-факультет 1 / Демо-направление 1 / Демо-группа 1",
          kind,
          subject:
            kind === "GENERAL_REQUEST"
              ? "Демо вопрос об учебном практикуме"
              : "Демонстрационная справка об обучении",
          description:
            "Вымышленный пример обращения для локального знакомства с приложением.",
          ...(kind === "STUDY_CERTIFICATE"
            ? { purpose: "Вымышленный студенческий клуб" }
            : {}),
        },
      });
      await tx.applicationEvent.create({
        data: {
          id: randomUUID(),
          applicationId: id,
          universityId: "demo-university",
          actorId: applicant.id,
          eventType: "APPLICATION_SUBMITTED",
          toStatus: "SUBMITTED",
          applicationVersion: 1,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: applicant.id,
          universityId: "demo-university",
          targetId: id,
          action: "APPLICATION_SUBMITTED",
          reason: JSON.stringify({
            source: "fictional-demo-seed",
            membershipId,
            kind,
          }),
        },
      });
    });
  }
  console.log(
    "Вымышленная демонстрационная структура подготовлена; реквизиты не выводились.",
  );
} catch {
  console.error(
    "Не удалось проверить или подготовить демо-данные; пароли и права не сбрасывались. Проверьте приватную конфигурацию seed и отдельную демо-БД.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
