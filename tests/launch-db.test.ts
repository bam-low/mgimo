import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { randomBytes, pbkdf2Sync, createHmac, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  grantRuntimePrivileges,
  checkRuntimePrivileges,
} from "../scripts/launch-db-policy.mjs";
const url = new URL(process.env.DATABASE_URL!);
if (!url.pathname.endsWith("_test") || url.username === "campus_runtime")
  throw Error("Dedicated admin *_test DB required");
const admin = new pg.Client({ connectionString: url.href });
let limited: pg.Client;
let created = false;
const password = randomBytes(32).toString("hex");
// PostgreSQL SCRAM verifier: plaintext never interpolated into a SQL statement.
const salt = randomBytes(16),
  salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
const clientKey = createHmac("sha256", salted).update("Client Key").digest();
const stored = createHash("sha256").update(clientKey).digest("base64");
const server = createHmac("sha256", salted)
  .update("Server Key")
  .digest("base64");
const verifier = `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}`;
const runtimeURL = new URL(url);
runtimeURL.username = "campus_runtime";
runtimeURL.password = password;
beforeAll(async () => {
  try {
    await admin.connect();
    const exists = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname='campus_runtime'",
    );
    if (exists.rowCount)
      throw Error("Existing role is not this test's fixture");
    await admin.query(
      `CREATE ROLE campus_runtime LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS PASSWORD '${verifier}'`,
    );
    created = true;
    await grantRuntimePrivileges(admin);
    limited = new pg.Client({ connectionString: runtimeURL.href });
    await limited.connect();
  } catch {
    throw Error(
      "Launch role bootstrap failed; private connection details suppressed",
    );
  }
});
afterAll(async () => {
  await limited?.end();
  if (created) {
    await admin.query(
      "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM campus_runtime",
    );
    await admin.query(
      'REVOKE UPDATE (reason) ON public."AuditLog" FROM campus_runtime',
    );
    await admin.query("REVOKE ALL ON SCHEMA public FROM campus_runtime");
    await admin.query(
      'REVOKE ALL ON DATABASE "' +
        url.pathname.slice(1).replaceAll('"', '""') +
        '" FROM campus_runtime',
    );
    await admin.query("DROP ROLE campus_runtime");
  }
  await admin.end();
});
it("grant is idempotent, authenticated runtime audit passes, pre-existing audit is unchanged", async () => {
  const wrongURL = new URL(runtimeURL);
  wrongURL.password = randomBytes(32).toString("hex");
  const wrongClient = new pg.Client({ connectionString: wrongURL.href });
  let denied = "";
  try {
    await wrongClient.connect();
  } catch (error) {
    denied = (error as { code: string }).code;
  } finally {
    await wrongClient.end().catch(() => {});
  }
  expect(denied).toBe("28P01");
  const before = (await admin.query('SELECT * FROM "AuditLog" ORDER BY id'))
    .rows;
  await grantRuntimePrivileges(admin);
  await checkRuntimePrivileges(limited);
  expect(
    (await limited.query("SELECT session_user AS name")).rows[0].name,
  ).toBe("campus_runtime");
  const after = (await admin.query('SELECT * FROM "AuditLog" ORDER BY id'))
    .rows;
  expect(JSON.stringify(before) === JSON.stringify(after)).toBe(true);
});
it("limited role cannot change structure/history, read migrations, DDL, escalate or disable audit", async () => {
  const owner =
    '"' + decodeURIComponent(url.username).replaceAll('"', '""') + '"';
  const statements = [
    'UPDATE "StudentGroup" SET name=name',
    'DELETE FROM "EnrollmentRequest"',
    'UPDATE "AuditLog" SET action=action',
    'DELETE FROM "AuditLog"',
    'TRUNCATE "AuditLog"',
    'SELECT * FROM "_prisma_migrations"',
    "CREATE TABLE public.forbidden_probe(id int)",
    "CREATE TEMP TABLE forbidden_probe(id int)",
    "CREATE SCHEMA forbidden_probe",
    "CREATE ROLE forbidden_probe",
    "SET ROLE " + owner,
    'ALTER TABLE "AuditLog" DISABLE TRIGGER immutable_audit',
    'DROP TRIGGER immutable_audit ON "AuditLog"; CREATE TRIGGER immutable_audit BEFORE UPDATE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation()',
    'DROP TRIGGER immutable_audit ON "AuditLog"; CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW WHEN (false) EXECUTE FUNCTION prevent_audit_mutation()',
    "SET session_replication_role=replica",
  ];
  for (const sql of statements) {
    await limited.query("BEGIN");
    let code = "";
    try {
      await limited.query(sql);
    } catch (error) {
      code = (error as { code: string }).code;
    } finally {
      await limited.query("ROLLBACK");
    }
    expect(code === "42501" || code === "P0001").toBe(true);
  }
  const before = (await admin.query('SELECT * FROM "AuditLog" ORDER BY id'))
    .rows;
  let immutable = false;
  try {
    await admin.query('UPDATE "AuditLog" SET action=action');
  } catch (error) {
    immutable = (error as { code: string }).code === "P0001";
  }
  expect(immutable).toBe(true);
  expect(
    JSON.stringify(before) ===
      JSON.stringify(
        (await admin.query('SELECT * FROM "AuditLog" ORDER BY id')).rows,
      ),
  ).toBe(true);
});
it("privilege audit fails closed on column grants, grant options, role membership and broken audit trigger", async () => {
  for (const sql of [
    'GRANT UPDATE (reason) ON "AuditLog" TO campus_runtime',
    'GRANT SELECT ON "User" TO campus_runtime WITH GRANT OPTION',
    "ALTER ROLE campus_runtime CREATEDB",
    "GRANT pg_read_all_data TO campus_runtime",
    "GRANT CREATE ON SCHEMA pg_catalog TO campus_runtime",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC",
    'ALTER TABLE "AuditLog" DISABLE TRIGGER immutable_audit',
    "CREATE TABLE public.unexpected_probe(id text)",
  ]) {
    await admin.query("BEGIN");
    await admin.query(sql);
    let failed = false;
    try {
      await checkRuntimePrivileges(admin);
    } catch {
      failed = true;
    } finally {
      await admin.query("ROLLBACK");
    }
    expect(failed).toBe(true);
  }
  await checkRuntimePrivileges(limited);
});
it("grant rolls back on unexpected column grants instead of concealing them or changing audit", async () => {
  const before = (await admin.query('SELECT * FROM "AuditLog" ORDER BY id'))
    .rows;
  await admin.query('GRANT UPDATE (reason) ON "AuditLog" TO campus_runtime');
  let failed = false;
  try {
    await grantRuntimePrivileges(admin);
  } catch {
    failed = true;
  } finally {
    await admin.query(
      'REVOKE UPDATE (reason) ON "AuditLog" FROM campus_runtime',
    );
  }
  expect(failed).toBe(true);
  await checkRuntimePrivileges(limited);
  expect(
    JSON.stringify(before) ===
      JSON.stringify(
        (await admin.query('SELECT * FROM "AuditLog" ORDER BY id')).rows,
      ),
  ).toBe(true);
});
it("real application signup, STAFF reject/retry/approve, foreign-group denial and logout work with limited role", () => {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.launch.config.mts",
    ],
    {
      encoding: "utf8",
      timeout: 25000,
      env: {
        ...process.env,
        DATABASE_URL: runtimeURL.href,
        DIRECT_DATABASE_URL: "",
        CAMPUS_LIMITED_PROBE: "yes",
        AUTH_TRUSTED_IP_HEADER: "x-limited-probe",
      },
    },
  );
  // Only booleans go to the parent report; child output can contain no owner secrets.
  expect(result.status === 0).toBe(true);
});
