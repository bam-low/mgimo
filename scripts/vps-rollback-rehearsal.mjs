// Execute the real host procedure against the isolated restored database only.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
export async function rollbackRehearsal({
  dc,
  docker,
  root,
  project,
  candidate,
  fixture,
  toolJSON,
  call,
  json,
  ready,
  contract,
}) {
  const baseline = JSON.parse(
    await readFile(".runtime-evidence/vps-baseline.json", "utf8"),
  );
  assert.equal(
    baseline.rollbackSource,
    "f29c61109a761f2a20a0ecaf02ca6b7bf74f43c3",
  );
  assert.match(baseline.rollbackRuntime, /^sha256:[a-f0-9]{64}$/);
  const inspect = (service) => {
    const id = dc(["ps", "-a", "-q", service]).toString().trim();
    return JSON.parse(docker(["inspect", id]))[0];
  };
  const dbIdentity = () => {
    const d = inspect("db");
    return {
      id: d.Id,
      image: d.Image,
      startedAt: d.State.StartedAt,
      restarts: d.RestartCount,
    };
  };
  // No normalization of new columns: compare every saved row, including cancellationId.
  const snapshot = () =>
    toolJSON(
      `import pg from 'pg';import{createHash}from'node:crypto';const u=new URL(process.env.DATABASE_URL);u.pathname='/campus_restore_test';const c=new pg.Client({connectionString:u.href});await c.connect();const out={};for(const {tablename:t}of(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'RateBucket' ORDER BY tablename")).rows){if(!/^[A-Za-z_]+$/.test(t))throw Error('Unexpected table');const rows=(await c.query('SELECT to_jsonb(t) AS row FROM "'+t+'" t ORDER BY to_jsonb(t)::text')).rows;out[t]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}await c.end();console.log(JSON.stringify(out));`,
    );
  docker(["rm", "-f", project + "-restore-app"]);
  fixture(
    "cp /test/restored-runtime.env /test/secrets/runtime.env; chown 1000:1000 /test/secrets/runtime.env; chmod 600 /test/secrets/runtime.env",
  );
  dc(["up", "-d", "--no-deps", "--wait", "app"]);
  await ready();
  const directory = root + "/rollback-guard";
  await mkdir(directory, { mode: 0o700 });
  const current = await readFile(root + "/release.env", "utf8");
  await writeFile(directory + "/current.env", current, { mode: 0o600 });
  await writeFile(
    directory + "/target.env",
    current.replace(
      /^CAMPUS_APP_IMAGE=.*$/m,
      "CAMPUS_APP_IMAGE=" + baseline.rollbackRuntime,
    ),
    { mode: 0o600 },
  );
  await writeFile(
    directory + "/release.json",
    JSON.stringify({
      sourceCommit: baseline.rollbackSource,
      runtimeImage: baseline.rollbackRuntime,
      migrations: [...contract.baseline, ...contract.additive].slice(0, 9),
    }),
    { mode: 0o600 },
  );
  await writeFile(
    directory + "/compose.yaml",
    await readFile("ops/vps/compose.yaml"),
    { mode: 0o600 },
  );
  fixture(
    "chown -R 0:0 /test/rollback-guard; chmod 700 /test/rollback-guard; chmod 600 /test/rollback-guard/*",
  );
  const guard = () =>
    spawnSync(
      "sudo",
      [
        "-n",
        "python3",
        process.cwd() + "/ops/vps/rollback-app.py",
        "--current-env",
        directory + "/current.env",
        "--target-env",
        directory + "/target.env",
        "--target-manifest",
        directory + "/release.json",
        "--compose",
        directory + "/compose.yaml",
        "--project",
        project,
        "--owner-approved",
      ],
      { encoding: "utf8", timeout: 300000 },
    );
  const dbBefore = dbIdentity(),
    before = snapshot();
  const first = guard();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(inspect("app").Image, baseline.rollbackRuntime);
  await ready();
  await json("/api/notifications", "student1");
  assert.deepEqual(snapshot(), before);
  assert.deepEqual(dbIdentity(), dbBefore);
  console.log(
    "PASS f29c611: guarded old runtime starts before first cancellation; copy DB and PostgreSQL identity unchanged",
  );
  dc(["up", "-d", "--no-deps", "--wait", "app"]); // Resume compatible candidate on the same restored DB.
  await ready();
  const group = await json("/api/group", "student1");
  const create = await call("/api/staff/schedule", "staff", true, {
    action: "CREATE",
    groupId: group.id,
    title: "Проверка безопасного отката",
    teacher: "Вымышленный преподаватель",
    room: "Тестовая 909",
    day: "2098-12-29",
    start: "21:30",
    end: "22:30",
  });
  assert.equal(create.status, 200, create.body.toString());
  const lesson = JSON.parse(create.body.toString());
  const cancel = await call("/api/staff/schedule", "staff", true, {
    action: "CANCEL",
    id: lesson.id,
    version: 1,
  });
  assert.equal(cancel.status, 200, cancel.body.toString());
  const notices = await json("/api/notifications", "student1");
  assert.ok(notices.items.some((n) => n.kind === "SCHEDULE_CANCELLED"));
  const withCancellation = snapshot(),
    appBefore = inspect("app");
  assert.ok(withCancellation.ScheduleCancellation.count > 0);
  assert.ok(withCancellation.Notification.count > before.Notification.count);
  const second = guard();
  assert.equal(second.status, 2, second.stderr);
  assert.match(second.stderr, /SCHEDULE_CANCELLED/);
  const appAfter = inspect("app");
  assert.equal(appAfter.Id, appBefore.Id);
  assert.equal(appAfter.Image, candidate.runtime.Id);
  assert.equal(appAfter.State.Running, true);
  assert.deepEqual(snapshot(), withCancellation);
  assert.deepEqual(dbIdentity(), dbBefore);
  // Recovery retains the current compatible image and the same database, never an older backup.
  dc(["stop", "app"]);
  dc(["up", "-d", "--no-deps", "--wait", "app"]);
  await ready();
  assert.deepEqual(
    (await json("/api/notifications", "student1")).items,
    notices.items,
  );
  await json("/api/grades", "student1");
  assert.deepEqual(snapshot(), withCancellation);
  assert.deepEqual(dbIdentity(), dbBefore);
  console.log(
    "PASS SCHEDULE_CANCELLED: rollback refused before container switch; compatible-runtime recovery preserves every row, document byte/version, notification and audit; PostgreSQL never restarted",
  );
  return {
    status: "PASS",
    source: baseline.rollbackSource,
    runtimeImage: baseline.rollbackRuntime,
    database: "campus_restore_test",
    beforeCancellation: "OLD_RUNTIME_HEALTHY_DATA_UNCHANGED",
    afterCancellation: "BLOCKED_BEFORE_SWITCH",
    recovery: "COMPATIBLE_RUNTIME_SAME_DATABASE_ALL_ROWS_UNCHANGED",
    postgresql: dbBefore,
    checks: [
      "real-host-procedure",
      "protected-real-session-notifications",
      "full-row-hashes-including-documents-versions-audit",
      "container-ID-unchanged-on-refusal",
      "postgresql-ID-start-time-restarts-unchanged",
    ],
    before,
    after: withCancellation,
  };
}
