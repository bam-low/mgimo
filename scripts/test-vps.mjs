import { disk } from "./vps-ci-lifecycle.mjs";
import { Buffer } from "node:buffer";
import { setTimeout } from "node:timers";
// Disposable local-only rehearsal. Never SSH, deploy, push or use owner secrets.
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  mkdir,
  readFile,
  copyFile,
} from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import https from "node:https";
import http from "node:http";
import assert from "node:assert/strict";
import { rehearsal } from "./vps-upgrade-rehearsal.mjs";
import { validate } from "../ops/vps/check-release.mjs";
const env = { ...process.env };
for (const k of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[k];
const docker = (args, input) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    input,
    maxBuffer: 100 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
const pg =
  "postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5";
const nginx =
  "nginx:stable-bookworm@sha256:552e7481ca93ffccd046aa658dbbed22caefbc09c66fa7cd247cbb90b8a5c609";
const root = await mkdtemp("/tmp/campus-vps-test-"),
  project = "campus24-test-" + process.pid;
disk("register-project", project);
const inspect = (name) => JSON.parse(docker(["image", "inspect", name]))[0];
const candidate = {
  runtime: inspect("campus24-runtime"),
  tools: inspect("campus24-tools"),
  database: inspect("campus24-db"),
};
const upgradeMode = process.env.CAMPUS_VPS_UPGRADE_REHEARSAL === "1";
const baselineData = upgradeMode
  ? JSON.parse(await readFile(".runtime-evidence/vps-baseline.json", "utf8"))
  : null;
if (baselineData)
  assert.equal(
    baselineData.sourceCommit,
    "287912fe19df75404b81dd36ea1df5bb62187c71",
  );
const baseline = baselineData
  ? {
      runtime: inspect(baselineData.runtime),
      tools: inspect(baselineData.tools),
      database: inspect(baselineData.db),
    }
  : candidate;
const { runtime, tools, database } = baseline;
const compose = [
  "compose",
  "--project-name",
  project,
  "--profile",
  "ops",
  "--env-file",
  root + "/release.env",
  "-f",
  "ops/vps/compose.yaml",
];
const dc = (a, input) => docker([...compose, ...a], input);
const fixture = (command) =>
  docker([
    "run",
    "--rm",
    "--user",
    "0",
    "--network",
    "none",
    "-v",
    root + ":/test",
    "-v",
    process.cwd() + "/ops/vps:/scripts:ro",
    "--entrypoint",
    "bash",
    pg,
    "-euc",
    command,
  ]);
let stage = "init";
try {
  await writeFile(
    root + "/release.env",
    `CAMPUS_DB_IMAGE=${database.Id}\nCAMPUS_APP_IMAGE=${runtime.Id}\nCAMPUS_TOOLS_IMAGE=${tools.Id}\nCAMPUS_APP_PORT=18300\nCAMPUS_SECRETS_DIR=${root}/secrets\n`,
    { mode: 0o600 },
  );
  fixture(
    "/scripts/init-secrets.sh --owner-approved-init /test/secrets https://localhost:18443",
  );
  const secret = (name) =>
    fixture("cat /test/secrets/" + name)
      .toString()
      .trim();
  const seed = Object.fromEntries(
    secret("migration.env")
      .split("\n")
      .map((x) => {
        const i = x.indexOf("=");
        return [x.slice(0, i), x.slice(i + 1)];
      }),
  );
  const gate = secret("gateway-password");
  const config = JSON.parse(dc(["config", "--format", "json"]));
  validate(config, {
    [runtime.Id]: runtime,
    [tools.Id]: tools,
    [database.Id]: database,
  });
  assert.equal(
    runtime.Config.Env.some((x) =>
      /^DEMO_|^DATABASE_URL=|^CRON_SECRET=|^BETTER_AUTH_SECRET=/.test(x),
    ),
    false,
  );
  docker([
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--entrypoint",
    "node",
    "-v",
    process.cwd() + "/ops/vps/image-check.mjs:/check.mjs:ro",
    runtime.Id,
    "/check.mjs",
    "/app",
  ]);
  execFileSync("python3", ["ops/vps/preflight.py", root + "/release.env"], {
    env,
    stdio: "pipe",
  });
  // A valid image must not permit a root override, even with Python assertions disabled.
  await mkdir(root + "/negative-preflight");
  await copyFile(
    "ops/vps/preflight.py",
    root + "/negative-preflight/preflight.py",
  );
  await writeFile(
    root + "/negative-preflight/compose.yaml",
    (await readFile("ops/vps/compose.yaml", "utf8")).replace(
      'user: "1000:1000"',
      'user: "0:0"',
    ),
  );
  const denied = spawnSync(
    "python3",
    ["-O", root + "/negative-preflight/preflight.py", root + "/release.env"],
    { env, stdio: "pipe" },
  );
  assert.notEqual(denied.status, 0);
  console.log(
    "PASS release constraints, host preflight including optimized-mode root rejection and final image file check",
  );
  fixture(
    'openssl req -new -newkey rsa:2048 -nodes -subj /CN=localhost -keyout /test/test.key -out /test/test.csr >/dev/null 2>&1; printf "subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n" > /test/test.ext; openssl x509 -req -sha256 -days 2 -in /test/test.csr -CA /test/secrets/db-ca.pem -CAkey /test/secrets/db-ca.key -CAcreateserial -extfile /test/test.ext -out /test/test.crt >/dev/null 2>&1; cp /test/secrets/htpasswd /test/htpasswd; chmod 644 /test/htpasswd /test/test.crt; chmod 600 /test/test.key; chmod 755 /test',
  );
  execFileSync("python3", [
    "ops/vps/render_nginx.py",
    "--domain",
    "localhost",
    "--local-test",
    "--output",
    root + "/nginx.conf",
  ]);
  // Create only the private network; gate is tested with NO app or DB running.
  dc(["create", "app"]);
  dc(["create", "db"]);
  docker([
    "run",
    "-d",
    "--name",
    project + "-nginx",
    "--network",
    project + "_edge",
    "-p",
    "127.0.0.1:18443:443",
    "-p",
    "127.0.0.1:18080:80",
    "-v",
    root + "/nginx.conf:/etc/nginx/conf.d/default.conf:ro",
    "-v",
    root + ":/etc/campus:ro",
    nginx,
  ]);
  const ca = secret("db-ca.pem");
  fixture(
    "openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=Untrusted-Test-CA -keyout /test/untrusted.key -out /test/untrusted.pem >/dev/null 2>&1",
  );
  const untrustedCA = fixture("cat /test/untrusted.pem");
  const request = (url, auth = false, headers = {}, badCA = false, body) =>
    new Promise((resolve, reject) => {
      const r = https.request(
        "https://localhost:18443" + url,
        {
          method: body ? "POST" : "GET",
          ca: badCA ? untrustedCA : ca,
          headers: {
            ...(body
              ? {
                  "Content-Type": "application/json",
                  Origin: "https://localhost:18443",
                }
              : {}),
            ...(auth
              ? {
                  Authorization:
                    "Basic " + Buffer.from("owner:" + gate).toString("base64"),
                }
              : {}),
            ...headers,
          },
        },
        (s) => {
          s.resume();
          s.on("end", () => resolve(s.statusCode));
        },
      );
      r.setTimeout(3000, () => r.destroy(Error("Local HTTPS timeout")));
      r.on("error", reject);
      r.end(body);
    });
  for (let n = 0; n < 30; n++) {
    try {
      await request("/");
      break;
    } catch (e) {
      if (n === 29) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const logProbe = "campus-query-canary-" + project;
  const redirect = await new Promise((resolve, reject) => {
    const r = http.get(
      "http://127.0.0.1:18080/register?" + logProbe,
      { headers: { Host: "localhost" } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    r.setTimeout(3000, () => r.destroy(Error("HTTP redirect timeout")));
    r.on("error", reject);
  });
  assert.equal(redirect, 308);
  assert.equal(await request("/login?" + logProbe), 401);
  const edgeLog = docker([
    "exec",
    project + "-nginx",
    "cat",
    "/var/log/nginx/campus-access.log",
  ]).toString();
  const defaultLog = docker(["logs", project + "-nginx"]).toString();
  assert.equal((edgeLog + defaultLog).includes(logProbe), false);
  for (const row of edgeLog.trim().split("\n"))
    assert.match(row, /^\S+ \d{3} [A-Z]+$/);
  console.log(
    "PASS HTTP canonical redirect and HTTP/TLS query/IP access-log minimization",
  );
  for (const path of [
    "/",
    "/login",
    "/register",
    "/api/auth/get-session",
    "/api/internal/rate-cleanup",
    "/_next/static/fake.js",
  ])
    assert.equal(await request(path), 401);
  await assert.rejects(request("/", false, {}, true));
  assert.equal(
    await request("/", true, {
      Authorization:
        "Basic " + Buffer.from("owner:wrong-password").toString("base64"),
    }),
    401,
  );
  console.log(
    "PASS anonymous gate BEFORE app deployment, all paths, wrong password and wrong TLS CA",
  );
  stage = "PostgreSQL bootstrap/migration";
  dc(["up", "-d", "--wait", "db"]);
  const runActions = (actions, guard = "") =>
    `import {spawnSync} from 'node:child_process';import {existsSync} from 'node:fs';${guard}for(const action of ${JSON.stringify(actions)}){const r=spawnSync(process.execPath,['ops/vps/admin.mjs',action,'--owner-approved'],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}`;
  dc([
    "run",
    "--rm",
    "--no-deps",
    "--volume",
    root + "/secrets/bootstrap.env:/run/secrets/bootstrap.env:ro",
    "tools",
    "node",
    "--input-type=module",
    "-e",
    runActions(["bootstrap", "bootstrap"]),
  ]);
  dc([
    "run",
    "--rm",
    "--no-deps",
    "tools",
    "node",
    "--input-type=module",
    "-e",
    runActions(
      ["migrate", "seed", "seed", "grant", "check"],
      "if(existsSync('/run/secrets/bootstrap.env')||existsSync('/run/secrets/runtime.env'))throw Error('Overprivileged migration mounts');",
    ),
  ]);
  console.log(
    "PASS migration job cannot read bootstrap credentials or auth/cron secrets",
  );
  // A wrong database password must fail on the actual TLS/SCRAM server.
  const wrong = `import pg from 'pg'; const u=new URL(process.env.DATABASE_URL);u.password='incorrect-test-password';const c=new pg.Client({connectionString:u.href});try{await c.connect();process.exitCode=1;}catch(e){if(e.code!=='28P01')process.exitCode=2;}finally{await c.end().catch(()=>{});}const plain=new URL(process.env.DATABASE_URL);plain.search='';const p=new pg.Client({connectionString:plain.href,ssl:false,connectionTimeoutMillis:5000});try{await p.connect();process.exitCode=1;}catch(e){if(e.code!=='28000')process.exitCode=2;}finally{await p.end().catch(()=>{});}`;
  dc([
    "run",
    "--rm",
    "--no-deps",
    "tools",
    "node",
    "--env-file=/run/secrets/runtime-db.env",
    "--input-type=module",
    "-e",
    wrong,
  ]);
  const noDDL = `import pg from 'pg';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();for(const q of ['CREATE TABLE public.forbidden_test(id int)','CREATE TEMP TABLE forbidden_test(id int)','ALTER TABLE "User" ADD COLUMN forbidden_test int','UPDATE "AuditLog" SET action=action','DELETE FROM "AuditLog"']){try{await c.query(q);throw Error('Unexpected privilege');}catch(e){if(!['42501','P0001'].includes(e.code))throw e;}}await c.end();`;
  dc([
    "run",
    "--rm",
    "--no-deps",
    "tools",
    "node",
    "--env-file=/run/secrets/runtime-db.env",
    "--input-type=module",
    "-e",
    noDDL,
  ]);
  console.log(
    "PASS real PG17 verified TLS/SCRAM, repeat bootstrap/seed, migrations, grants and negative permissions",
  );
  stage = "runtime and proxy";
  dc(["up", "-d", "--wait", "app"]);
  assert.equal(await request("/api/structure", true), 200);
  assert.equal(
    await request(
      "/api/auth/sign-in/email",
      true,
      {
        "X-Campus-Client-IP": "malformed, forged",
        "X-Forwarded-For": "192.0.2.8",
        "X-Forwarded-Host": "attacker.example.test",
        Forwarded: "for=192.0.2.8;host=attacker.example.test;proto=http",
      },
      false,
      JSON.stringify({
        email: "student1@example.test",
        password: "incorrect-test-password",
      }),
    ),
    401,
  );
  await assert.rejects(request("/", true, { Host: "unknown.example.test" }));
  assert.equal(await request("/api/internal/rate-cleanup"), 401);
  assert.equal(await request("/api/internal/rate-cleanup", true), 401);
  dc(["run", "--rm", "--no-deps", "cleanup"]);
  console.log("PASS private runtime, overwritten client IP, protected cleanup");
  stage = "Playwright through TLS gateway";
  const r = spawnSync(
    "npx",
    [
      "--no-install",
      "playwright",
      "test",
      "--config",
      "playwright.vps.config.ts",
    ],
    {
      env: {
        ...env,
        ...seed,
        DATABASE_URL: "postgresql://synthetic.invalid/campus_vps_test",
        BETTER_AUTH_URL: "https://localhost:18443",
        CAMPUS_VPS_GATE_PASSWORD: gate,
        ...(upgradeMode
          ? { CAMPUS_VPS_UPGRADE_SESSION_DIR: root + "/upgrade-sessions" }
          : {}),
      },
      stdio: "inherit",
    },
  );
  if (r.status !== 0) throw Error("VPS E2E failed");
  const upgradeProof = rehearsal({
    dc,
    docker,
    root,
    project,
    ca,
    gate,
    candidate,
    baseline,
    runActions,
    secret,
    fixture,
  });
  if (upgradeMode) await upgradeProof.freeze();
  else dc(["stop", "app"]);
  stage = "encrypted backup and restore";
  const dump = dc([
    "exec",
    "-T",
    "-u",
    "postgres",
    "db",
    "sh",
    "-c",
    'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec pg_dump -U campus_admin -d campus --format=custom --no-owner --no-acl',
  ]);
  // AGE_BIN is an owner-reviewed local binary; no key is sent to the server.
  const age = process.env.AGE_BIN ?? "age",
    keygen = process.env.AGE_KEYGEN_BIN ?? "age-keygen";
  execFileSync(keygen, ["-o", root + "/backup.key"], { stdio: "pipe" });
  const recipient = execFileSync(keygen, ["-y", root + "/backup.key"], {
    encoding: "utf8",
  }).trim();
  const encrypted = execFileSync(age, ["-r", recipient], {
    input: dump,
    maxBuffer: 100 * 1024 * 1024,
  });
  const restored = execFileSync(age, ["-d", "-i", root + "/backup.key"], {
    input: encrypted,
    maxBuffer: 100 * 1024 * 1024,
  });
  assert.deepEqual(restored, dump);
  const damaged = Buffer.from(encrypted);
  damaged[damaged.length - 1] ^= 1;
  assert.notEqual(
    spawnSync(age, ["-d", "-i", root + "/backup.key"], { input: damaged })
      .status,
    0,
  );
  if (upgradeMode) await upgradeProof.upgrade();
  if (upgradeMode) upgradeProof.beginRestore();
  dc([
    "exec",
    "-T",
    "-u",
    "postgres",
    "db",
    "sh",
    "-c",
    'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec createdb -U campus_admin -O campus_migrator campus_restore_test',
  ]);
  dc(
    [
      "exec",
      "-T",
      "-u",
      "postgres",
      "db",
      "sh",
      "-c",
      'export PGPASSWORD="$(cat /run/secrets/pg-admin-pw)"; exec pg_restore -U campus_admin -d campus_restore_test --role=campus_migrator --no-owner --no-acl --exit-on-error',
    ],
    restored,
  );
  const compare = `import {createHash} from 'node:crypto';import pg from 'pg';import {grantRuntimePrivileges,checkRuntimePrivileges} from './scripts/launch-db-policy.mjs'; const url=new URL(process.env.DATABASE_URL);const a=new pg.Client({connectionString:url.href});url.pathname='/campus_restore_test';const b=new pg.Client({connectionString:url.href});await a.connect();await b.connect();await grantRuntimePrivileges(b);await checkRuntimePrivileges(b);for(const table of ['User','Session','AuditLog','GroupMembership','EnrollmentRequest','Faculty','Program','StudentGroup','ScheduleEntry','Subject','Grade','Application','ApplicationDocument','ApplicationEvent','Notification','Semester','Teacher','Room','TeacherSubject','ScheduleTemplate','TemplateGroup','ScheduleGroup','TeachingAssignment','TeachingAssignmentGroup']){const q='SELECT count(*)::int AS n FROM "'+table+'"';if((await a.query(q)).rows[0].n!==(await b.query(q)).rows[0].n+(table==='AuditLog'&&${upgradeMode}?2:0))throw Error('Restore mismatch');}const noticesA=(await a.query('SELECT * FROM "Notification" ORDER BY id')).rows;const noticesB=(await b.query('SELECT * FROM "Notification" ORDER BY id')).rows;if(!noticesA.length||JSON.stringify(noticesA)!==JSON.stringify(noticesB)||!noticesB.some(n=>n.readAt))throw Error('Notification restore mismatch');let duplicateDenied=false;try{await b.query('INSERT INTO "Notification" SELECT $probe$restore-probe-$probe$||id,"universityId","recipientMembershipId",kind,"schemaVersion","sourceKey","enrollmentRequestId","applicationId","applicationEventId","createdAt","readAt" FROM "Notification" LIMIT 1');}catch(e){if(e.code!=='23505')throw e;duplicateDenied=true;}if(!duplicateDenied)throw Error('Notification restore dedup missing');for(const row of (await a.query('SELECT id,content,sha256 FROM "ApplicationDocument"')).rows){const copy=(await b.query('SELECT content,sha256 FROM "ApplicationDocument" WHERE id=$1',[row.id])).rows[0];if(!copy||!row.content.equals(copy.content)||row.sha256!==copy.sha256||createHash('sha256').update(copy.content).digest('hex')!==copy.sha256)throw Error('Document restore bytes mismatch');}const t=await b.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='immutable_audit'");if(t.rows[0].n!==1)throw Error('Audit trigger missing');await a.end();await b.end();`;
  dc([
    "run",
    "--rm",
    "--no-deps",
    "tools",
    "node",
    "--env-file=/run/secrets/migration.env",
    "--input-type=module",
    "-e",
    compare,
  ]);
  if (upgradeMode) await upgradeProof.restored();
  await mkdir(".runtime-evidence", { recursive: true });
  await writeFile(
    ".runtime-evidence/vps-test.txt",
    "PASS private-first HTTPS, TLS/SCRAM PG17, role negatives, seed twice, HTTPS E2E suite, authenticated cleanup, age integrity, separate DB restore/counts/immutable trigger. Local only, not VPS/RF.\n",
  );
  console.log(
    "PASS age encryption/integrity and fresh separate database restore; local rehearsal complete",
  );
} catch (e) {
  console.error(
    "FAIL VPS local rehearsal at " +
      stage +
      "; private fixture retained at " +
      root,
  );
  throw e;
} finally {
  try {
    docker(["rm", "-f", project + "-restore-app"]);
  } catch {
    /* Disposable container may not exist. */
  }
  try {
    docker(["rm", "-f", project + "-nginx"]);
  } catch {
    /* May not exist if preflight failed. */
  }
  dc(["down"]); // Preserve test volume for diagnosis; never remove a production volume.
}
