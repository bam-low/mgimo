import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";
// Owner-only, separate tools image. Prepares the contest demo before the jury:
//   preview   — read only: what will be removed (counts) and a confirmation code;
//   apply     — one transaction: removes everything except the demo university,
//               its structure and the seeded accounts; renames «Демо Студент N»
//               to «Студент N». Runs only if the data still matches the preview code;
//   passwords — sets new demo passwords read from stdin (three lines: staff,
//               student1, student2). Nothing is printed back.
// Audit history (AuditLog) is immutable and is kept.

const UNIVERSITY = "demo-university";
const KEEP = [
  "staff@example.test",
  "student1@example.test",
  "student2@example.test",
];
const IMMUTABLE = [
  ["Notification", "immutable_notification_delete"],
  ["ApplicationDocument", "immutable_application_document"],
  ["ApplicationEvent", "immutable_application_event"],
  ["ScheduleCancellation", "immutable_cancellation"],
  ["ScheduleChange", "immutable_schedule_change"],
];
// Order matters: children before parents. Every academic/transient table is wiped.
const WIPE = [
  "AnnouncementRead",
  "Announcement",
  "GradeDismissal",
  "Grade",
  "Notification",
  "PortfolioItem",
  "DeadlineDone",
  "Deadline",
  "ExamGroup",
  "Exam",
  "ScheduleChange",
  "ApplicationDocument",
  "ApplicationEvent",
  "Application",
  "ScheduleCancellation",
  "ScheduleGroup",
  "ScheduleEntry",
  "TemplateGroup",
  "ScheduleTemplate",
  "TeachingAssignmentGroup",
  "TeachingAssignment",
  "TeacherSubject",
  "Teacher",
  "Room",
  "Subject",
  "Semester",
  "Verification",
  "RateLimit",
  "RateBucket",
];
const kept = `SELECT id FROM "User" WHERE email = ANY($1)`;
const keptMembership = `SELECT id FROM "UniversityMembership" WHERE "userId" IN (${kept})`;
// Accounts outside the kept list, children first.
const PEOPLE = [
  ["Session", `"userId" NOT IN (${kept})`],
  ["Account", `"userId" NOT IN (${kept})`],
  ["StudentProfile", `"membershipId" NOT IN (${keptMembership})`],
  ["GroupMembership", `"membershipId" NOT IN (${keptMembership})`],
  ["EnrollmentRequest", `"membershipId" NOT IN (${keptMembership})`],
  ["UniversityMembership", `"userId" NOT IN (${kept})`],
  ["User", `id NOT IN (${kept})`],
];
// Other universities (left by rehearsals/tests) and their structure, children first.
const OTHER = `SELECT id FROM "Faculty" WHERE "universityId" <> '${UNIVERSITY}'`;
const STRUCTURE = [
  [
    "StudentGroup",
    `"programId" IN (SELECT id FROM "Program" WHERE "facultyId" IN (${OTHER}))`,
  ],
  ["Program", `"facultyId" IN (${OTHER})`],
  ["Faculty", `"universityId" <> '${UNIVERSITY}'`],
  ["University", `id <> '${UNIVERSITY}'`],
];

function connection(value) {
  const u = new URL(value);
  if (
    u.hostname !== "db" ||
    u.pathname !== "/campus" ||
    u.searchParams.get("sslmode") !== "verify-full" ||
    u.searchParams.get("sslrootcert") !== "/run/secrets/db-ca.pem" ||
    [...u.searchParams.keys()].length !== 2
  )
    throw Error("Private verified TLS DB required");
  return value;
}
const q = (t) => '"' + t + '"';

export async function inventory(c) {
  if (
    !(await c.query(`SELECT 1 FROM "University" WHERE id = $1`, [UNIVERSITY]))
      .rowCount
  )
    throw Error("STOP: demo university not found");
  /** @type {Record<string, number>} */
  const counts = {};
  for (const t of WIPE)
    counts[t] = Number(
      (await c.query(`SELECT count(*) FROM ${q(t)}`)).rows[0].count,
    );
  for (const [t, where] of PEOPLE)
    counts[t + " (кроме демо-аккаунтов)"] = Number(
      (await c.query(`SELECT count(*) FROM ${q(t)} WHERE ${where}`, [KEEP]))
        .rows[0].count,
    );
  for (const [t, where] of STRUCTURE)
    counts[t + " (других вузов)"] = Number(
      (await c.query(`SELECT count(*) FROM ${q(t)} WHERE ${where}`)).rows[0]
        .count,
    );
  const keepRows = (
    await c.query(
      `SELECT email, name FROM "User" WHERE email = ANY($1) ORDER BY email`,
      [KEEP],
    )
  ).rows;
  const code = createHash("sha256")
    .update(JSON.stringify({ counts, keep: keepRows.map((r) => r.email) }))
    .digest("hex")
    .slice(0, 8);
  return { counts, keep: keepRows.map((r) => r.email), code };
}

/** One transaction; refuses to run if the data no longer matches the preview code. */
export async function applyReset(c, code) {
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL lock_timeout = '10s'");
    const inv = await inventory(c);
    if (inv.code !== code)
      throw Error("STOP: data changed since preview; run preview again");
    for (const [t, trg] of IMMUTABLE)
      await c.query(`ALTER TABLE ${q(t)} DISABLE TRIGGER ${trg}`);
    // Заявка и её текущий документ ссылаются друг на друга: сначала снять ссылку.
    // Готовую справку ограничение не отпускает без документа: в той же транзакции
    // вернуть её в «В работе», снять ссылку — следующая команда удалит строку.
    await c.query(
      `UPDATE "Application" SET status = 'IN_PROGRESS',
         "takenAt" = COALESCE("takenAt", "resolvedAt", now()),
         "takenById" = COALESCE("takenById", "resolvedById"),
         "resolvedAt" = NULL, "resolvedById" = NULL, "responseText" = NULL,
         "currentDocumentId" = NULL
       WHERE "currentDocumentId" IS NOT NULL`,
    );
    for (const t of WIPE) await c.query(`DELETE FROM ${q(t)}`);
    for (const [t, where] of PEOPLE)
      await c.query(`DELETE FROM ${q(t)} WHERE ${where}`, [KEEP]);
    for (const [t, where] of STRUCTURE)
      await c.query(`DELETE FROM ${q(t)} WHERE ${where}`);
    for (const [t, trg] of IMMUTABLE)
      await c.query(`ALTER TABLE ${q(t)} ENABLE TRIGGER ${trg}`);
    for (const n of [1, 2]) {
      const email = `student${n}@example.test`;
      await c.query(`UPDATE "User" SET name = $1 WHERE email = $2`, [
        `Студент ${n}`,
        email,
      ]);
      await c.query(
        `UPDATE "StudentProfile" SET "firstName" = 'Студент', "lastName" = $1
         WHERE "membershipId" IN (SELECT m.id FROM "UniversityMembership" m JOIN "User" u ON u.id = m."userId" WHERE u.email = $2)`,
        [String(n), email],
      );
    }
    const enabled = await c.query(
      `SELECT count(*) FROM pg_trigger WHERE tgname = ANY($1) AND tgenabled = 'O'`,
      [IMMUTABLE.map(([, trg]) => trg)],
    );
    if (Number(enabled.rows[0].count) !== IMMUTABLE.length)
      throw Error("STOP: immutable triggers not restored");
    await c.query("COMMIT");
    return inv;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

/** New passwords for staff, student1, student2 (in this order); old sessions end. */
export async function setPasswords(c, passwords) {
  if (
    passwords.length !== 3 ||
    passwords.some((p) => p.length < 12 || p.length > 128)
  )
    throw Error(
      "Need three passwords (staff, student1, student2), 12–128 characters each",
    );
  await c.query("BEGIN");
  try {
    let changed = 0;
    for (const [i, email] of KEEP.entries()) {
      const r = await c.query(
        `UPDATE "Account" SET password = $1, "updatedAt" = now()
         WHERE "providerId" = 'credential' AND "userId" = (SELECT id FROM "User" WHERE email = $2)`,
        [await hashPassword(passwords[i]), email],
      );
      changed += r.rowCount;
      await c.query(
        `DELETE FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE email = $1)`,
        [email],
      );
    }
    await c.query("COMMIT");
    return changed;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

let client;
if (process.argv[1]?.endsWith("demo-reset.mjs"))
  try {
    const [action, approval, flag, value] = process.argv.slice(2);
    if (
      approval !== "--owner-approved" ||
      !["preview", "apply", "passwords"].includes(action)
    )
      throw Error(
        "Usage: demo-reset.mjs preview|apply|passwords --owner-approved [--confirm CODE]",
      );
    process.loadEnvFile("/run/secrets/migration.env");
    client = new pg.Client({
      connectionString: connection(process.env.DATABASE_URL),
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    if (!client.connection.stream.authorized) throw Error("TLS not authorized");

    if (action === "preview") {
      await client.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const inv = await inventory(client);
      await client.query("ROLLBACK");
      console.log(
        "Останутся: демо-вуз, его учебная структура и аккаунты:",
        inv.keep.join(", ") || "—",
      );
      console.log("Будет удалено (строк):");
      for (const [k, n] of Object.entries(inv.counts))
        if (n) console.log("  " + k + ": " + n);
      console.log("История действий (AuditLog) сохраняется.");
      console.log("CONFIRM CODE " + inv.code);
    } else if (action === "apply") {
      if (flag !== "--confirm" || !/^[0-9a-f]{8}$/.test(value ?? ""))
        throw Error("Pass --confirm CODE from preview");
      const inv = await applyReset(client, value);
      console.log("PASS demo data reset; kept:", inv.keep.join(", "));
    } else {
      const lines = (
        await new Promise((resolve, reject) => {
          let data = "";
          process.stdin.setEncoding("utf8");
          process.stdin.on("data", (d) => (data += d));
          process.stdin.on("end", () => resolve(data));
          process.stdin.on("error", reject);
        })
      )
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const changed = await setPasswords(client, lines);
      console.log(
        "PASS demo passwords updated for " +
          changed +
          " account(s); nothing printed",
      );
    }
  } catch (e) {
    await client?.query("ROLLBACK").catch(() => {});
    const text =
      e instanceof Error && e.message.startsWith("STOP")
        ? e.message
        : e instanceof Error && e.message.startsWith("Usage")
          ? e.message
          : e instanceof Error && /^(Pass|Need)/.test(e.message)
            ? e.message
            : "STOP owner demo reset failed; nothing committed";
    console.error(text);
    process.exitCode = 1;
  } finally {
    await client?.end().catch(() => {});
  }
