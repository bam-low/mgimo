import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, copyFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
test("Nginx renderer rejects raw IP, injection, missing FQDN and refuses overwrite", async () => {
  const dir = await mkdtemp("/tmp/campus-vps-render-"),
    out = dir + "/closed.conf";
  for (const domain of [
    "192.0.2.3",
    "localhost",
    "campus.invalid;return 200;",
    "bad\nserver",
  ])
    assert.notEqual(
      spawnSync("python3", [
        "ops/vps/render_nginx.py",
        "--domain",
        domain,
        "--output",
        out,
      ]).status,
      0,
    );
  execFileSync("python3", [
    "ops/vps/render_nginx.py",
    "--domain",
    "campus.example.test",
    "--output",
    out,
  ]);
  const text = await readFile(out, "utf8");
  assert.match(text, /auth_basic_user_file/);
  assert.match(
    text,
    /proxy_set_header X-Forwarded-Host campus\.example\.test;/,
  );
  assert.match(text, /proxy_set_header Forwarded "";/);
  assert.match(text, /X-Campus-Client-IP \$remote_addr/);
  assert.match(text, /ssl_reject_handshake on/);
  assert.match(text, /proxy_pass http:\/\/127.0.0.1:3000/);
  assert.notEqual(
    spawnSync("python3", [
      "ops/vps/render_nginx.py",
      "--domain",
      "campus.example.test",
      "--output",
      out,
    ]).status,
    0,
  );
});
test("delivery needs independently pinned signer and rejects tampered payload/manifest", async () => {
  const dir = await mkdtemp("/tmp/campus-vps-sign-");
  execFileSync("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-f",
    dir + "/key",
  ]);
  const pub = await readFile(dir + "/key.pub", "utf8");
  await writeFile(dir + "/allowed_signers", "campus-release-owner " + pub);
  let manifest = "";
  for (const name of [
    "runtime.tar.gz",
    "tools.tar.gz",
    "database.tar.gz",
    "config.tar",
    "release.json",
  ]) {
    await writeFile(dir + "/" + name, "synthetic-test-only");
    manifest +=
      createHash("sha256").update("synthetic-test-only").digest("hex") +
      "  " +
      name +
      "\n";
  }
  await writeFile(dir + "/SHA256SUMS", manifest);
  execFileSync(
    "ssh-keygen",
    [
      "-Y",
      "sign",
      "-f",
      dir + "/key",
      "-n",
      "campus-vps-release",
      dir + "/SHA256SUMS",
    ],
    { stdio: "pipe" },
  );
  const verify = () =>
    spawnSync("bash", [
      "ops/vps/verify-delivery.sh",
      dir + "/allowed_signers",
      dir,
    ]);
  assert.equal(verify().status, 0);
  await writeFile(dir + "/runtime.tar.gz", "tampered");
  assert.notEqual(verify().status, 0);
  await writeFile(dir + "/runtime.tar.gz", "synthetic-test-only");
  await copyFile(dir + "/SHA256SUMS", dir + "/original");
  await writeFile(dir + "/SHA256SUMS", manifest + "extra");
  assert.notEqual(verify().status, 0);
  await copyFile(dir + "/original", dir + "/SHA256SUMS");
  await writeFile(dir + "/allowed_signers", "other-identity " + pub);
  assert.notEqual(verify().status, 0);
});
test("shell helpers parse; owner init and admin operations have no default deploy", () => {
  for (const name of [
    "init-secrets.sh",
    "backup.sh",
    "monitor.sh",
    "verify-delivery.sh",
  ])
    execFileSync("bash", ["-n", "ops/vps/" + name]);
  assert.notEqual(spawnSync("bash", ["ops/vps/init-secrets.sh"]).status, 0);
});
