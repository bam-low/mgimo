import { runtimeTestEnv } from "./runtime-test-env.mjs";
import { URL } from "node:url";
// Restart real generated auth/group Functions; prove database session continuity.
import { readFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { setTimeout, clearTimeout } from "node:timers";
import path from "node:path";
import process from "node:process";
import assert from "node:assert/strict";
import console from "node:console";
const { fetch } = globalThis;
if (
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test") ||
  !process.env.DEMO_STUDENT1_PASSWORD
)
  throw Error("Dedicated seeded *_test DB required");
const root = (
  await readFile(".runtime-evidence/vercel-root.txt", "utf8")
).trim();
const entry = path.join(root, "functions/api/auth/[...all].func");
let child;
async function start() {
  child = fork(path.resolve("scripts/vercel-function-worker.mjs"), [entry], {
    cwd: entry,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
    env: {
      ...runtimeTestEnv(),
      NODE_ENV: "production",
      NODE_PATH: "",
      AUTH_TRUSTED_IP_HEADER: "x-vercel-forwarded-for",
      VERCEL_TEST_LOADS: path.resolve(".runtime-evidence/vercel-loads.jsonl"),
    },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Cold-start timeout")), 15000);
    child.once("message", ({ port }) => {
      clearTimeout(timer);
      resolve(port);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(Error("Cold-start worker exited"));
    });
  });
}
async function stop() {
  const current = child;
  await new Promise((resolve) => {
    current.once("exit", resolve);
    current.kill("SIGTERM");
  });
}
function headers(cookie = "") {
  return {
    origin: process.env.BETTER_AUTH_URL,
    "content-type": "application/json",
    cookie,
    "x-vercel-forwarded-for": "192.0.2.90",
  };
}
try {
  let port = await start();
  const response = await fetch(
    `http://127.0.0.1:${port}/api/auth/sign-in/email`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        email: "student1@example.test",
        password: process.env.DEMO_STUDENT1_PASSWORD,
      }),
    },
  );
  assert.equal(response.status, 200);
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  await stop();
  port = await start();
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/group`, {
        headers: headers(cookie),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/group?id=group-2`, {
        headers: headers(cookie),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/auth/sign-out`, {
        method: "POST",
        headers: headers(cookie),
        body: "{}",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`http://127.0.0.1:${port}/api/group`, {
        headers: headers(cookie),
      })
    ).status,
    401,
  );
  console.log(
    "PASS generated Function cold-start/restart: DB session persists, foreign group denied, logout revokes next request.",
  );
} finally {
  if (child && !child.killed) await stop();
}
