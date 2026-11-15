import { URL } from "node:url";
import { Buffer } from "node:buffer";
import console from "node:console";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
// Disposable synthetic rehearsal only. Real UI sessions, no forged cookies or rate resets.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import https from "node:https";
import assert from "node:assert/strict";
export function rehearsal({
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
}) {
  const started = performance.now();
  let auditBaselineIDs, auditEvent;
  const snapshotCode = (auditAdditions = 0) =>
    `import pg from 'pg';import {createHash} from 'node:crypto';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const tables=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;const out={};for(const {tablename:t} of tables){if(t==='RateBucket')continue;if(!/^[A-Za-z_]+$/.test(t))throw Error('Unexpected table');let rows=(await c.query('SELECT to_jsonb(t) AS row FROM "'+t+'" t ORDER BY to_jsonb(t)::text')).rows;const keep=${JSON.stringify(auditBaselineIDs ?? null)};if(t==='AuditLog'&&keep){const old=new Set(keep),extra=rows.filter(r=>!old.has(r.row.id));if(extra.length!==${auditAdditions})throw Error('Unexpected audit additions');const expected=${JSON.stringify(auditEvent ?? null)};for(const {row} of extra)for(const k of Object.keys(expected))if(row[k]!==expected[k])throw Error('Unexpected audit event');rows=rows.filter(r=>old.has(r.row.id));}out[t]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}await c.end();console.log(JSON.stringify(out));`;
  function toolJSON(code) {
    return JSON.parse(
      dc(
        [
          "run",
          "--rm",
          "-T",
          "--no-deps",
          "tools",
          "node",
          "--env-file=/run/secrets/migration.env",
          "--input-type=module",
        ],
        code,
      ).toString(),
    );
  }
  function snapshot(auditAdditions = 0) {
    return toolJSON(snapshotCode(auditAdditions));
  }
  async function call(url, account, auth = true) {
    let cookie;
    if (account) {
      const rows = JSON.parse(
        await readFile(root + "/upgrade-sessions/" + account + ".json", "utf8"),
      );
      assert.equal(rows.length, 1);
      assert.ok(rows[0].name.endsWith("session_token"));
      cookie = rows[0].name + "=" + rows[0].value;
    }
    return new Promise((resolve, reject) => {
      const r = https.get(
        "https://localhost:18443" + url,
        {
          ca,
          headers: {
            ...(auth
              ? {
                  Authorization:
                    "Basic " + Buffer.from("owner:" + gate).toString("base64"),
                }
              : {}),
            ...(cookie ? { Cookie: cookie } : {}),
          },
        },
        (s) => {
          const chunks = [];
          s.on("data", (b) => chunks.push(b));
          s.on("end", () =>
            resolve({ status: s.statusCode, body: Buffer.concat(chunks) }),
          );
        },
      );
      r.setTimeout(5000, () => r.destroy(Error("Rehearsal HTTP timeout")));
      r.on("error", reject);
    });
  }
  async function json(url, account) {
    const r = await call(url, account);
    assert.equal(r.status, 200);
    return JSON.parse(r.body.toString());
  }
  async function smoke() {
    assert.equal((await call("/", undefined, false)).status, 401);
    assert.equal((await call("/api/group")).status, 401);
    await json("/api/group", "student1");
    const grades = await json("/api/grades", "student1");
    await json("/api/staff/schedule/builder", "staff");
    assert.equal(
      (await call("/api/staff/schedule/builder", "student1")).status,
      403,
    );
    assert.equal((await call("/api/group?id=group-2", "student1")).status, 403);
    const apps = await json(
      "/api/applications?kind=STUDY_CERTIFICATE&status=COMPLETED",
      "student1",
    );
    assert.ok(apps.rows.length > 0);
    const doc = await call(
      "/api/applications/" + apps.rows[0].id + "/document",
      "student1",
    );
    assert.equal(doc.status, 200);
    const notices = await json("/api/notifications", "student1");
    assert.ok(notices.items.length > 0);
    return {
      documentRequestId: apps.rows[0].id,
      gradeIDs: grades.rows.map((r) => r.id).sort(),
      notificationIDs: notices.items.map((r) => r.id).sort(),
      documentSHA256: createHash("sha256").update(doc.body).digest("hex"),
      access: "PASS",
    };
  }
  async function configuration(app, tools, db) {
    let text = await readFile(root + "/release.env", "utf8");
    for (const [key, value] of Object.entries({
      CAMPUS_APP_IMAGE: app,
      CAMPUS_TOOLS_IMAGE: tools,
      CAMPUS_DB_IMAGE: db,
    }))
      text = text.replace(
        new RegExp("^" + key + "=.*$", "m"),
        key + "=" + value,
      );
    await writeFile(root + "/release.env", text, { mode: 0o600 });
  }
  async function ready() {
    let lastStatus = "connection unavailable";
    for (let n = 0; n < 60; n++) {
      try {
        lastStatus = (await call("/api/structure")).status;
        if (lastStatus === 200) return;
      } catch {
        /* Runtime is still starting. */
      }
      await delay(500);
    }
    throw Error("Rehearsal runtime not ready; last HTTP " + lastStatus);
  }
  let before, expected, recoveryStarted;
  async function freeze() {
    expected = await smoke();
    dc(["stop", "app"]);
    before = snapshot();
    const audit = toolJSON(
      `import pg from 'pg';const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();const ids=(await c.query('SELECT id FROM "AuditLog" ORDER BY id')).rows.map(r=>r.id);const event=(await c.query('SELECT "actorId","universityId","targetId",action,reason,"oldGroupId","newGroupId" FROM "AuditLog" WHERE action=$1 AND "targetId"=$2 ORDER BY "createdAt" DESC LIMIT 1',['DOCUMENT_DOWNLOAD_AUTHORIZED',${JSON.stringify(expected.documentRequestId)}])).rows[0];await c.end();console.log(JSON.stringify({ids,event}));`,
    );
    auditBaselineIDs = audit.ids;
    auditEvent = audit.event;
    assert.equal(auditEvent.action, "DOCUMENT_DOWNLOAD_AUTHORIZED");

    assert.ok(before.ApplicationDocument.count >= 2);
    assert.ok(before.Notification.count > 0);
    return before;
  }
  async function upgrade() {
    dc(["stop", "db"]);
    await configuration(
      candidate.runtime.Id,
      candidate.tools.Id,
      candidate.database.Id,
    );
    dc(["up", "-d", "--wait", "db"]);
    dc([
      "run",
      "--rm",
      "--no-deps",
      "tools",
      "node",
      "--input-type=module",
      "-e",
      runActions(["migrate", "grant", "check"]),
    ]);
    assert.deepEqual(snapshot(), before);
    dc(["up", "-d", "--wait", "app"]);
    await ready();
    assert.deepEqual(await smoke(), expected);
    dc(["stop", "app"]);
    await configuration(
      baseline.runtime.Id,
      candidate.tools.Id,
      candidate.database.Id,
    );
    dc(["up", "-d", "--wait", "app"]);
    await ready();
    assert.deepEqual(await smoke(), expected);
    dc(["stop", "app"]);
    assert.deepEqual(snapshot(2), before);
    await configuration(
      candidate.runtime.Id,
      candidate.tools.Id,
      candidate.database.Id,
    );
    console.log(
      "PASS baseline → RC database patch/migrate → genuine-session smoke → compatible old-app rollback; baseline history hashes unchanged; exactly two authorized download audit events appended",
    );
  }
  async function restored() {
    const code = snapshotCode().replace(
      "const c=new pg.Client({connectionString:process.env.DATABASE_URL});",
      `const u=new URL(process.env.DATABASE_URL);u.pathname='/campus_restore_test';const c=new pg.Client({connectionString:u.href});`,
    );
    const copy = JSON.parse(
      dc(
        [
          "run",
          "--rm",
          "-T",
          "--no-deps",
          "tools",
          "node",
          "--env-file=/run/secrets/migration.env",
          "--input-type=module",
        ],
        code,
      ).toString(),
    );
    assert.deepEqual(copy, before);
    let runtime = secret("runtime.env");
    runtime = runtime.replace(/^DATABASE_URL=(.*)$/m, (_, value) => {
      const u = new URL(value);
      u.pathname = "/campus_restore_test";
      return "DATABASE_URL=" + u.href;
    });
    await writeFile(root + "/restored-runtime.env", runtime, { mode: 0o600 });
    fixture(
      "chown 1000:1000 /test/restored-runtime.env; chmod 600 /test/restored-runtime.env",
    );
    dc(["rm", "-f", "app"]); // Stopped stateless fixture only; keep the source DB/volume.
    docker([
      "create",
      "--name",
      project + "-restore-app",
      "--network",
      project + "_private",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--user",
      "1000:1000",
      "--memory",
      "1g",
      "--memory-swap",
      "1g",
      "--cpus",
      "1",
      "--log-driver",
      "local",
      "--log-opt",
      "max-size=10m",
      "--log-opt",
      "max-file=3",
      "--pids-limit",
      "128",
      "--publish",
      "127.0.0.1:18300:3000",
      "--tmpfs",
      "/tmp:size=64m,uid=1000,gid=1000,mode=1700",
      "--tmpfs",
      "/app/.next/cache:size=64m,uid=1000,gid=1000,mode=0700",
      "--mount",
      "type=bind,source=" +
        root +
        "/restored-runtime.env,target=/run/secrets/runtime.env,readonly",
      "--mount",
      "type=bind,source=" +
        root +
        "/secrets/db-ca.pem,target=/run/secrets/db-ca.pem,readonly",
      candidate.runtime.Id,
    ]);
    docker([
      "network",
      "connect",
      "--alias",
      "app",
      project + "_edge",
      project + "-restore-app",
    ]);
    docker(["start", project + "-restore-app"]);
    await ready();
    assert.deepEqual(await smoke(), expected);
    const afterSmokeCode = snapshotCode(1).replace(
      "const c=new pg.Client({connectionString:process.env.DATABASE_URL});",
      `const u=new URL(process.env.DATABASE_URL);u.pathname='/campus_restore_test';const c=new pg.Client({connectionString:u.href});`,
    );
    assert.deepEqual(toolJSON(afterSmokeCode), before);
    console.log(
      "PASS fresh separate DB: full history/bytes/versions/notifications/readAt/ownership/session hashes and protected restored-app smoke",
    );
    const result = {
      status: "PASS",
      baselineSource: "287912fe19df75404b81dd36ea1df5bb62187c71",
      candidateImages: {
        runtimeImage: candidate.runtime.Id,
        toolsImage: candidate.tools.Id,
        databaseImage: candidate.database.Id,
      },
      baselineImages: {
        runtime: baseline.runtime.Id,
        tools: baseline.tools.Id,
        database: baseline.database.Id,
      },
      schema: "baseline-migrations-unchanged",
      tables: before,
      checks: [
        "baseline-populated-E2E",
        "stop-writes-encrypted-backup",
        "database17-patch-upgrade",
        "migrate-grant-check",
        "full-data-hashes",
        "protected-RC-smoke",
        "compatible-old-app-rollback",
        "fresh-separate-database-restore",
        "restored-app-smoke-real-sessions",
      ],
      expectedAuditAdditions: { upgradedAndRolledBack: 2, restoredCopy: 1 },
      restoreElapsedSeconds: Math.round(
        (performance.now() - recoveryStarted) / 1000,
      ),
      elapsedSeconds: Math.round((performance.now() - started) / 1000),
      limits:
        "Local isolated synthetic rehearsal; no real VPS/RF/owner signature; RateBucket excluded from immutable data hashes, never reset.",
    };
    await writeFile(
      ".runtime-evidence/vps-upgrade.json",
      JSON.stringify(result, null, 2) + "\n",
    );
  }
  return {
    freeze,
    upgrade,
    restored,
    beginRestore: () => {
      recoveryStarted = performance.now();
    },
  };
}
