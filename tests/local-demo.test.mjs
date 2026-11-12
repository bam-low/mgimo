import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
const script = path.resolve("scripts/local-demo.mjs");
test("local demo init creates private independent credentials, refuses overwrites and rejects unsafe reset arguments", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "campus-demo-config-"));
  try {
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
    assert.equal(run("init").status, 0);
    const before = await readFile(path.join(cwd, ".env.local"), "utf8");
    const secrets = before
      .split("\n")
      .filter((x) =>
        /^(BETTER_AUTH_SECRET|CRON_SECRET|DEMO_.*_PASSWORD)=/.test(x),
      )
      .map((x) => x.split("=")[1]);
    assert.equal(secrets.length, 5);
    assert.equal(new Set(secrets).size, 5);
    assert.equal(
      secrets.every((s) => /^[a-f0-9]{64}$/.test(s)),
      true,
    );
    assert.equal(
      (await stat(path.join(cwd, ".env.local"))).mode & 0o777,
      0o600,
    );
    assert.equal(
      (await stat(path.join(cwd, ".local-demo/postgres.env"))).mode & 0o777,
      0o600,
    );
    assert.notEqual(run("init").status, 0);
    assert.equal(
      (await readFile(path.join(cwd, ".env.local"), "utf8")) === before,
      true,
    );
    for (const args of [
      ["reset"],
      ["reset", "--confirm", "production", "--app-stopped"],
      ["reset", "--confirm", "campus_local_demo"],
    ])
      assert.notEqual(run(...args).status, 0);
    assert.equal(
      (await readFile(path.join(cwd, ".env.local"), "utf8")) === before,
      true,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test("reset refuses remote or disguised database URLs and unrecognised containers before database commands", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "campus-demo-reset-"));
  try {
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, PATH: cwd + path.delimiter + process.env.PATH },
      });
    assert.equal(run("init").status, 0);
    const envFile = path.join(cwd, ".env.local"),
      before = await readFile(envFile, "utf8");
    const mock = `#!${process.execPath}\nconst fs=require('node:fs');fs.appendFileSync(${JSON.stringify(path.join(cwd, "calls.jsonl"))},JSON.stringify(process.argv.slice(2))+'\\n');if(process.argv[2]==='inspect')process.stdout.write(fs.readFileSync(${JSON.stringify(path.join(cwd, "container.json"))}));\n`;
    await writeFile(path.join(cwd, "docker"), mock, { mode: 0o700 });
    const container = {
      Name: "/campus-local-demo",
      Config: {
        Labels: { "campus.local-demo": "campus_local_demo" },
        Image:
          "postgres:17-bookworm@sha256:839fbb5a4942a7758dd93e18b42ea5649807491a0545b5eeeb8f0b8bb11857a5",
      },
    };
    await writeFile(
      path.join(cwd, "container.json"),
      JSON.stringify([container]),
    );
    for (const hostile of [
      before.replace("@127.0.0.1:55433/", "@remote.example.test:55433/"),
      before.replace("/campus_local_demo\n", "/production\n") +
        "# @127.0.0.1:55433/campus_local_demo\n",
      before.replace("@127.0.0.1:55433/", "@127.0.0.1:5432/"),
    ]) {
      await writeFile(envFile, hostile);
      assert.notEqual(
        run("reset", "--confirm", "campus_local_demo", "--app-stopped").status,
        0,
      );
    }
    await writeFile(envFile, before);
    container.Config.Labels["campus.local-demo"] = "production";
    await writeFile(
      path.join(cwd, "container.json"),
      JSON.stringify([container]),
    );
    assert.notEqual(
      run("reset", "--confirm", "campus_local_demo", "--app-stopped").status,
      0,
    );
    const calls = (await readFile(path.join(cwd, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(
      calls.every((args) => args[0] === "inspect"),
      true,
    );
    assert.equal((await readFile(envFile, "utf8")) === before, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
